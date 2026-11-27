package checkin

import (
	"strings"
	"testing"

	"github.com/kindling/backend/pkg/ai"
)

func TestReflectRequestValidate(t *testing.T) {
	yes, no := true, false
	cases := []struct {
		name    string
		req     ReflectRequest
		wantErr string // detail key expected in the error, "" for valid
	}{
		{"valid", ReflectRequest{Text: "Too much on my plate.", Consent: &yes}, ""},
		{"consent false", ReflectRequest{Text: "Too much on my plate.", Consent: &no}, "consent"},
		{"consent missing", ReflectRequest{Text: "Too much on my plate."}, "consent"},
		{"empty text", ReflectRequest{Text: "   ", Consent: &yes}, "text"},
		{"text too long", ReflectRequest{Text: strings.Repeat("a", ai.MaxReflectTextRunes+1), Consent: &yes}, "text"},
		{"text at limit", ReflectRequest{Text: strings.Repeat("é", ai.MaxReflectTextRunes), Consent: &yes}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.req.Validate()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expected valid, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected a validation error")
			}
			if err.Code != "VALIDATION_ERROR" {
				t.Fatalf("code = %s", err.Code)
			}
			if _, ok := err.Details[tc.wantErr]; !ok {
				t.Fatalf("expected a detail for %q, got %v", tc.wantErr, err.Details)
			}
		})
	}
}

func TestBuildReflectFallback_DoesNotCopyText(t *testing.T) {
	text := "Marisol from accounting yelled about the Q3 invoice again and I cried in the parking lot."
	for _, tier := range []ai.CalibrationTier{ai.TierGentle, ai.TierBalanced, ai.TierStandard} {
		out := BuildReflectFallback(tier, text)
		if err := ai.ValidateReflectOutput(out, text); err != nil {
			t.Fatalf("%s: fallback must pass the validator: %v", tier, err)
		}
		joined := strings.ToLower(out.Reflection + " " + strings.Join(out.Themes, " "))
		for _, w := range []string{"marisol", "accounting", "invoice", "q3", "parking", "cried"} {
			if strings.Contains(joined, w) {
				t.Fatalf("%s: fallback copied %q", tier, w)
			}
		}
		if again := BuildReflectFallback(tier, text); again.Reflection != out.Reflection {
			t.Fatalf("%s: fallback must be deterministic", tier)
		}
	}
	if len(CrisisReflection) > ai.MaxReflectionRunes {
		t.Fatalf("crisis reflection is %d chars, limit %d", len(CrisisReflection), ai.MaxReflectionRunes)
	}
}
