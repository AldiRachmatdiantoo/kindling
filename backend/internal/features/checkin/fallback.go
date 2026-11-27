package checkin

import "github.com/kindling/backend/pkg/ai"

// BuildCheckinFallback returns a deterministic, schema-valid template per calibration_tier (PRD §8.2).
// The wins still explain themselves from today's scores.
func BuildCheckinFallback(tier ai.CalibrationTier, scores ai.Scores) ai.CheckinOutput {
	return buildCheckinFallback(tier, scores)
}

// BuildCheckinFallbackWithHabits is the fallback when the user has habits: those pillars keep
// a habit-built win, so an AI outage never drops what the user chose to work on.
func BuildCheckinFallbackWithHabits(tier ai.CalibrationTier, scores ai.Scores, habits ai.Habits) ai.CheckinOutput {
	out := buildCheckinFallback(tier, scores)
	out.Wins = ai.ApplyHabits(out.Wins, tier, scores, habits)
	return out
}

func buildCheckinFallback(tier ai.CalibrationTier, scores ai.Scores) ai.CheckinOutput {
	switch tier {
	case ai.TierGentle:
		return ai.CheckinOutput{
			DiagnosticSummary: "Your energy is really limited today, and slowing down is okay. Just pick one recovery break and the smallest possible steps.",
			CopeOptions: []ai.CopeOption{
				{
					ID:                "cope_1",
					Title:             "A 5-Minute Easy Break, No Goals",
					BriefCopeCategory: "self_distraction",
					ToolType:          ai.ToolTimer,
					DurationSeconds:   300,
					Guidance:          "Give yourself 5 minutes to do something easy you enjoy, with nothing to prove.",
				},
				{
					ID:                "cope_2",
					Title:             "4-7-8 Breathing",
					BriefCopeCategory: "acceptance",
					ToolType:          ai.ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Breathe in for 4 seconds, hold for 7, then slowly breathe out for 8.",
				},
				{
					ID:                "cope_3",
					Title:             "Unfiltered Brain Dump",
					BriefCopeCategory: "venting",
					ToolType:          ai.ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Write whatever is filling your head. It does not need to be neat or edited.",
				},
			},
			Wins: ai.PlanWins(tier, scores, 0),
		}

	case ai.TierBalanced:
		return ai.CheckinOutput{
			DiagnosticSummary: "There are some signs of fatigue today, but you still have room to move gently with light-to-moderate goals.",
			CopeOptions: []ai.CopeOption{
				{
					ID:                "cope_1",
					Title:             "8 Minutes of Me Time",
					BriefCopeCategory: "positive_reframing",
					ToolType:          ai.ToolTimer,
					DurationSeconds:   480,
					Guidance:          "Take a short break with something fun to get that sense of control back.",
				},
				{
					ID:                "cope_2",
					Title:             "Box Breathing 4-4-4-4",
					BriefCopeCategory: "acceptance",
					ToolType:          ai.ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Breathe in for 4, hold for 4, out for 4, hold for 4, nice and calm.",
				},
				{
					ID:                "cope_3",
					Title:             "Brain Dump and One Priority",
					BriefCopeCategory: "planning",
					ToolType:          ai.ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Empty out your thoughts, then mark the one small thing that makes the most sense today.",
				},
			},
			Wins: ai.PlanWins(tier, scores, 0),
		}

	default: // ai.TierStandard
		return ai.CheckinOutput{
			DiagnosticSummary: "You are fairly steady today. Keep a healthy rhythm with short breaks and three balanced daily wins.",
			CopeOptions: []ai.CopeOption{
				{
					ID:                "cope_1",
					Title:             "A Light 5-Minute Recovery Break",
					BriefCopeCategory: "active_coping",
					ToolType:          ai.ToolTimer,
					DurationSeconds:   300,
					Guidance:          "Enjoy a short pause before you start so your focus stays clear and unhurried.",
				},
				{
					ID:                "cope_2",
					Title:             "Focus Reset Breathing",
					BriefCopeCategory: "acceptance",
					ToolType:          ai.ToolBreathing,
					DurationSeconds:   120,
					Guidance:          "Breathe slowly in and out for 2 minutes to get your body back in rhythm.",
				},
				{
					ID:                "cope_3",
					Title:             "Daily Intention Note",
					BriefCopeCategory: "planning",
					ToolType:          ai.ToolBrainDump,
					DurationSeconds:   240,
					Guidance:          "Jot down your top priority and one good thing you want to protect today.",
				},
			},
			Wins: ai.PlanWins(tier, scores, 0),
		}
	}
}
