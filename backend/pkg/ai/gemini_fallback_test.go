package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestParseGeminiModels(t *testing.T) {
	cases := map[string][]string{
		"":                                       {defaultGeminiModel},
		"gemini-2.5-flash":                       {"gemini-2.5-flash"},
		" a , b ,, a ":                           {"a", "b"},
		"gemini-2.5-flash,gemini-2.5-flash-lite": {"gemini-2.5-flash", "gemini-2.5-flash-lite"},
	}
	for in, want := range cases {
		if got := ParseGeminiModels(in); !reflect.DeepEqual(got, want) {
			t.Errorf("ParseGeminiModels(%q) = %v, want %v", in, got, want)
		}
	}
}

// quotaServer answers 429 (with a per-day retry delay) for models in exhausted, and a valid
// slice for the rest. It records which model each request went to.
type quotaServer struct {
	mu        sync.Mutex
	exhausted map[string]bool
	calls     []string
}

func (q *quotaServer) handler(t *testing.T) http.HandlerFunc {
	slice, _ := json.Marshal(SliceTaskOutput{MicroStep: "Open the document and write one heading.", DurationSeconds: 300})
	return func(w http.ResponseWriter, r *http.Request) {
		model := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/models/"), ":generateContent")
		q.mu.Lock()
		q.calls = append(q.calls, model)
		out := q.exhausted[model]
		q.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if out {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"3600s"}]}}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates": []map[string]any{{"content": map[string]any{"parts": []map[string]any{{"text": string(slice)}}}}},
		})
	}
}

func (q *quotaServer) takeCalls() []string {
	q.mu.Lock()
	defer q.mu.Unlock()
	c := q.calls
	q.calls = nil
	return c
}

func TestGeminiProvider_MovesToTheNextModelWhenQuotaRunsOut(t *testing.T) {
	q := &quotaServer{exhausted: map[string]bool{"gemini-2.5-flash": true}}
	srv := httptest.NewServer(q.handler(t))
	defer srv.Close()

	p := NewGeminiProvider(GeminiConfig{
		APIKey:  "k",
		Model:   "gemini-2.5-flash,gemini-2.5-flash-lite",
		BaseURL: srv.URL,
		Timeout: 2 * time.Second,
	})
	now := time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)
	p.now = func() time.Time { return now }
	in := SliceTaskInput{MainTask: "Finish the lab report", CalibrationTier: TierBalanced}

	if _, err := p.SliceTask(context.Background(), in); err != nil {
		t.Fatalf("expected the second model to answer, got %v", err)
	}
	if got := q.takeCalls(); !reflect.DeepEqual(got, []string{"gemini-2.5-flash", "gemini-2.5-flash-lite"}) {
		t.Fatalf("first call: tried %v", got)
	}

	// While the first model cools down it is not asked again.
	if _, err := p.SliceTask(context.Background(), in); err != nil {
		t.Fatal(err)
	}
	if got := q.takeCalls(); !reflect.DeepEqual(got, []string{"gemini-2.5-flash-lite"}) {
		t.Fatalf("during cooldown: tried %v", got)
	}

	// After Google's retry delay the first model is back in front.
	q.mu.Lock()
	q.exhausted = map[string]bool{}
	q.mu.Unlock()
	now = now.Add(61 * time.Minute)
	if _, err := p.SliceTask(context.Background(), in); err != nil {
		t.Fatal(err)
	}
	if got := q.takeCalls(); !reflect.DeepEqual(got, []string{"gemini-2.5-flash"}) {
		t.Fatalf("after cooldown: tried %v", got)
	}
}

func TestGeminiProvider_FailsWhenEveryModelIsOutOfQuota(t *testing.T) {
	q := &quotaServer{exhausted: map[string]bool{"a": true, "b": true}}
	srv := httptest.NewServer(q.handler(t))
	defer srv.Close()

	p := NewGeminiProvider(GeminiConfig{APIKey: "k", Model: "a,b", BaseURL: srv.URL, Timeout: 2 * time.Second})
	_, err := p.SliceTask(context.Background(), SliceTaskInput{MainTask: "x", CalibrationTier: TierGentle})
	if err == nil || !strings.Contains(err.Error(), "429") {
		t.Fatalf("expected a quota error, got %v", err)
	}
	if got := q.takeCalls(); !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Fatalf("tried %v", got)
	}
}

func TestRetryDelayFrom(t *testing.T) {
	if d := retryDelayFrom([]byte(`{"error":{"details":[{"retryDelay":"59828s"}]}}`)); d != 59828*time.Second {
		t.Errorf("got %v", d)
	}
	if d := retryDelayFrom([]byte(`not json`)); d != 0 {
		t.Errorf("got %v", d)
	}
}
