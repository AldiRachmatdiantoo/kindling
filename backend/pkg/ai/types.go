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

// CheckinInput contains ONLY non-PII calibration inputs sent to the AI layer (PRD §8.2).
type CheckinInput struct {
	Scores          Scores
	CalibrationTier CalibrationTier
	BrainDump       string
	FunCopeInput    string
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

// AiProvider defines the LLM abstraction (PRD §8.1).
type AiProvider interface {
	GenerateCheckin(ctx context.Context, in CheckinInput) (CheckinOutput, error)
	SliceTask(ctx context.Context, in SliceTaskInput) (SliceTaskOutput, error)
	Recalibrate(ctx context.Context, in RecalibrateInput) (RecalibrateOutput, error)
}
