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

func TestCapWorkDuration_ALighterGoalNeverGetsALongerTimer(t *testing.T) {
	ptr := func(v int) *int { return &v }
	cases := []struct {
		name  string
		in    *int
		level int
		want  int
	}{
		{"model returned too long for level 1", ptr(600), 1, 300},
		{"within the level-1 limit is kept", ptr(240), 1, 240},
		{"level 2 caps at 180", ptr(300), 2, 180},
		{"level 3 caps at 60", ptr(120), 3, 60},
		{"missing duration gets the level limit", nil, 2, 180},
	}
	for _, c := range cases {
		if got := capWorkDuration(c.in, c.level); got == nil || *got != c.want {
			t.Errorf("%s: got %v, want %d", c.name, got, c.want)
		}
	}
}

func TestSplitInto_MovesTheFloorWhenTheSplitStepIsAtOrBeforeIt(t *testing.T) {
	steps := func() []string { return []string{"a", "b", "c", "d"} }

	before := WinItem{Steps: steps(), FloorStep: 3}
	splitInto(&before, 0, "a1", "a2")
	if got := strings.Join(before.Steps, ","); got != "a1,a2,b,c,d" || before.FloorStep != 4 {
		t.Fatalf("split before the floor: steps %s floor %d, want floor 4 (still c)", got, before.FloorStep)
	}

	atFloor := WinItem{Steps: steps(), FloorStep: 3}
	splitInto(&atFloor, 2, "c1", "c2")
	if got := strings.Join(atFloor.Steps, ","); got != "a,b,c1,c2,d" || atFloor.FloorStep != 4 {
		t.Fatalf("split of the floor: steps %s floor %d, want floor 4 (c2 finishes c)", got, atFloor.FloorStep)
	}

	after := WinItem{Steps: steps(), FloorStep: 2}
	splitInto(&after, 3, "d1", "d2")
	if after.FloorStep != 2 || len(after.Steps) != 5 {
		t.Fatalf("split after the floor must leave it: floor %d", after.FloorStep)
	}
}

func TestCheckSplit_OnlyTheCurrentStepAndNotPastTheCap(t *testing.T) {
	item := WinItem{Steps: []string{"a", "b", "c"}, FloorStep: 2, StepsDone: 1}
	if err := checkSplit(&item, 1); err != nil {
		t.Fatalf("the current step can be split: %v", err)
	}
	if err := checkSplit(&item, 0); err == nil {
		t.Fatal("a finished step cannot be split")
	}
	full := WinItem{Steps: make([]string, ai.MaxRoadmapSteps), FloorStep: 2}
	if err := checkSplit(&full, 0); err == nil {
		t.Fatal("a full roadmap cannot grow")
	}
}

func TestToggleWinItem_KeepsStepsDoneOnTheRightSideOfTheFloor(t *testing.T) {
	w := WinItem{Steps: []string{"a", "b", "c", "d"}, FloorStep: 3, StepsDone: 1}
	toggleWinItem(&w, true)
	if !w.Completed || w.StepsDone != 3 {
		t.Fatalf("marking done reaches the floor: done=%v steps=%d", w.Completed, w.StepsDone)
	}
	w.setStepsDone(4)
	toggleWinItem(&w, false)
	if w.Completed || w.StepsDone != 2 {
		t.Fatalf("undoing drops just below the floor: done=%v steps=%d", w.Completed, w.StepsDone)
	}
	plain := WinItem{}
	toggleWinItem(&plain, true)
	if !plain.Completed || plain.StepsDone != 0 {
		t.Fatal("a plain win only flips completed")
	}
}

func TestStepProgressRequestValidate(t *testing.T) {
	two, neg := 2, -1
	if _, _, err := (StepProgressRequest{Pillar: "work", StepsDone: &two}).Validate(); err == nil {
		t.Fatal("work has no roadmap")
	}
	if _, _, err := (StepProgressRequest{Pillar: "physical"}).Validate(); err == nil {
		t.Fatal("steps_done is required")
	}
	if _, _, err := (StepProgressRequest{Pillar: "soul", StepsDone: &neg}).Validate(); err == nil {
		t.Fatal("steps_done cannot be negative")
	}
	if p, n, err := (StepProgressRequest{Pillar: " physical ", StepsDone: &two}).Validate(); err != nil || p != "physical" || n != 2 {
		t.Fatalf("got %q %d %v", p, n, err)
	}
}
