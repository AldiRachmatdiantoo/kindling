package habits

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const (
	MaxActivityRunes = 120
	MaxStruggleRunes = 200
)

// Pillars lists the three pillars a habit can belong to, in display order.
var Pillars = []string{"physical", "work", "soul"}

// Habit is one pillar's standing activity and, optionally, what usually gets in the way.
type Habit struct {
	Activity string `json:"activity"`
	Struggle string `json:"struggle"`
}

// HabitsData is the body of GET and PUT /api/v1/habits. A null pillar has no habit set.
type HabitsData struct {
	Physical *Habit `json:"physical"`
	Work     *Habit `json:"work"`
	Soul     *Habit `json:"soul"`
}

func (d *HabitsData) slot(pillar string) **Habit {
	switch pillar {
	case "physical":
		return &d.Physical
	case "work":
		return &d.Work
	default:
		return &d.Soul
	}
}

// Get returns the habit for pillar, or nil.
func (d HabitsData) Get(pillar string) *Habit { return *d.slot(pillar) }

// Validate trims every field and checks the limits. A pillar with an empty activity is
// cleared (its struggle is ignored), so sending "" removes that habit.
func (d HabitsData) Validate() (HabitsData, *shared.AppError) {
	out := HabitsData{}
	details := map[string]any{}
	for _, p := range Pillars {
		h := d.Get(p)
		if h == nil {
			continue
		}
		activity := strings.TrimSpace(h.Activity)
		struggle := strings.TrimSpace(h.Struggle)
		if activity == "" {
			continue
		}
		if utf8.RuneCountInString(activity) > MaxActivityRunes {
			details[p+".activity"] = fmt.Sprintf("must be at most %d characters", MaxActivityRunes)
			continue
		}
		if utf8.RuneCountInString(struggle) > MaxStruggleRunes {
			details[p+".struggle"] = fmt.Sprintf("must be at most %d characters", MaxStruggleRunes)
			continue
		}
		*out.slot(p) = &Habit{Activity: activity, Struggle: struggle}
	}
	if len(details) > 0 {
		return HabitsData{}, shared.ErrValidation("Invalid habits", details)
	}
	return out, nil
}

// ToAI converts the set habits into the map the AI layer reads.
func (d HabitsData) ToAI() ai.Habits {
	out := ai.Habits{}
	for _, p := range Pillars {
		if h := d.Get(p); h != nil {
			out[p] = ai.Habit{Activity: h.Activity, Struggle: h.Struggle}
		}
	}
	return out
}
