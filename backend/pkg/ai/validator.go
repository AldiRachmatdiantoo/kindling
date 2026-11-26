package ai

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	MaxTitleRunes           = 80
	MaxGuidanceRunes        = 240
	MaxSummaryRunes         = 600
	MaxMicroStepRunes       = 240
	MinCopeDurationSeconds  = 60
	MaxCopeDurationSeconds  = 600
	MinSliceDurationSeconds = 300
	MaxSliceDurationSeconds = 600
)

// AllowedBriefCopeCategories lists the adaptive Brief-COPE subscales permitted by PRD §2.2.
var AllowedBriefCopeCategories = map[string]struct{}{
	"active_coping":        {},
	"planning":             {},
	"positive_reframing":   {},
	"acceptance":           {},
	"humor":                {},
	"religion":             {},
	"emotional_support":    {},
	"instrumental_support": {},
	"self_distraction":     {},
	"venting":              {},
}

// AllowedToolTypes lists the interactive cope tools permitted by PRD §2.2.
var AllowedToolTypes = map[string]struct{}{
	ToolBreathing: {},
	ToolTimer:     {},
	ToolBrainDump: {},
}

// BriefCopeCategoryList returns the allowed Brief-COPE categories in stable order (for JSON schema).
func BriefCopeCategoryList() []string {
	return []string{
		"active_coping",
		"planning",
		"positive_reframing",
		"acceptance",
		"humor",
		"religion",
		"emotional_support",
		"instrumental_support",
		"self_distraction",
		"venting",
	}
}

// ToolTypeList returns the allowed tool types in stable order (for JSON schema).
func ToolTypeList() []string {
	return []string{ToolBreathing, ToolTimer, ToolBrainDump}
}

// ValidateCheckinOutput strictly enforces PRD §2.2 & §8.2 output constraints.
func ValidateCheckinOutput(out CheckinOutput) error {
	summary := strings.TrimSpace(out.DiagnosticSummary)
	if summary == "" {
		return errors.New("diagnostic_summary is empty")
	}
	if utf8.RuneCountInString(summary) > MaxSummaryRunes {
		return fmt.Errorf("diagnostic_summary exceeds %d runes", MaxSummaryRunes)
	}

	if len(out.CopeOptions) != 3 {
		return fmt.Errorf("cope_options must contain exactly 3 items (got %d)", len(out.CopeOptions))
	}

	seenIDs := make(map[string]struct{}, 3)
	for i, opt := range out.CopeOptions {
		id := strings.TrimSpace(opt.ID)
		if id == "" {
			return fmt.Errorf("cope_options[%d].id is empty", i)
		}
		if _, dup := seenIDs[id]; dup {
			return fmt.Errorf("cope_options[%d].id %q is duplicated", i, id)
		}
		seenIDs[id] = struct{}{}

		title := strings.TrimSpace(opt.Title)
		if title == "" {
			return fmt.Errorf("cope_options[%d].title is empty", i)
		}
		if utf8.RuneCountInString(title) > MaxTitleRunes {
			return fmt.Errorf("cope_options[%d].title exceeds %d runes", i, MaxTitleRunes)
		}

		if _, ok := AllowedBriefCopeCategories[opt.BriefCopeCategory]; !ok {
			return fmt.Errorf("cope_options[%d].brief_cope_category %q is not allowed", i, opt.BriefCopeCategory)
		}
		if _, ok := AllowedToolTypes[opt.ToolType]; !ok {
			return fmt.Errorf("cope_options[%d].tool_type %q is not allowed", i, opt.ToolType)
		}
		if opt.DurationSeconds < MinCopeDurationSeconds || opt.DurationSeconds > MaxCopeDurationSeconds {
			return fmt.Errorf("cope_options[%d].duration_seconds %d out of range [%d,%d]", i, opt.DurationSeconds, MinCopeDurationSeconds, MaxCopeDurationSeconds)
		}

		guidance := strings.TrimSpace(opt.Guidance)
		if guidance == "" {
			return fmt.Errorf("cope_options[%d].guidance is empty", i)
		}
		if utf8.RuneCountInString(guidance) > MaxGuidanceRunes {
			return fmt.Errorf("cope_options[%d].guidance exceeds %d runes", i, MaxGuidanceRunes)
		}
	}

	if err := validateWinTitle("physical", out.Wins.Physical); err != nil {
		return err
	}
	if err := validateWinTitle("work", out.Wins.Work); err != nil {
		return err
	}
	if err := validateWinTitle("soul", out.Wins.Soul); err != nil {
		return err
	}
	return nil
}

func validateWinTitle(pillar, raw string) error {
	t := strings.TrimSpace(raw)
	if t == "" {
		return fmt.Errorf("wins.%s is empty", pillar)
	}
	if utf8.RuneCountInString(t) > MaxTitleRunes {
		return fmt.Errorf("wins.%s exceeds %d runes", pillar, MaxTitleRunes)
	}
	return nil
}

// ValidateSliceTaskOutput strictly enforces PRD §7.4 & §8.2 constraints.
func ValidateSliceTaskOutput(out SliceTaskOutput) error {
	step := strings.TrimSpace(out.MicroStep)
	if step == "" {
		return errors.New("micro_step is empty")
	}
	if utf8.RuneCountInString(step) > MaxMicroStepRunes {
		return fmt.Errorf("micro_step exceeds %d runes", MaxMicroStepRunes)
	}
	if out.DurationSeconds < MinSliceDurationSeconds || out.DurationSeconds > MaxSliceDurationSeconds {
		return fmt.Errorf("duration_seconds %d out of range [%d,%d]", out.DurationSeconds, MinSliceDurationSeconds, MaxSliceDurationSeconds)
	}
	return nil
}

// ValidateRecalibrateOutput strictly enforces PRD §7.4 & §8.2 constraints.
func ValidateRecalibrateOutput(out RecalibrateOutput) error {
	title := strings.TrimSpace(out.NewTitle)
	if title == "" {
		return errors.New("new_title is empty")
	}
	if utf8.RuneCountInString(title) > MaxTitleRunes {
		return fmt.Errorf("new_title exceeds %d runes", MaxTitleRunes)
	}
	if out.DurationSeconds != nil {
		d := *out.DurationSeconds
		if d < MinCopeDurationSeconds || d > MaxCopeDurationSeconds {
			return fmt.Errorf("duration_seconds %d out of range [%d,%d]", d, MinCopeDurationSeconds, MaxCopeDurationSeconds)
		}
	}
	return nil
}
