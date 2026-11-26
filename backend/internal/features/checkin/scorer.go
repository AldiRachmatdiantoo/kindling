package checkin

import (
	"math"

	"github.com/kindling/backend/pkg/ai"
)

// Answers holds the 9 Likert-scale (1..4) check-in items (PRD Lampiran A).
type Answers struct {
	CBI1     int `json:"cbi_1"`
	CBI2     int `json:"cbi_2"`
	CBI3     int `json:"cbi_3"`
	OLBIEx1  int `json:"olbi_ex_1"`
	OLBIEx2  int `json:"olbi_ex_2"`
	OLBIDis1 int `json:"olbi_dis_1"`
	OLBIDis2 int `json:"olbi_dis_2"`
	WHO51    int `json:"who5_1"`
	WHO52    int `json:"who5_2"`
}

// scoreItems implements PRD §2.1: round((sum(items) - n) / (3 * n) * 100) using math.Round.
func scoreItems(items ...int) int {
	n := len(items)
	if n == 0 {
		return 0
	}
	sum := 0
	for _, v := range items {
		sum += v
	}
	raw := float64(sum-n) / float64(3*n) * 100.0
	return int(math.Round(raw))
}

// CalculateScores computes the 4 deterministic 0..100 psychometric scores (PRD §2.1).
func CalculateScores(a Answers) ai.Scores {
	return ai.Scores{
		PhysicalExhaustion: scoreItems(a.CBI1, a.CBI2, a.CBI3),
		WorkExhaustion:     scoreItems(a.OLBIEx1, a.OLBIEx2),
		Disengagement:      scoreItems(a.OLBIDis1, a.OLBIDis2),
		SoulWellbeing:      scoreItems(a.WHO51, a.WHO52),
	}
}

// DetermineTier evaluates the calibration_tier rules sequentially per PRD §2.1.
func DetermineTier(s ai.Scores) ai.CalibrationTier {
	if s.PhysicalExhaustion >= 67 || s.WorkExhaustion >= 67 {
		return ai.TierGentle
	}
	if s.PhysicalExhaustion >= 34 || s.WorkExhaustion >= 34 || s.Disengagement >= 34 || s.SoulWellbeing <= 33 {
		return ai.TierBalanced
	}
	return ai.TierStandard
}

// Score is a pure convenience function returning both Scores and CalibrationTier.
func Score(a Answers) (ai.Scores, ai.CalibrationTier) {
	scores := CalculateScores(a)
	return scores, DetermineTier(scores)
}
