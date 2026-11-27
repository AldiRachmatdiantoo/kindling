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
	"sync"
	"time"

	"github.com/sony/gobreaker/v2"
)

const (
	defaultGeminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"
	defaultGeminiModel   = "gemini-2.5-flash"
	defaultGeminiTimeout = 8 * time.Second

	// How long a model is skipped after it runs out of quota, when Google gives no retry delay.
	defaultQuotaCooldown = time.Hour
	// A retired model (404) is skipped for this long before it is tried again.
	unavailableCooldown = 6 * time.Hour
	maxQuotaCooldown    = 24 * time.Hour
)

// GeminiConfig configures GeminiProvider.
type GeminiConfig struct {
	APIKey string
	// Model is one model, or a comma-separated list tried in order: when a model runs out of
	// quota (429) or is gone (404), the next one answers, e.g. "gemini-2.5-flash,gemini-2.5-flash-lite".
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
	models     []string
	baseURL    string
	timeout    time.Duration
	httpClient *http.Client
	breaker    *gobreaker.CircuitBreaker[[]byte]
	now        func() time.Time

	mu        sync.Mutex
	skipUntil map[string]time.Time // model -> when it may be tried again
}

// ParseGeminiModels splits a comma-separated model list, dropping blanks and duplicates.
func ParseGeminiModels(s string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range strings.Split(s, ",") {
		m = strings.TrimSpace(m)
		if m != "" && !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	if len(out) == 0 {
		out = []string{defaultGeminiModel}
	}
	return out
}

func NewGeminiProvider(cfg GeminiConfig) *GeminiProvider {
	models := ParseGeminiModels(cfg.Model)
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
		models:     models,
		baseURL:    baseURL,
		timeout:    timeout,
		httpClient: client,
		breaker:    cb,
		now:        time.Now,
		skipUntil:  map[string]time.Time{},
	}
}

// Models returns the configured model chain, in the order it is tried.
func (g *GeminiProvider) Models() []string {
	return append([]string(nil), g.models...)
}

// availableModels is the chain minus models still cooling down. When every model is cooling
// down it returns the whole chain, so a quota that came back early is noticed.
func (g *GeminiProvider) availableModels() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	var out []string
	for _, m := range g.models {
		if until, ok := g.skipUntil[m]; ok && now.Before(until) {
			continue
		}
		out = append(out, m)
	}
	if len(out) == 0 {
		return g.models
	}
	return out
}

func (g *GeminiProvider) skipModel(model string, d time.Duration) {
	if d <= 0 {
		d = defaultQuotaCooldown
	}
	if d > maxQuotaCooldown {
		d = maxQuotaCooldown
	}
	g.mu.Lock()
	g.skipUntil[model] = g.now().Add(d)
	g.mu.Unlock()
}

// modelSkipError means this model cannot answer right now and the next one should be tried.
type modelSkipError struct {
	status   int
	cooldown time.Duration
}

func (e *modelSkipError) Error() string {
	return fmt.Sprintf("gemini api returned status %d", e.status)
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

func (g *GeminiProvider) PlanWin(ctx context.Context, in PlanWinInput) (WinPlan, error) {
	var out WinPlan
	_, err := g.breaker.Execute(func() ([]byte, error) {
		raw, err := g.generateJSON(ctx, planWinSystemInstruction, BuildPlanWinPrompt(in), winPlanSchema())
		if err != nil {
			return nil, err
		}
		var parsed WinPlan
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("unmarshal gemini plan win output: %w", err)
		}
		if err := ValidateWinPlan(in.Pillar, parsed); err != nil {
			return nil, fmt.Errorf("validate gemini plan win output: %w", err)
		}
		out = parsed
		return raw, nil
	})
	if err != nil {
		return WinPlan{}, err
	}
	return out, nil
}

func (g *GeminiProvider) Reflect(ctx context.Context, in ReflectInput) (ReflectOutput, error) {
	var out ReflectOutput
	_, err := g.breaker.Execute(func() ([]byte, error) {
		raw, err := g.generateJSON(ctx, reflectSystemInstruction, BuildReflectPrompt(in), reflectResponseSchema())
		if err != nil {
			return nil, err
		}
		var parsed ReflectOutput
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("unmarshal gemini reflect output: %w", err)
		}
		if err := ValidateReflectOutput(parsed, in.Text); err != nil {
			return nil, fmt.Errorf("validate gemini reflect output: %w", err)
		}
		out = parsed
		return raw, nil
	})
	if err != nil {
		return ReflectOutput{}, err
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

type geminiThinkingConfig struct {
	ThinkingBudget int `json:"thinkingBudget"`
}

type geminiGenerationConfig struct {
	Temperature      float64        `json:"temperature"`
	ResponseMimeType string         `json:"responseMimeType"`
	ResponseSchema   map[string]any `json:"responseSchema"`
	// ThinkingConfig turns off "thinking" on Flash models: these are short structured answers,
	// and thinking time can push a check-in past the timeout and into the template fallback.
	ThinkingConfig *geminiThinkingConfig `json:"thinkingConfig,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text    string `json:"text"`
				Thought bool   `json:"thought,omitempty"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func (g *GeminiProvider) generateJSON(ctx context.Context, systemPrompt, userPrompt string, schema map[string]any) ([]byte, error) {
	if g.apiKey == "" {
		return nil, errors.New("gemini api key is not configured")
	}

	var lastErr error
	for _, model := range g.availableModels() {
		text, err := g.callModel(ctx, model, systemPrompt, userPrompt, schema)
		var skip *modelSkipError
		if errors.As(err, &skip) {
			g.skipModel(model, skip.cooldown)
			lastErr = fmt.Errorf("%s: %w", model, err)
			continue
		}
		return text, err
	}
	return nil, fmt.Errorf("every gemini model is out of quota or unavailable: %w", lastErr)
}

func (g *GeminiProvider) callModel(ctx context.Context, model, systemPrompt, userPrompt string, schema map[string]any) ([]byte, error) {
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
			ThinkingConfig:   thinkingConfigFor(model),
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini request: %w", err)
	}

	endpoint := fmt.Sprintf("%s/models/%s:generateContent", g.baseURL, model)
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
	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return nil, &modelSkipError{status: resp.StatusCode, cooldown: retryDelayFrom(body)}
	case resp.StatusCode == http.StatusNotFound:
		return nil, &modelSkipError{status: resp.StatusCode, cooldown: unavailableCooldown}
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		return nil, fmt.Errorf("gemini api returned status %d", resp.StatusCode)
	}

	var parsed geminiResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("unmarshal gemini envelope: %w", err)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, errors.New("gemini returned empty candidates")
	}
	// The answer can arrive split over several parts; thought summaries are never part of it.
	var sb strings.Builder
	for _, part := range parsed.Candidates[0].Content.Parts {
		if !part.Thought {
			sb.WriteString(part.Text)
		}
	}
	text := strings.TrimSpace(sb.String())
	if text == "" {
		return nil, errors.New("gemini returned empty text")
	}
	return []byte(text), nil
}

// retryDelayFrom reads Google's RetryInfo ("retryDelay": "59828s") from a 429 body. A per-minute
// limit gives seconds, a per-day limit gives hours; zero means use the default cooldown.
func retryDelayFrom(body []byte) time.Duration {
	var env struct {
		Error struct {
			Details []struct {
				RetryDelay string `json:"retryDelay"`
			} `json:"details"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &env) != nil {
		return 0
	}
	for _, d := range env.Error.Details {
		if d.RetryDelay == "" {
			continue
		}
		if dur, err := time.ParseDuration(d.RetryDelay); err == nil && dur > 0 {
			return dur
		}
	}
	return 0
}

// thinkingConfigFor disables thinking on Gemini 2.5 Flash models, which accept a zero budget.
// Other models keep their default, since some of them reject a budget of 0.
func thinkingConfigFor(model string) *geminiThinkingConfig {
	if strings.Contains(model, "2.5-flash") {
		return &geminiThinkingConfig{ThinkingBudget: 0}
	}
	return nil
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
