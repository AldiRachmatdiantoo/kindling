package wins

import (
	"fmt"

	"github.com/kindling/backend/pkg/ai"
)

// workLevelMaxSeconds is the longest focus timer each "Still too heavy" level may set for the
// work pillar. A lighter goal must never come with a longer timer, whatever the model returns.
var workLevelMaxSeconds = []int{300, 180, 60}

func capWorkDuration(d *int, level int) *int {
	if level < 1 {
		level = 1
	}
	if level > len(workLevelMaxSeconds) {
		level = len(workLevelMaxSeconds)
	}
	limit := workLevelMaxSeconds[level-1]
	if d == nil || *d > limit {
		return &limit
	}
	return d
}

// BuildNextStepFallback is the "next step" template used when the AI provider fails.
func BuildNextStepFallback(tier ai.CalibrationTier) ai.SliceTaskOutput {
	out := BuildSliceTaskFallback(tier)
	out.MicroStep = fmt.Sprintf("Pick up right where you stopped and do the next small piece for %d minutes. One more step is plenty.", out.DurationSeconds/60)
	return out
}

// BuildSliceTaskFallback returns a deterministic, schema-valid micro-step when the AI provider fails (PRD §7.4 & §8.2).
func BuildSliceTaskFallback(tier ai.CalibrationTier) ai.SliceTaskOutput {
	switch tier {
	case ai.TierGentle:
		return ai.SliceTaskOutput{
			MicroStep:       "Open your task and work on the smallest first piece for 5 minutes. Done beats perfect.",
			DurationSeconds: 300,
		}
	case ai.TierStandard:
		return ai.SliceTaskOutput{
			MicroStep:       "Set up your workspace and give the first step of your task 10 calm, focused minutes.",
			DurationSeconds: 600,
		}
	default: // TierBalanced
		return ai.SliceTaskOutput{
			MicroStep:       "Open your task doc and finish one small first piece in just 7 minutes.",
			DurationSeconds: 420,
		}
	}
}

// BuildRecalibrateFallback returns a deterministic, schema-valid gentler target for targetLevel 1..3 (PRD §8.2 & §8.3).
func BuildRecalibrateFallback(pillar string, targetLevel int) ai.RecalibrateOutput {
	level := targetLevel
	if level < 1 {
		level = 1
	}
	if level > MaxRecalibrateLevel {
		level = MaxRecalibrateLevel
	}

	switch pillar {
	case PillarPhysical:
		titles := []string{
			"Take a 5-minute stroll or do a light stretch",
			"Stand up, drink some water, and stretch your shoulders for 2 minutes",
			"Take 3 deep breaths and let your shoulders drop",
		}
		return ai.RecalibrateOutput{NewTitle: titles[level-1]}
	case PillarWork:
		titles := []string{
			"Work on one small step for just 5 minutes",
			"Open the task file and write one bullet or opening line",
			"Look at the task title for 1 minute, then save it for later",
		}
		durations := []int{300, 180, 60}
		dur := durations[level-1]
		return ai.RecalibrateOutput{
			NewTitle:        titles[level-1],
			DurationSeconds: &dur,
		}
	default: // PillarSoul
		titles := []string{
			"Listen to one favorite song for 5 minutes, undisturbed",
			"Close your eyes for 2 minutes and let yourself rest",
			"Breathe slowly and remind yourself you have done enough today",
		}
		return ai.RecalibrateOutput{NewTitle: titles[level-1]}
	}
}
