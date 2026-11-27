package profile

import "strings"

// HeatmapLevel defines the 4 anti-burnout heatmap levels (PRD §2.3).
type HeatmapLevel string

const (
	LevelRest     HeatmapLevel = "rest"
	LevelRecovery HeatmapLevel = "recovery"
	LevelSteady   HeatmapLevel = "steady"
	LevelComplete HeatmapLevel = "complete"
)

// ClassifyHeatmapLevel maps wins_completed_count and positive_cope_chosen to PRD §2.3 levels.
func ClassifyHeatmapLevel(winsCount int16, copeChosen *string) HeatmapLevel {
	if winsCount >= 3 {
		return LevelComplete
	}
	if winsCount >= 1 {
		return LevelSteady
	}
	if copeChosen != nil && strings.TrimSpace(*copeChosen) != "" {
		return LevelRecovery
	}
	return LevelRest
}

type DateRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type Milestones struct {
	TotalActiveDays   int64 `json:"total_active_days"`
	TotalCompleteDays int64 `json:"total_complete_days"`
	TotalRecoveryDays int64 `json:"total_recovery_days"`
	TotalDailyWins    int64 `json:"total_daily_wins"`
	TotalCheckpoints  int64 `json:"total_checkpoints"`
}

type HeatmapDay struct {
	Date       string       `json:"date"`
	Level      HeatmapLevel `json:"level"`
	WinsCount  int          `json:"wins_count"`
	CopeChosen *string      `json:"cope_chosen"`
}

// HeatmapResponse matches PRD §7.5 GET /api/v1/profile/heatmap.
type HeatmapResponse struct {
	Range          DateRange         `json:"range"`
	Milestones     Milestones        `json:"milestones"`
	Days           []HeatmapDay      `json:"days"`
	PillarProgress PillarProgressSet `json:"pillar_progress"`
}
