package checkin

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/kindling/backend/pkg/ai"
)

func TestDetectCrisis(t *testing.T) {
	tests := []struct {
		name  string
		texts []string
		want  bool
	}{
		{"indonesian phrase exact", []string{"rasanya ingin bunuh diri"}, true},
		{"indonesian mixed case & spacing", []string{"Aku   INGIN   MATI aja rasanya..."}, true},
		{"indonesian self harm", []string{"kadang kepikiran menyakiti diri sendiri"}, true},
		{"english self-harm hyphenated", []string{"having thoughts of self-harm tonight"}, true},
		{"english kill myself in fun_cope", []string{"capek banget", "kill myself"}, true},
		{"benign burnout text", []string{"Deadline numpuk, kurang tidur tiga hari, badan rasanya remuk.", "Main gitar 10 menit"}, false},
		{"empty text", []string{"", "   "}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := DetectCrisis(tc.texts...); got != tc.want {
				t.Errorf("DetectCrisis(%q) = %v, want %v", tc.texts, got, tc.want)
			}
		})
	}
}

func TestBuildCheckinFallback_AllTiersValid(t *testing.T) {
	tiers := []ai.CalibrationTier{ai.TierGentle, ai.TierBalanced, ai.TierStandard}
	for _, tier := range tiers {
		t.Run(string(tier), func(t *testing.T) {
			out := BuildCheckinFallback(tier)
			if err := ai.ValidateCheckinOutput(out); err != nil {
				t.Fatalf("fallback for tier %q failed validation: %v", tier, err)
			}
		})
	}
}

func TestCheckinRequest_Validate(t *testing.T) {
	validAnswers := func() map[string]json.RawMessage {
		return map[string]json.RawMessage{
			"cbi_1":      json.RawMessage("4"),
			"cbi_2":      json.RawMessage("3"),
			"cbi_3":      json.RawMessage("4"),
			"olbi_ex_1":  json.RawMessage("4"),
			"olbi_ex_2":  json.RawMessage("3"),
			"olbi_dis_1": json.RawMessage("2"),
			"olbi_dis_2": json.RawMessage("2"),
			"who5_1":     json.RawMessage("2"),
			"who5_2":     json.RawMessage("1"),
		}
	}

	t.Run("valid payload", func(t *testing.T) {
		req := CheckinRequest{
			LogDate:      "2026-11-26",
			Answers:      validAnswers(),
			BrainDump:    "Capek tapi masih bisa lanjut pelan-pelan.",
			FunCopeInput: "Main gitar 10 menit",
		}
		ans, err := req.Validate()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ans.CBI1 != 4 || ans.WHO52 != 1 {
			t.Fatalf("unexpected parsed answers: %+v", ans)
		}
	})

	t.Run("rejects extra unknown key", func(t *testing.T) {
		a := validAnswers()
		a["extra_key"] = json.RawMessage("2")
		req := CheckinRequest{LogDate: "2026-11-26", Answers: a}
		if _, err := req.Validate(); err == nil {
			t.Fatal("expected validation error for extra key")
		}
	})

	t.Run("rejects missing key", func(t *testing.T) {
		a := validAnswers()
		delete(a, "who5_2")
		req := CheckinRequest{LogDate: "2026-11-26", Answers: a}
		if _, err := req.Validate(); err == nil {
			t.Fatal("expected validation error for missing key")
		}
	})

	t.Run("rejects out-of-range and float values", func(t *testing.T) {
		a := validAnswers()
		a["cbi_1"] = json.RawMessage("5")
		a["cbi_2"] = json.RawMessage("2.5")
		req := CheckinRequest{LogDate: "2026-11-26", Answers: a}
		if _, err := req.Validate(); err == nil {
			t.Fatal("expected validation error for out-of-range / float")
		}
	})

	t.Run("rejects text exceeding max runes", func(t *testing.T) {
		req := CheckinRequest{
			LogDate:      "2026-11-26",
			Answers:      validAnswers(),
			BrainDump:    strings.Repeat("a", MaxBrainDumpRunes+1),
			FunCopeInput: strings.Repeat("b", MaxFunCopeRunes+1),
		}
		if _, err := req.Validate(); err == nil {
			t.Fatal("expected validation error for oversized text")
		}
	})
}
