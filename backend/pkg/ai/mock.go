package ai

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"strings"
)

// MockAiProvider returns deterministic, schema-valid outputs based on calibration_tier + input hash (PRD §8.1).
type MockAiProvider struct{}

func NewMockAiProvider() *MockAiProvider {
	return &MockAiProvider{}
}

func (m *MockAiProvider) GenerateCheckin(_ context.Context, in CheckinInput) (CheckinOutput, error) {
	seed := hashSeed(
		string(in.CalibrationTier),
		fmt.Sprintf("%d:%d:%d:%d", in.Scores.PhysicalExhaustion, in.Scores.WorkExhaustion, in.Scores.Disengagement, in.Scores.SoulWellbeing),
		strings.TrimSpace(in.FunCopeInput),
		strings.TrimSpace(in.BrainDump),
	)

	funTitle := "A 10-Minute Fun Break, No Goals Attached"
	funGuidance := "Spend 10 minutes on your favorite easy activity. No guilt, no need to get anything out of it."
	if clean := strings.TrimSpace(in.FunCopeInput); clean != "" {
		short := TruncateRunes(clean, 45)
		funTitle = TruncateRunes("Chill Time: "+short, MaxTitleRunes)
		funGuidance = TruncateRunes("Enjoy this for a few minutes to give your nervous system a reset before you start working.", MaxGuidanceRunes)
	}

	switch in.CalibrationTier {
	case TierGentle:
		summaries := []string{
			"Your physical or work exhaustion is running high. Today, the smallest steps are plenty, and recovery comes first.",
			"Your energy is running low, and that is completely okay. Today is about keeping the spark alive without pushing yourself.",
		}
		return CheckinOutput{
			DiagnosticSummary: summaries[seed%uint64(len(summaries))],
			CopeOptions: []CopeOption{
				{
					ID:                "cope_1",
					Title:             funTitle,
					BriefCopeCategory: "self_distraction",
					ToolType:          ToolTimer,
					DurationSeconds:   600,
					Guidance:          funGuidance,
				},
				{
					ID:                "cope_2",
					Title:             "4-7-8 Breathing",
					BriefCopeCategory: "acceptance",
					ToolType:          ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Breathe in for 4 seconds, hold for 7, then slowly breathe out for 8.",
				},
				{
					ID:                "cope_3",
					Title:             "Unfiltered Brain Dump",
					BriefCopeCategory: "venting",
					ToolType:          ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Pour out everything on your mind, unedited, so your head feels lighter.",
				},
			},
			Wins: PlanWins(in.CalibrationTier, in.Scores, seed),
		}, nil

	case TierBalanced:
		summaries := []string{
			"You have enough energy to move slowly, even with some signs of fatigue. Start with a short break, then one light step.",
			"Today suits light-to-moderate goals. Take a moment to reset your focus so small steps feel more meaningful.",
		}
		return CheckinOutput{
			DiagnosticSummary: summaries[seed%uint64(len(summaries))],
			CopeOptions: []CopeOption{
				{
					ID:                "cope_1",
					Title:             funTitle,
					BriefCopeCategory: "positive_reframing",
					ToolType:          ToolTimer,
					DurationSeconds:   480,
					Guidance:          funGuidance,
				},
				{
					ID:                "cope_2",
					Title:             "Box Breathing 4-4-4-4",
					BriefCopeCategory: "acceptance",
					ToolType:          ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Breathe in for 4, hold for 4, out for 4, hold for 4 to settle your rhythm.",
				},
				{
					ID:                "cope_3",
					Title:             "Brain Dump and Sort It Out",
					BriefCopeCategory: "planning",
					ToolType:          ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Write down what is bugging you, then mark the one thing that matters most today.",
				},
			},
			Wins: PlanWins(in.CalibrationTier, in.Scores, seed),
		}, nil

	default: // TierStandard
		summaries := []string{
			"You are fairly steady today. Use this comfortable rhythm to work through your 3 daily wins in balance.",
			"Your energy is holding up well. Still, slip in short breaks so today feels light and easy to keep up.",
		}
		return CheckinOutput{
			DiagnosticSummary: summaries[seed%uint64(len(summaries))],
			CopeOptions: []CopeOption{
				{
					ID:                "cope_1",
					Title:             funTitle,
					BriefCopeCategory: "active_coping",
					ToolType:          ToolTimer,
					DurationSeconds:   300,
					Guidance:          funGuidance,
				},
				{
					ID:                "cope_2",
					Title:             "Focus Reset Breathing",
					BriefCopeCategory: "acceptance",
					ToolType:          ToolBreathing,
					DurationSeconds:   120,
					Guidance:          "Breathe slowly for 2 minutes to clear your head before you start.",
				},
				{
					ID:                "cope_3",
					Title:             "Daily Intention Note",
					BriefCopeCategory: "planning",
					ToolType:          ToolBrainDump,
					DurationSeconds:   240,
					Guidance:          "Jot down how you want to feel and what you want to finish today.",
				},
			},
			Wins: PlanWins(in.CalibrationTier, in.Scores, seed),
		}, nil
	}
}

func (m *MockAiProvider) SliceTask(_ context.Context, in SliceTaskInput) (SliceTaskOutput, error) {
	clean := TruncateRunes(strings.TrimSpace(in.MainTask), 60)
	duration := 420
	switch in.CalibrationTier {
	case TierGentle:
		duration = 300
	case TierStandard:
		duration = 600
	}
	step := fmt.Sprintf("Open what you need for \"%s\" and work on the smallest first piece for %d minutes. Done beats perfect.", clean, duration/60)
	if strings.TrimSpace(in.PreviousStep) != "" {
		step = fmt.Sprintf("Step %d of \"%s\": pick up right where you stopped and do the next small piece for %d minutes.", in.StepNumber, clean, duration/60)
	}
	return SliceTaskOutput{
		MicroStep:       TruncateRunes(step, MaxMicroStepRunes),
		DurationSeconds: duration,
	}, nil
}

func (m *MockAiProvider) Recalibrate(_ context.Context, in RecalibrateInput) (RecalibrateOutput, error) {
	level := in.TargetLevel
	if level < 1 {
		level = 1
	}
	if level > 3 {
		level = 3
	}

	var title string
	switch in.Pillar {
	case "physical":
		titles := []string{
			"Take a 5-minute stroll or do a light stretch",
			"Stand up, drink some water, and stretch your shoulders for 2 minutes",
			"Take 3 deep breaths and let your shoulders drop",
		}
		title = titles[level-1]
	case "work":
		titles := []string{
			"Work on one small step for just 5 minutes",
			"Open the task file and write one bullet or opening line",
			"Look at the task title for 1 minute, then save it for later",
		}
		title = titles[level-1]
		dur := []int{300, 180, 60}[level-1]
		return RecalibrateOutput{
			NewTitle:        title,
			DurationSeconds: &dur,
		}, nil
	default: // soul
		titles := []string{
			"Listen to one favorite song for 5 minutes, undisturbed",
			"Close your eyes for 2 minutes and let yourself rest",
			"Breathe slowly and remind yourself you have done enough today",
		}
		title = titles[level-1]
	}

	return RecalibrateOutput{NewTitle: title}, nil
}

func hashSeed(parts ...string) uint64 {
	h := sha256.New()
	for _, p := range parts {
		_, _ = h.Write([]byte(p))
		_, _ = h.Write([]byte{0})
	}
	sum := h.Sum(nil)
	return binary.BigEndian.Uint64(sum[:8])
}
