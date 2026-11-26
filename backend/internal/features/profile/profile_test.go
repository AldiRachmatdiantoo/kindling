package profile

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kindling/backend/internal/database/sqlc"
)

func strPtr(s string) *string { return &s }

func TestClassifyHeatmapLevel(t *testing.T) {
	tests := []struct {
		name       string
		winsCount  int16
		copeChosen *string
		want       HeatmapLevel
	}{
		{"0 wins, no cope -> rest", 0, nil, LevelRest},
		{"0 wins, empty cope -> rest", 0, strPtr("   "), LevelRest},
		{"0 wins, cope chosen -> recovery", 0, strPtr("Pernapasan 4-7-8"), LevelRecovery},
		{"1 win, no cope -> steady", 1, nil, LevelSteady},
		{"2 wins, cope chosen -> steady", 2, strPtr("Pernapasan 4-7-8"), LevelSteady},
		{"3 wins, no cope -> complete", 3, nil, LevelComplete},
		{"3 wins, cope chosen -> complete", 3, strPtr("Pernapasan 4-7-8"), LevelComplete},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ClassifyHeatmapLevel(tc.winsCount, tc.copeChosen); got != tc.want {
				t.Fatalf("ClassifyHeatmapLevel(%d, %v) = %q, want %q", tc.winsCount, tc.copeChosen, got, tc.want)
			}
		})
	}
}

type stubRepo struct {
	tz       string
	data     HeatmapData
	gotFrom  time.Time
	gotTo    time.Time
}

func (s *stubRepo) GetUserTimezone(_ context.Context, _ uuid.UUID) (string, error) {
	return s.tz, nil
}

func (s *stubRepo) GetHeatmapAndMilestones(_ context.Context, _ uuid.UUID, fromDate, toDate time.Time) (HeatmapData, error) {
	s.gotFrom = fromDate
	s.gotTo = toDate
	return s.data, nil
}

func (s *stubRepo) GetInsightDays(_ context.Context, _ uuid.UUID, _, _ time.Time) ([]InsightDay, error) {
	return nil, nil
}

func TestServiceGetHeatmap_TimezoneAndRange(t *testing.T) {
	// 2026-11-26 20:00 UTC is 2026-11-27 03:00 in Asia/Jakarta, and 2026-11-26 15:00 in America/New_York.
	utcNow := time.Date(2026, 11, 26, 20, 0, 0, 0, time.UTC)

	t.Run("Asia/Jakarta rolls over to 2026-11-27", func(t *testing.T) {
		repo := &stubRepo{
			tz: "Asia/Jakarta",
			data: HeatmapData{
				Days: []sqlc.GetHeatmapDaysRow{
					{
						LogDate:            pgtype.Date{Time: time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC), Valid: true},
						WinsCompletedCount: 3,
						PositiveCopeChosen: pgtype.Text{String: "Pernapasan 4-7-8", Valid: true},
					},
				},
				Milestones: sqlc.GetProfileMilestonesRow{
					TotalActiveDays:   17,
					TotalCompleteDays: 12,
					TotalRecoveryDays: 5,
					TotalDailyWins:    41,
				},
			},
		}
		svc := NewService(repo).WithClock(func() time.Time { return utcNow })
		resp, err := svc.GetHeatmap(context.Background(), uuid.New())
		if err != nil {
			t.Fatalf("GetHeatmap err: %v", err)
		}
		if resp.Range.From != "2025-11-28" || resp.Range.To != "2026-11-27" {
			t.Fatalf("unexpected Jakarta range: %+v", resp.Range)
		}
		if len(resp.Days) != 1 || resp.Days[0].Level != LevelComplete {
			t.Fatalf("unexpected days: %+v", resp.Days)
		}
		if resp.Milestones.TotalDailyWins != 41 {
			t.Fatalf("unexpected milestones: %+v", resp.Milestones)
		}
	})

	t.Run("America/New_York stays on 2026-11-26 and empty days is non-nil slice", func(t *testing.T) {
		repo := &stubRepo{tz: "America/New_York"}
		svc := NewService(repo).WithClock(func() time.Time { return utcNow })
		resp, err := svc.GetHeatmap(context.Background(), uuid.New())
		if err != nil {
			t.Fatalf("GetHeatmap err: %v", err)
		}
		if resp.Range.From != "2025-11-27" || resp.Range.To != "2026-11-26" {
			t.Fatalf("unexpected NY range: %+v", resp.Range)
		}
		if resp.Days == nil || len(resp.Days) != 0 {
			t.Fatalf("expected non-nil empty Days slice, got %#v", resp.Days)
		}
	})
}
