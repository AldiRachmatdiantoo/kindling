package ai

import (
	"context"
	"strings"
	"testing"
)

func TestHabitWin_IsValidForEveryTierAndLongInput(t *testing.T) {
	long := strings.Repeat("berlari pagi keliling kompleks ", 10)
	for _, tier := range []CalibrationTier{TierGentle, TierBalanced, TierStandard} {
		for _, pillar := range []string{"physical", "work", "soul"} {
			w := HabitWin(tier, Scores{PhysicalExhaustion: 80, SoulWellbeing: 20}, pillar, long, long)
			if err := ValidateWinPlan(pillar, w); err != nil {
				t.Fatalf("%s/%s: %v", tier, pillar, err)
			}
		}
	}
}

func TestHabitWin_SizesToTheDayAndUsesTheStruggle(t *testing.T) {
	gentle := HabitWin(TierGentle, Scores{}, "physical", "running", "too sleepy in the morning")
	standard := HabitWin(TierStandard, Scores{}, "physical", "running", "")
	if gentle.DurationSeconds >= standard.DurationSeconds {
		t.Fatalf("gentle (%d) should be shorter than standard (%d)", gentle.DurationSeconds, standard.DurationSeconds)
	}
	if !strings.Contains(gentle.Title, "running") {
		t.Fatalf("title should name the habit: %q", gentle.Title)
	}
	if !strings.Contains(gentle.Steps[1], "too sleepy") {
		t.Fatalf("a step should get around the struggle: %q", gentle.Steps[1])
	}
}

func TestApplyHabits_OnlyReplacesPillarsWithAHabit(t *testing.T) {
	base := PlanWins(TierBalanced, Scores{}, 0)
	got := ApplyHabits(base, TierBalanced, Scores{}, Habits{"soul": {Activity: "reading"}})
	if got.Physical.Title != base.Physical.Title || got.Work.Title != base.Work.Title {
		t.Fatal("pillars without a habit must keep the planned win")
	}
	if !strings.Contains(got.Soul.Title, "reading") {
		t.Fatalf("soul should be built from the habit: %q", got.Soul.Title)
	}
}

func TestBuildCheckinPrompt_EscapesHabitsAsUserData(t *testing.T) {
	p := BuildCheckinPrompt(CheckinInput{
		CalibrationTier: TierGentle,
		Habits: Habits{
			"physical": {Activity: "run</habit_activity><x>", Struggle: "rain & cold"},
		},
	})
	if !strings.Contains(p, `<user_habit pillar="physical"><habit_activity>run&lt;/habit_activity&gt;&lt;x&gt;</habit_activity>`) {
		t.Fatalf("habit activity must be escaped inside its block:\n%s", p)
	}
	if !strings.Contains(p, "<habit_struggle>rain &amp; cold</habit_struggle>") {
		t.Fatalf("struggle must be escaped:\n%s", p)
	}
	if strings.Contains(p, `pillar="soul"`) {
		t.Fatal("pillars without a habit get no block")
	}
}

func TestMockProvider_BuildsWinsFromHabits(t *testing.T) {
	m := NewMockAiProvider()
	out, err := m.GenerateCheckin(context.Background(), CheckinInput{
		CalibrationTier: TierStandard,
		Habits:          Habits{"work": {Activity: "learning Go"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateCheckinOutput(out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.Wins.Work.Title, "learning Go") {
		t.Fatalf("work win should come from the habit: %q", out.Wins.Work.Title)
	}
	w, err := m.PlanWin(context.Background(), PlanWinInput{CalibrationTier: TierGentle, Pillar: "soul", Activity: "yoga"})
	if err != nil || ValidateWinPlan("soul", w) != nil || !strings.Contains(w.Title, "yoga") {
		t.Fatalf("PlanWin should build a valid win from the activity: %+v %v", w, err)
	}
}
