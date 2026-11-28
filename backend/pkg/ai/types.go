package ai

import "context"

// CalibrationTier mirrors the deterministic tier from PRD §2.1.
type CalibrationTier string

const (
	TierGentle   CalibrationTier = "gentle"
	TierBalanced CalibrationTier = "balanced"
	TierStandard CalibrationTier = "standard"
)

// ToolType enum (PRD §2.2).
const (
	ToolBreathing = "breathing"
	ToolTimer     = "timer"
	ToolBrainDump = "brain_dump"
)

// Scores holds the 4 deterministic 0..100 psychometric dimensions (PRD §2.1).
type Scores struct {
	PhysicalExhaustion int `json:"physical_exhaustion"`
	WorkExhaustion     int `json:"work_exhaustion"`
	Disengagement      int `json:"disengagement"`
	SoulWellbeing      int `json:"soul_wellbeing"`
}

// CopeOption matches PRD §5.1 & §7.3.
type CopeOption struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	BriefCopeCategory string `json:"brief_cope_category"`
	ToolType          string `json:"tool_type"`
	DurationSeconds   int    `json:"duration_seconds"`
	Guidance          string `json:"guidance"`
}

// Habit is a user's standing activity for one pillar and what usually gets in the way.
type Habit struct {
	Activity string
	Struggle string
}

// Habits maps a pillar ("physical", "work", "soul") to its habit; a missing pillar has none.
type Habits map[string]Habit

// CheckinInput contains ONLY non-PII calibration inputs sent to the AI layer (PRD §8.2).
type CheckinInput struct {
	Scores          Scores
	CalibrationTier CalibrationTier
	BrainDump       string
	FunCopeInput    string
	// Habits, when set, are what that pillar's win is built from.
	Habits Habits
}

// PlanWinInput asks for one pillar's win built from an activity the user picked for today.
type PlanWinInput struct {
	CalibrationTier CalibrationTier
	Scores          Scores
	Pillar          string
	Activity        string
	Struggle        string
}

// CheckinOutput is the structured AI response for POST /checkin.
type CheckinOutput struct {
	DiagnosticSummary string       `json:"diagnostic_summary"`
	CopeOptions       []CopeOption `json:"cope_options"`
	Wins              WinsPlan     `json:"wins"`
}

// SliceTaskInput contains input for AI Task Slicer (PRD §7.4, §8.1).
type SliceTaskInput struct {
	CalibrationTier CalibrationTier
	MainTask        string
	// PreviousStep is the micro-step the user just finished; empty for the first slice.
	PreviousStep string
	// StepNumber is 1 for the first slice, 2 for the step after it, and so on.
	StepNumber int
}

// SliceTaskOutput is the structured AI response for POST /wins/{date}/slice-task.
type SliceTaskOutput struct {
	MicroStep       string `json:"micro_step"`
	DurationSeconds int    `json:"duration_seconds"`
}

// RecalibrateInput contains input for Dynamic Target Renegotiation (PRD §7.4, §8.1, §8.3).
type RecalibrateInput struct {
	CalibrationTier CalibrationTier
	Pillar          string
	CurrentTitle    string
	TargetLevel     int // 1..3
}

// RecalibrateOutput is the structured AI response for POST /wins/{date}/recalibrate.
type RecalibrateOutput struct {
	NewTitle        string `json:"new_title"`
	DurationSeconds *int   `json:"duration_seconds,omitempty"`
}

// SplitStepInput asks to break one roadmap step that felt too big into 2 smaller ones.
type SplitStepInput struct {
	CalibrationTier CalibrationTier
	Pillar          string
	WinTitle        string
	Step            string
}

// SplitStepOutput replaces the step: first is a tiny way in, second finishes the original step.
type SplitStepOutput struct {
	First  string `json:"first"`
	Second string `json:"second"`
}

// AiProvider defines the LLM abstraction (PRD §8.1).
type AiProvider interface {
	GenerateCheckin(ctx context.Context, in CheckinInput) (CheckinOutput, error)
	SliceTask(ctx context.Context, in SliceTaskInput) (SliceTaskOutput, error)
	Recalibrate(ctx context.Context, in RecalibrateInput) (RecalibrateOutput, error)
	PlanWin(ctx context.Context, in PlanWinInput) (WinPlan, error)
	// SplitStep breaks a roadmap step the user found too big into 2 smaller steps.
	SplitStep(ctx context.Context, in SplitStepInput) (SplitStepOutput, error)
	// Reflect reads a brain dump back in a few sentences and up to 3 themes (FR-05).
	Reflect(ctx context.Context, in ReflectInput) (ReflectOutput, error)
}
