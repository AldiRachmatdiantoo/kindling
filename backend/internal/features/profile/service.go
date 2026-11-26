package profile

import (
	"context"
	"time"
	_ "time/tzdata"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/shared"
)

const heatmapWindowDays = 365

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service {
	return &Service{
		repo: repo,
		now:  time.Now,
	}
}

// WithClock overrides the clock used for timezone-aware 365-day range calculation (useful for tests).
func (s *Service) WithClock(fn func() time.Time) *Service {
	if fn != nil {
		s.now = fn
	}
	return s
}

// localToday is the user's calendar date, as a UTC midnight to match DATE columns.
func (s *Service) localToday(ctx context.Context, userID uuid.UUID) (time.Time, error) {
	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return time.Time{}, err
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	localNow := s.now().In(loc)
	return time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, time.UTC), nil
}

// GetInsights runs Pattern Discovery over the last 90 days of the user's own check-ins.
func (s *Service) GetInsights(ctx context.Context, userID uuid.UUID) (InsightsResponse, error) {
	toDate, err := s.localToday(ctx, userID)
	if err != nil {
		return InsightsResponse{}, err
	}
	fromDate := toDate.AddDate(0, 0, -(insightWindowDays - 1))
	days, err := s.repo.GetInsightDays(ctx, userID, fromDate, toDate)
	if err != nil {
		return InsightsResponse{}, err
	}
	return DiscoverPatterns(days), nil
}

func (s *Service) GetHeatmap(ctx context.Context, userID uuid.UUID) (HeatmapResponse, error) {
	toDate, err := s.localToday(ctx, userID)
	if err != nil {
		return HeatmapResponse{}, err
	}
	fromDate := toDate.AddDate(0, 0, -(heatmapWindowDays - 1))

	data, err := s.repo.GetHeatmapAndMilestones(ctx, userID, fromDate, toDate)
	if err != nil {
		return HeatmapResponse{}, err
	}

	days := make([]HeatmapDay, 0, len(data.Days))
	for _, row := range data.Days {
		var copeChosen *string
		if row.PositiveCopeChosen.Valid {
			v := row.PositiveCopeChosen.String
			copeChosen = &v
		}
		days = append(days, HeatmapDay{
			Date:       row.LogDate.Time.Format(shared.DateLayout),
			Level:      ClassifyHeatmapLevel(row.WinsCompletedCount, copeChosen),
			WinsCount:  int(row.WinsCompletedCount),
			CopeChosen: copeChosen,
		})
	}

	return HeatmapResponse{
		Range: DateRange{
			From: fromDate.Format(shared.DateLayout),
			To:   toDate.Format(shared.DateLayout),
		},
		Milestones: Milestones{
			TotalActiveDays:   data.Milestones.TotalActiveDays,
			TotalCompleteDays: data.Milestones.TotalCompleteDays,
			TotalRecoveryDays: data.Milestones.TotalRecoveryDays,
			TotalDailyWins:    data.Milestones.TotalDailyWins,
		},
		Days: days,
	}, nil
}
