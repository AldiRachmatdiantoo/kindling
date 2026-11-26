package wins

import (
	"strings"
	"testing"

	"github.com/kindling/backend/pkg/ai"
)

func TestSliceTaskRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid short", "Tulis pendahuluan laporan", false},
		{"valid exact 300 runes", strings.Repeat("a", 300), false},
		{"empty", "", true},
		{"whitespace only", "   \t\n ", true},
		{"exceeds 300 runes", strings.Repeat("a", 301), true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := (SliceTaskRequest{MainTask: tc.input}).Validate()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (val=%q)", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != strings.TrimSpace(tc.input) {
				t.Fatalf("expected trimmed %q, got %q", strings.TrimSpace(tc.input), got)
			}
		})
	}
}

func TestRecalibrateRequestValidate(t *testing.T) {
	for _, valid := range []string{"physical", "work", "soul"} {
		p, err := (RecalibrateRequest{Pillar: valid}).Validate()
		if err != nil || p != valid {
			t.Fatalf("expected valid pillar %q, got p=%q err=%v", valid, p, err)
		}
	}
	if _, err := (RecalibrateRequest{Pillar: "mind"}).Validate(); err == nil {
		t.Fatal("expected validation error for invalid pillar")
	}
}

func TestToggleWinRequestValidate(t *testing.T) {
	tr := true
	fa := false

	if _, _, err := (ToggleWinRequest{Pillar: "physical", Completed: nil}).Validate(); err == nil {
		t.Fatal("expected error when completed is nil")
	}
	if _, _, err := (ToggleWinRequest{Pillar: "invalid", Completed: &tr}).Validate(); err == nil {
		t.Fatal("expected error when pillar is invalid")
	}
	p, c, err := (ToggleWinRequest{Pillar: "work", Completed: &fa}).Validate()
	if err != nil || p != "work" || c != false {
		t.Fatalf("expected work/false/nil, got %q/%v/%v", p, c, err)
	}
}

func TestWinsDataCountCompletedAndPillarTarget(t *testing.T) {
	ms := "Kerjakan 5 menit pertama"
	w := WinsData{
		Physical: WinItem{Title: "Jalan 10 menit", Level: 1, Completed: true},
		Work:     WorkWinItem{Title: "Tugas utama", Level: 2, Completed: false, MicroStep: &ms},
		Soul:     WinItem{Title: "Istirahat layar", Level: 0, Completed: true},
	}

	if got := w.CountCompleted(); got != 2 {
		t.Fatalf("expected CountCompleted=2, got %d", got)
	}

	title, lvl, isMicro, err := w.PillarTarget(PillarWork)
	if err != nil {
		t.Fatalf("PillarTarget(work) err: %v", err)
	}
	if title != ms || lvl != 2 || !isMicro {
		t.Fatalf("expected micro_step target (%q, 2, true), got (%q, %d, %v)", ms, title, lvl, isMicro)
	}

	w.Work.MicroStep = nil
	title, lvl, isMicro, err = w.PillarTarget(PillarWork)
	if err != nil || title != "Tugas utama" || lvl != 2 || isMicro {
		t.Fatalf("expected work title target, got (%q, %d, %v, %v)", title, lvl, isMicro, err)
	}
}

func TestFallbacksPassAiValidators(t *testing.T) {
	for _, tier := range []ai.CalibrationTier{ai.TierGentle, ai.TierBalanced, ai.TierStandard} {
		out := BuildSliceTaskFallback(tier)
		if err := ai.ValidateSliceTaskOutput(out); err != nil {
			t.Fatalf("BuildSliceTaskFallback(%s) failed validation: %v", tier, err)
		}
	}

	for _, pillar := range []string{PillarPhysical, PillarWork, PillarSoul} {
		for level := 1; level <= MaxRecalibrateLevel; level++ {
			out := BuildRecalibrateFallback(pillar, level)
			if err := ai.ValidateRecalibrateOutput(out); err != nil {
				t.Fatalf("BuildRecalibrateFallback(%s, %d) failed validation: %v", pillar, level, err)
			}
		}
	}
}
