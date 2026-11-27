package wins

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/kindling/backend/internal/shared"
)

const (
	PillarPhysical = "physical"
	PillarWork     = "work"
	PillarSoul     = "soul"

	MaxMainTaskRunes    = 300
	MaxRecalibrateLevel = 3
)

// IsValidPillar returns true if pillar is one of physical, work, or soul.
func IsValidPillar(pillar string) bool {
	switch pillar {
	case PillarPhysical, PillarWork, PillarSoul:
		return true
	default:
		return false
	}
}

// RecalibratedWhyThis replaces a card's reason once the user asks for something lighter.
const RecalibratedWhyThis = "You asked for something lighter, so here is a smaller version. Any step still counts."

// WinItem represents the physical or soul win JSONB object (PRD §5.1). why_this, steps and
// duration_seconds make the card ready to run; older rows may not have them.
type WinItem struct {
	Title           string   `json:"title"`
	WhyThis         string   `json:"why_this,omitempty"`
	Steps           []string `json:"steps,omitempty"`
	DurationSeconds *int     `json:"duration_seconds"`
	Level           int      `json:"level"`
	Completed       bool     `json:"completed"`
	// Habit is the user's activity this win was built from; empty when the AI picked it.
	Habit string `json:"habit,omitempty"`
	// Swapped marks a win the user traded for another activity, for today only.
	Swapped bool `json:"swapped,omitempty"`
}

// WorkWinItem represents the work win JSONB object with AI Task Slicer fields (PRD §5.1).
// duration_seconds is the focus timer: the plan's length at first, the micro-step's once sliced.
type WorkWinItem struct {
	Title           string   `json:"title"`
	WhyThis         string   `json:"why_this,omitempty"`
	Steps           []string `json:"steps,omitempty"`
	Level           int      `json:"level"`
	Completed       bool     `json:"completed"`
	MainTask        *string  `json:"main_task"`
	MicroStep       *string  `json:"micro_step"`
	DurationSeconds *int     `json:"duration_seconds"`
	// StepsDone counts micro-steps finished before the current one (progressive slicing).
	StepsDone int `json:"steps_done,omitempty"`
	// Habit is the user's activity this win was built from; empty when the AI picked it.
	Habit string `json:"habit,omitempty"`
}

// WinsData matches the wins_data JSONB structure in PRD §5.1.
type WinsData struct {
	Physical WinItem     `json:"physical"`
	Work     WorkWinItem `json:"work"`
	Soul     WinItem     `json:"soul"`
}

// CountCompleted recomputes wins_completed_count (0..3) directly from WinsData (PRD §5.1 & §7.4).
func (w WinsData) CountCompleted() int16 {
	var count int16
	if w.Physical.Completed {
		count++
	}
	if w.Work.Completed {
		count++
	}
	if w.Soul.Completed {
		count++
	}
	return count
}

// PillarTarget returns the active title/micro_step, current level, and whether work has an active micro_step.
func (w WinsData) PillarTarget(pillar string) (currentTitle string, level int, isWorkMicroStep bool, err error) {
	switch pillar {
	case PillarPhysical:
		return w.Physical.Title, w.Physical.Level, false, nil
	case PillarWork:
		if w.Work.MicroStep != nil && strings.TrimSpace(*w.Work.MicroStep) != "" {
			return strings.TrimSpace(*w.Work.MicroStep), w.Work.Level, true, nil
		}
		return w.Work.Title, w.Work.Level, false, nil
	case PillarSoul:
		return w.Soul.Title, w.Soul.Level, false, nil
	default:
		return "", 0, false, shared.ErrValidation("Invalid pillar", map[string]any{
			"pillar": "must be one of: physical, work, soul",
		})
	}
}

// SliceTaskRequest is the payload for POST /api/v1/wins/{date}/slice-task (PRD §7.4).
type SliceTaskRequest struct {
	MainTask string `json:"main_task"`
	// NextStep asks for the step after the current micro-step, which the user just finished.
	NextStep bool `json:"next_step,omitempty"`
}

// Validate checks main_task is non-empty and at most 300 characters.
func (r SliceTaskRequest) Validate() (string, *shared.AppError) {
	trimmed := strings.TrimSpace(r.MainTask)
	if trimmed == "" {
		return "", shared.ErrValidation("Invalid slice-task input", map[string]any{
			"main_task": "is required",
		})
	}
	if utf8.RuneCountInString(trimmed) > MaxMainTaskRunes {
		return "", shared.ErrValidation("Invalid slice-task input", map[string]any{
			"main_task": fmt.Sprintf("must be at most %d characters", MaxMainTaskRunes),
		})
	}
	return trimmed, nil
}

// SliceTaskResponse is the response for POST /api/v1/wins/{date}/slice-task (PRD §7.4).
type SliceTaskResponse struct {
	MainTask        string `json:"main_task"`
	MicroStep       string `json:"micro_step"`
	DurationSeconds int    `json:"duration_seconds"`
	StepsDone       int    `json:"steps_done"`
	// AINote is set when the template replaced the AI answer: "daily_limit" or "unavailable".
	AINote string `json:"ai_note,omitempty"`
}

// RecalibrateRequest is the payload for POST /api/v1/wins/{date}/recalibrate (PRD §7.4).
type RecalibrateRequest struct {
	Pillar string `json:"pillar"`
}

// Validate checks pillar is one of physical, work, or soul.
func (r RecalibrateRequest) Validate() (string, *shared.AppError) {
	p := strings.TrimSpace(r.Pillar)
	if !IsValidPillar(p) {
		return "", shared.ErrValidation("Invalid recalibrate input", map[string]any{
			"pillar": "must be one of: physical, work, soul",
		})
	}
	return p, nil
}

// RecalibrateResponse is the response for POST /api/v1/wins/{date}/recalibrate (PRD §7.4).
type RecalibrateResponse struct {
	Pillar          string `json:"pillar"`
	NewTitle        string `json:"new_title"`
	Level           int    `json:"level"`
	DurationSeconds *int   `json:"duration_seconds,omitempty"`
	AINote          string `json:"ai_note,omitempty"`
}

// ToggleWinRequest is the payload for PATCH /api/v1/wins/{date}/toggle (PRD §7.4).
type ToggleWinRequest struct {
	Pillar    string `json:"pillar"`
	Completed *bool  `json:"completed"`
}

// Validate checks pillar and completed presence.
func (r ToggleWinRequest) Validate() (string, bool, *shared.AppError) {
	details := make(map[string]any)
	p := strings.TrimSpace(r.Pillar)
	if !IsValidPillar(p) {
		details["pillar"] = "must be one of: physical, work, soul"
	}
	if r.Completed == nil {
		details["completed"] = "is required"
	}
	if len(details) > 0 {
		return "", false, shared.ErrValidation("Invalid toggle input", details)
	}
	return p, *r.Completed, nil
}

// ToggleWinResponse is the response for PATCH /api/v1/wins/{date}/toggle (PRD §7.4).
type ToggleWinResponse struct {
	Pillar             string `json:"pillar"`
	Completed          bool   `json:"completed"`
	WinsCompletedCount int    `json:"wins_completed_count"`
}
