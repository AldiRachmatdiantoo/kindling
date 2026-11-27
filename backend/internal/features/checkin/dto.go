package checkin

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const (
	MaxBrainDumpRunes = 2000
	MaxFunCopeRunes   = 200
)

var requiredAnswerKeys = []string{
	"cbi_1", "cbi_2", "cbi_3",
	"olbi_ex_1", "olbi_ex_2",
	"olbi_dis_1", "olbi_dis_2",
	"who5_1", "who5_2",
}

// CheckinRequest is the request payload for POST /api/v1/checkin (PRD §7.3).
type CheckinRequest struct {
	LogDate      string                     `json:"log_date"`
	Answers      map[string]json.RawMessage `json:"answers"`
	BrainDump    string                     `json:"brain_dump"`
	FunCopeInput string                     `json:"fun_cope_input"`
}

// Validate enforces PRD §7.3 & §5.2 validation rules and parses the exact 9 Likert items.
func (r CheckinRequest) Validate() (Answers, *shared.AppError) {
	details := make(map[string]any)

	if strings.TrimSpace(r.LogDate) == "" {
		details["log_date"] = "is required"
	}

	if utf8.RuneCountInString(r.BrainDump) > MaxBrainDumpRunes {
		details["brain_dump"] = fmt.Sprintf("must be at most %d characters", MaxBrainDumpRunes)
	}
	if utf8.RuneCountInString(r.FunCopeInput) > MaxFunCopeRunes {
		details["fun_cope_input"] = fmt.Sprintf("must be at most %d characters", MaxFunCopeRunes)
	}

	if r.Answers == nil {
		details["answers"] = "is required and must contain exactly 9 Likert items"
		return Answers{}, shared.ErrValidation("Invalid check-in input", details)
	}

	allowedSet := make(map[string]struct{}, len(requiredAnswerKeys))
	for _, k := range requiredAnswerKeys {
		allowedSet[k] = struct{}{}
	}
	for k := range r.Answers {
		if _, ok := allowedSet[k]; !ok {
			details["answers."+k] = "unexpected answer key"
		}
	}

	parsed := make(map[string]int, len(requiredAnswerKeys))
	for _, k := range requiredAnswerKeys {
		raw, ok := r.Answers[k]
		if !ok {
			details["answers."+k] = "is required"
			continue
		}
		val, ok := parseStrictInt(raw)
		if !ok || val < 1 || val > 4 {
			details["answers."+k] = "must be an integer between 1 and 4"
			continue
		}
		parsed[k] = val
	}

	if len(details) > 0 {
		return Answers{}, shared.ErrValidation("Invalid check-in input", details)
	}

	return Answers{
		CBI1:     parsed["cbi_1"],
		CBI2:     parsed["cbi_2"],
		CBI3:     parsed["cbi_3"],
		OLBIEx1:  parsed["olbi_ex_1"],
		OLBIEx2:  parsed["olbi_ex_2"],
		OLBIDis1: parsed["olbi_dis_1"],
		OLBIDis2: parsed["olbi_dis_2"],
		WHO51:    parsed["who5_1"],
		WHO52:    parsed["who5_2"],
	}, nil
}

// parseStrictInt accepts only JSON integer tokens (rejects floats, strings, booleans, null).
func parseStrictInt(raw json.RawMessage) (int, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return 0, false
	}
	// Reject decimals/exponents/quotes/null.
	for i, b := range trimmed {
		if i == 0 && b == '-' {
			continue
		}
		if b < '0' || b > '9' {
			return 0, false
		}
	}
	var v int
	if err := json.Unmarshal(trimmed, &v); err != nil {
		return 0, false
	}
	return v, true
}

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

// WinsData matches the wins_data JSONB structure in PRD §5.1 & §7.3.
type WinsData struct {
	Physical WinItem     `json:"physical"`
	Work     WorkWinItem `json:"work"`
	Soul     WinItem     `json:"soul"`
}

// DailyLogResponse matches the REST response for POST /checkin and GET /checkin/{date} (PRD §7.3).
type DailyLogResponse struct {
	ID                 string             `json:"id"`
	LogDate            string             `json:"log_date"`
	Scores             ai.Scores          `json:"scores"`
	CalibrationTier    ai.CalibrationTier `json:"calibration_tier"`
	DiagnosticSummary  string             `json:"diagnostic_summary"`
	SafetyFlag         bool               `json:"safety_flag"`
	CopeOptions        []ai.CopeOption    `json:"cope_options"`
	PositiveCopeChosen *string            `json:"positive_cope_chosen"`
	WinsData           WinsData           `json:"wins_data"`
	WinsCompletedCount int                `json:"wins_completed_count"`
	// AINote is set only on the check-in response when the template replaced the AI answer.
	AINote string `json:"ai_note,omitempty"`
}

// CopeUpdateRequest is the payload for PATCH /api/v1/checkin/{date}/cope (PRD §7.3).
type CopeUpdateRequest struct {
	CopeOptionID string `json:"cope_option_id"`
}

// CopeUpdateResponse is the response for PATCH /api/v1/checkin/{date}/cope (PRD §7.3).
type CopeUpdateResponse struct {
	PositiveCopeChosen string `json:"positive_cope_chosen"`
}

// ReflectRequest is the payload for POST /api/v1/checkin/{date}/reflect (PRD FR-05).
// Consent is a pointer so a missing field and false are both rejected.
type ReflectRequest struct {
	Text    string `json:"text"`
	Consent *bool  `json:"consent"`
}

// Validate checks the text length and that the user explicitly agreed to send it.
func (r ReflectRequest) Validate() *shared.AppError {
	details := make(map[string]any)
	if strings.TrimSpace(r.Text) == "" {
		details["text"] = "is required"
	} else if utf8.RuneCountInString(r.Text) > ai.MaxReflectTextRunes {
		details["text"] = fmt.Sprintf("must be at most %d characters", ai.MaxReflectTextRunes)
	}
	if r.Consent == nil || !*r.Consent {
		details["consent"] = "must be true: the text is only sent to the AI with explicit consent"
	}
	if len(details) > 0 {
		return shared.ErrValidation("Invalid reflection input", details)
	}
	return nil
}

// ReflectResponse is the reply for POST /api/v1/checkin/{date}/reflect. It never carries the
// user's text, so it is safe to keep in the idempotency cache.
type ReflectResponse struct {
	Reflection string   `json:"reflection"`
	Themes     []string `json:"themes"`
	SafetyFlag bool     `json:"safety_flag"`
	AINote     string   `json:"ai_note,omitempty"`
}
