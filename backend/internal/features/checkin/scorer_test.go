package checkin

import (
	"testing"

	"github.com/kindling/backend/pkg/ai"
)

func TestScore_TableDriven(t *testing.T) {
	tests := []struct {
		name       string
		answers    Answers
		wantScores ai.Scores
		wantTier   ai.CalibrationTier
	}{
		{
			name: "Preset A: High Exhaustion (PRD Lampiran B)",
			answers: Answers{
				CBI1: 4, CBI2: 4, CBI3: 4,
				OLBIEx1: 4, OLBIEx2: 4,
				OLBIDis1: 2, OLBIDis2: 1,
				WHO51: 2, WHO52: 1,
			},
			wantScores: ai.Scores{
				PhysicalExhaustion: 100,
				WorkExhaustion:     100,
				Disengagement:      17,
				SoulWellbeing:      17,
			},
			wantTier: ai.TierGentle,
		},
		{
			name: "Preset B: High Disengagement (PRD Lampiran B)",
			answers: Answers{
				CBI1: 2, CBI2: 2, CBI3: 1,
				OLBIEx1: 2, OLBIEx2: 2,
				OLBIDis1: 4, OLBIDis2: 4,
				WHO51: 2, WHO52: 2,
			},
			wantScores: ai.Scores{
				PhysicalExhaustion: 22,
				WorkExhaustion:     33,
				Disengagement:      100,
				SoulWellbeing:      33,
			},
			wantTier: ai.TierBalanced,
		},
		{
			name: "Example PRD §7.3",
			answers: Answers{
				CBI1: 4, CBI2: 3, CBI3: 4,
				OLBIEx1: 4, OLBIEx2: 3,
				OLBIDis1: 2, OLBIDis2: 2,
				WHO51: 2, WHO52: 1,
			},
			wantScores: ai.Scores{
				PhysicalExhaustion: 89,
				WorkExhaustion:     83,
				Disengagement:      33,
				SoulWellbeing:      17,
			},
			wantTier: ai.TierGentle,
		},
		{
			name: "All minimums (soul_wellbeing 0 triggers balanced)",
			answers: Answers{
				CBI1: 1, CBI2: 1, CBI3: 1,
				OLBIEx1: 1, OLBIEx2: 1,
				OLBIDis1: 1, OLBIDis2: 1,
				WHO51: 1, WHO52: 1,
			},
			wantScores: ai.Scores{
				PhysicalExhaustion: 0,
				WorkExhaustion:     0,
				Disengagement:      0,
				SoulWellbeing:      0,
			},
			wantTier: ai.TierBalanced,
		},
		{
			name: "Healthy standard day",
			answers: Answers{
				CBI1: 1, CBI2: 2, CBI3: 1, // (4-3)/9 = 11.1 -> 11
				OLBIEx1: 2, OLBIEx2: 2, // (4-2)/6 = 33.3 -> 33
				OLBIDis1: 2, OLBIDis2: 2, // 33
				WHO51: 3, WHO52: 4, // (7-2)/6 = 83.3 -> 83
			},
			wantScores: ai.Scores{
				PhysicalExhaustion: 11,
				WorkExhaustion:     33,
				Disengagement:      33,
				SoulWellbeing:      83,
			},
			wantTier: ai.TierStandard,
		},
		{
			name: "All maximums (100 across all dimensions -> gentle)",
			answers: Answers{
				CBI1: 4, CBI2: 4, CBI3: 4,
				OLBIEx1: 4, OLBIEx2: 4,
				OLBIDis1: 4, OLBIDis2: 4,
				WHO51: 4, WHO52: 4,
			},
			wantScores: ai.Scores{
				PhysicalExhaustion: 100,
				WorkExhaustion:     100,
				Disengagement:      100,
				SoulWellbeing:      100,
			},
			wantTier: ai.TierGentle,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotScores, gotTier := Score(tc.answers)
			if gotScores != tc.wantScores {
				t.Errorf("scores mismatch:\n got: %+v\nwant: %+v", gotScores, tc.wantScores)
			}
			if gotTier != tc.wantTier {
				t.Errorf("tier mismatch: got %q, want %q", gotTier, tc.wantTier)
			}
		})
	}
}

func TestDetermineTier_Boundaries(t *testing.T) {
	tests := []struct {
		name   string
		scores ai.Scores
		want   ai.CalibrationTier
	}{
		{"physical 67 -> gentle", ai.Scores{PhysicalExhaustion: 67, SoulWellbeing: 100}, ai.TierGentle},
		{"work 67 -> gentle", ai.Scores{WorkExhaustion: 67, SoulWellbeing: 100}, ai.TierGentle},
		{"physical 66 -> balanced", ai.Scores{PhysicalExhaustion: 66, SoulWellbeing: 100}, ai.TierBalanced},
		{"work 34 -> balanced", ai.Scores{WorkExhaustion: 34, SoulWellbeing: 100}, ai.TierBalanced},
		{"disengagement 34 -> balanced", ai.Scores{Disengagement: 34, SoulWellbeing: 100}, ai.TierBalanced},
		{"soul 33 -> balanced", ai.Scores{SoulWellbeing: 33}, ai.TierBalanced},
		{"all 33 except soul 34 -> standard", ai.Scores{PhysicalExhaustion: 33, WorkExhaustion: 33, Disengagement: 33, SoulWellbeing: 34}, ai.TierStandard},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := DetermineTier(tc.scores); got != tc.want {
				t.Errorf("DetermineTier(%+v) = %q, want %q", tc.scores, got, tc.want)
			}
		})
	}
}
