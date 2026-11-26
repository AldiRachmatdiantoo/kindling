package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/sony/gobreaker/v2"
)

const (
	defaultGeminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"
	defaultGeminiModel   = "gemini-2.5-flash"
	defaultGeminiTimeout = 8 * time.Second
)

// GeminiConfig configures GeminiProvider.
type GeminiConfig struct {
	APIKey         string
	Model          string
	BaseURL        string
	Timeout        time.Duration
	HTTPClient     *http.Client
	BreakerTimeout time.Duration // Half-open wait duration; defaults to 30s (PRD §8.1).
}

// GeminiProvider calls the Gemini REST API with strict JSON schema, XML prompt guards,
// 8s timeout, output validation, and a gobreaker circuit breaker (PRD §8.1–8.2).
type GeminiProvider struct {
	apiKey     string
	model      string
	baseURL    string
	timeout    time.Duration
	httpClient *http.Client
	breaker    *gobreaker.CircuitBreaker[[]byte]
}

func NewGeminiProvider(cfg GeminiConfig) *GeminiProvider {
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = defaultGeminiModel
	}
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultGeminiBaseURL
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = defaultGeminiTimeout
	}
	breakerTimeout := cfg.BreakerTimeout
	if breakerTimeout <= 0 {
		breakerTimeout = 30 * time.Second
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout + time.Second}
	}

	cb := gobreaker.NewCircuitBreaker[[]byte](gobreaker.Settings{
		Name:        "gemini-ai",
		MaxRequests: 1,
		Timeout:     breakerTimeout,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5
		},
	})

	return &GeminiProvider{
		apiKey:     strings.TrimSpace(cfg.APIKey),
		model:      model,
		baseURL:    baseURL,
		timeout:    timeout,
		httpClient: client,
		breaker:    cb,
	}
}

// BreakerState exposes the current gobreaker state for diagnostics/testing.
func (g *GeminiProvider) BreakerState() gobreaker.State {
	return g.breaker.State()
}

func (g *GeminiProvider) GenerateCheckin(ctx context.Context, in CheckinInput) (CheckinOutput, error) {
	var out CheckinOutput
	_, err := g.breaker.Execute(func() ([]byte, error) {
		raw, err := g.generateJSON(ctx, checkinSystemInstruction, BuildCheckinPrompt(in), checkinResponseSchema())
		if err != nil {
			return nil, err
		}
		var parsed CheckinOutput
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("unmarshal gemini checkin output: %w", err)
		}
		if err := ValidateCheckinOutput(parsed); err != nil {
			return nil, fmt.Errorf("validate gemini checkin output: %w", err)
		}
		out = parsed
		return raw, nil
	})
	if err != nil {
		return CheckinOutput{}, err
	}
	return out, nil
}

func (g *GeminiProvider) SliceTask(ctx context.Context, in SliceTaskInput) (SliceTaskOutput, error) {
	var out SliceTaskOutput
	_, err := g.breaker.Execute(func() ([]byte, error) {
		raw, err := g.generateJSON(ctx, sliceTaskSystemInstruction, BuildSliceTaskPrompt(in), sliceTaskResponseSchema())
		if err != nil {
			return nil, err
		}
		var parsed SliceTaskOutput
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("unmarshal gemini slice task output: %w", err)
		}
		if err := ValidateSliceTaskOutput(parsed); err != nil {
			return nil, fmt.Errorf("validate gemini slice task output: %w", err)
		}
		out = parsed
		return raw, nil
	})
	if err != nil {
		return SliceTaskOutput{}, err
	}
	return out, nil
}

func (g *GeminiProvider) Recalibrate(ctx context.Context, in RecalibrateInput) (RecalibrateOutput, error) {
	var out RecalibrateOutput
	_, err := g.breaker.Execute(func() ([]byte, error) {
		raw, err := g.generateJSON(ctx, recalibrateSystemInstruction, BuildRecalibratePrompt(in), recalibrateResponseSchema())
		if err != nil {
			return nil, err
		}
		var parsed RecalibrateOutput
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("unmarshal gemini recalibrate output: %w", err)
		}
		if err := ValidateRecalibrateOutput(parsed); err != nil {
			return nil, fmt.Errorf("validate gemini recalibrate output: %w", err)
		}
		out = parsed
		return raw, nil
	})
	if err != nil {
		return RecalibrateOutput{}, err
	}
	return out, nil
}

type geminiRequest struct {
	SystemInstruction *geminiContent         `json:"systemInstruction,omitempty"`
	Contents          []geminiContent        `json:"contents"`
	GenerationConfig  geminiGenerationConfig `json:"generationConfig"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenerationConfig struct {
	Temperature      float64        `json:"temperature"`
	ResponseMimeType string         `json:"responseMimeType"`
	ResponseSchema   map[string]any `json:"responseSchema"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func (g *GeminiProvider) generateJSON(ctx context.Context, systemPrompt, userPrompt string, schema map[string]any) ([]byte, error) {
	if g.apiKey == "" {
		return nil, errors.New("gemini api key is not configured")
	}

	callCtx, cancel := context.WithTimeout(ctx, g.timeout)
	defer cancel()

	reqBody := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		Contents: []geminiContent{
			{
				Role:  "user",
				Parts: []geminiPart{{Text: userPrompt}},
			},
		},
		GenerationConfig: geminiGenerationConfig{
			Temperature:      0.3,
			ResponseMimeType: "application/json",
			ResponseSchema:   schema,
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini request: %w", err)
	}

	endpoint := fmt.Sprintf("%s/models/%s:generateContent", g.baseURL, g.model)
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.apiKey)

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini http call: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return nil, fmt.Errorf("read gemini response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gemini api returned status %d", resp.StatusCode)
	}

	var parsed geminiResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("unmarshal gemini envelope: %w", err)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, errors.New("gemini returned empty candidates")
	}
	text := strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text)
	if text == "" {
		return nil, errors.New("gemini returned empty text")
	}
	return []byte(text), nil
}

func checkinResponseSchema() map[string]any {
	return map[string]any{
		"type":     "OBJECT",
		"required": []string{"diagnostic_summary", "cope_options", "wins"},
		"properties": map[string]any{
			"diagnostic_summary": map[string]any{"type": "STRING"},
			"cope_options": map[string]any{
				"type":     "ARRAY",
				"minItems": 3,
				"maxItems": 3,
				"items": map[string]any{
					"type":     "OBJECT",
					"required": []string{"id", "title", "brief_cope_category", "tool_type", "duration_seconds", "guidance"},
					"properties": map[string]any{
						"id":                  map[string]any{"type": "STRING"},
						"title":               map[string]any{"type": "STRING"},
						"brief_cope_category": map[string]any{"type": "STRING", "enum": BriefCopeCategoryList()},
						"tool_type":           map[string]any{"type": "STRING", "enum": ToolTypeList()},
						"duration_seconds":    map[string]any{"type": "INTEGER"},
						"guidance":            map[string]any{"type": "STRING"},
					},
				},
			},
			"wins": map[string]any{
				"type":     "OBJECT",
				"required": []string{"physical", "work", "soul"},
				"properties": map[string]any{
					"physical": winPlanSchema(),
					"work":     winPlanSchema(),
					"soul":     winPlanSchema(),
				},
			},
		},
	}
}

func winPlanSchema() map[string]any {
	return map[string]any{
		"type":     "OBJECT",
		"required": []string{"title", "why_this", "steps", "duration_seconds"},
		"properties": map[string]any{
			"title":    map[string]any{"type": "STRING"},
			"why_this": map[string]any{"type": "STRING"},
			"steps": map[string]any{
				"type":     "ARRAY",
				"minItems": WinStepsCount,
				"maxItems": WinStepsCount,
				"items":    map[string]any{"type": "STRING"},
			},
			"duration_seconds": map[string]any{"type": "INTEGER"},
		},
	}
}

func sliceTaskResponseSchema() map[string]any {
	return map[string]any{
		"type":     "OBJECT",
		"required": []string{"micro_step", "duration_seconds"},
		"properties": map[string]any{
			"micro_step":       map[string]any{"type": "STRING"},
			"duration_seconds": map[string]any{"type": "INTEGER"},
		},
	}
}

func recalibrateResponseSchema() map[string]any {
	return map[string]any{
		"type":     "OBJECT",
		"required": []string{"new_title"},
		"properties": map[string]any{
			"new_title":        map[string]any{"type": "STRING"},
			"duration_seconds": map[string]any{"type": "INTEGER"},
		},
	}
}
