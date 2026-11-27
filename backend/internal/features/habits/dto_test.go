package habits

import (
	"strings"
	"testing"
)

func TestValidate_TrimsClearsAndLimits(t *testing.T) {
	got, err := HabitsData{
		Physical: &Habit{Activity: "  run  ", Struggle: " lazy "},
		Work:     &Habit{Activity: "   ", Struggle: "ignored without an activity"},
	}.Validate()
	if err != nil {
		t.Fatal(err)
	}
	if got.Physical == nil || got.Physical.Activity != "run" || got.Physical.Struggle != "lazy" {
		t.Fatalf("physical should be trimmed: %+v", got.Physical)
	}
	if got.Work != nil || got.Soul != nil {
		t.Fatal("an empty activity clears the pillar")
	}
	if ai := got.ToAI(); len(ai) != 1 || ai["physical"].Activity != "run" {
		t.Fatalf("ToAI should only carry set pillars: %+v", ai)
	}

	_, err = HabitsData{Soul: &Habit{Activity: strings.Repeat("a", MaxActivityRunes+1)}}.Validate()
	if err == nil {
		t.Fatal("an over-long activity must be rejected")
	}
	_, err = HabitsData{Soul: &Habit{Activity: "read", Struggle: strings.Repeat("b", MaxStruggleRunes+1)}}.Validate()
	if err == nil {
		t.Fatal("an over-long struggle must be rejected")
	}
}
