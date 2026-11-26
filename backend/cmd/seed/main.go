// Command seed creates the demo account: 30 days of check-in history ending yesterday, so
// the heatmap and Pattern Discovery have something real to read while today's check-in is
// left open for a live demo. It runs through the same RLS path as the API and is safe to
// re-run: the user is reused and each day is upserted.
//
//	docker compose exec api-1 /seed            # write the demo data
//	go run ./cmd/seed -dry-run                 # print the plan and the patterns it yields
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/features/auth"
	"github.com/kindling/backend/internal/features/checkin"
	"github.com/kindling/backend/internal/features/profile"
	"github.com/kindling/backend/pkg/ai"
)

const (
	demoTimezone = "Asia/Jakarta"
	demoDays     = 30
	guitar       = "Play guitar for 10 minutes"
	breathing    = "Box Breathing 4-4-4-4"
	brainDump    = "Brain Dump and Sort It Out"
)

var demoCopeOptions = []ai.CopeOption{
	{ID: "cope_1", Title: guitar, BriefCopeCategory: "self_distraction", ToolType: ai.ToolTimer, DurationSeconds: 600,
		Guidance: "Pick any song you like and just play. No practice goals, no recording."},
	{ID: "cope_2", Title: breathing, BriefCopeCategory: "acceptance", ToolType: ai.ToolBreathing, DurationSeconds: 180,
		Guidance: "Breathe in for 4, hold for 4, breathe out for 4, hold for 4."},
	{ID: "cope_3", Title: brainDump, BriefCopeCategory: "planning", ToolType: ai.ToolBrainDump, DurationSeconds: 300,
		Guidance: "Write down what is bugging you, then mark the one thing that matters most today."},
}

// Answer sets on the app's 1..4 scale. The real scorer turns them into scores and a tier.
var (
	heavyThursday = checkin.Answers{CBI1: 4, CBI2: 4, CBI3: 3, OLBIEx1: 3, OLBIEx2: 4, OLBIDis1: 2, OLBIDis2: 2, WHO51: 2, WHO52: 2}
	earlyWeeks    = checkin.Answers{CBI1: 3, CBI2: 3, CBI3: 2, OLBIEx1: 3, OLBIEx2: 2, OLBIDis1: 2, OLBIDis2: 3, WHO51: 2, WHO52: 3}
	middleWeeks   = checkin.Answers{CBI1: 3, CBI2: 2, CBI3: 2, OLBIEx1: 2, OLBIEx2: 3, OLBIDis1: 2, OLBIDis2: 2, WHO51: 3, WHO52: 2}
	recentDays    = checkin.Answers{CBI1: 2, CBI2: 2, CBI3: 2, OLBIEx1: 2, OLBIEx2: 2, OLBIDis1: 2, OLBIDis2: 1, WHO51: 3, WHO52: 3}
)

type demoDay struct {
	date     time.Time
	answers  checkin.Answers
	scores   ai.Scores
	tier     ai.CalibrationTier
	cope     string
	physical bool
	work     bool
	soul     bool
}

func (d demoDay) winsCount() int {
	n := 0
	for _, done := range []bool{d.physical, d.work, d.soul} {
		if done {
			n++
		}
	}
	return n
}

// buildDemoDays lays out the story: heavy Thursdays that become recovery days, energy that
// slowly improves, and guitar breaks that tend to be followed by a finished Work Win.
func buildDemoDays(yesterday time.Time) []demoDay {
	var days []demoDay
	prevGuitar := false
	for i := 0; i < demoDays; i++ {
		date := yesterday.AddDate(0, 0, i-demoDays+1)
		thursday := date.Weekday() == time.Thursday
		if !thursday && (i == 9 || i == 22) {
			prevGuitar = false // no check-in that day: an honest rest day on the heatmap
			continue
		}

		d := demoDay{date: date}
		switch {
		case thursday:
			d.answers = heavyThursday
		case i < 12:
			d.answers = earlyWeeks
		case i < 21:
			d.answers = middleWeeks
		default:
			d.answers = recentDays
		}
		d.scores, d.tier = checkin.Score(d.answers)

		if thursday {
			d.cope = breathing // a heavy day: rest only, which the heatmap shows as recovery
		} else {
			switch i % 4 {
			case 1:
				d.cope = guitar
			case 3:
				d.cope = brainDump
			}
			d.physical = i%2 == 0
			d.soul = i%3 != 2
			d.work = (prevGuitar && i != 26) || i%5 == 0
		}
		prevGuitar = d.cope == guitar
		days = append(days, d)
	}
	return days
}

func intPtr(v int) *int { return &v }

func winsData(d demoDay, variant int) checkin.WinsData {
	plan := ai.PlanWins(d.tier, d.scores, uint64(variant))
	item := func(w ai.WinPlan, done bool) checkin.WinItem {
		return checkin.WinItem{Title: w.Title, WhyThis: w.WhyThis, Steps: w.Steps,
			DurationSeconds: intPtr(w.DurationSeconds), Completed: done}
	}
	return checkin.WinsData{
		Physical: item(plan.Physical, d.physical),
		Work: checkin.WorkWinItem{Title: plan.Work.Title, WhyThis: plan.Work.WhyThis, Steps: plan.Work.Steps,
			Completed: d.work, DurationSeconds: intPtr(plan.Work.DurationSeconds)},
		Soul: item(plan.Soul, d.soul),
	}
}

func yesterdayIn(tz string) time.Time {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1)
}

func toInsightDays(days []demoDay) []profile.InsightDay {
	out := make([]profile.InsightDay, 0, len(days))
	for _, d := range days {
		out = append(out, profile.InsightDay{Date: d.date, Scores: d.scores, Cope: d.cope,
			WinsCount: d.winsCount(), WorkDone: d.work})
	}
	return out
}

func printPlan(days []demoDay) {
	for _, d := range days {
		fmt.Printf("%s %-9s phys=%3d tier=%-8s wins=%d cope=%q\n", d.date.Format("2006-01-02"),
			d.date.Weekday(), d.scores.PhysicalExhaustion, d.tier, d.winsCount(), d.cope)
	}
	resp := profile.DiscoverPatterns(toInsightDays(days))
	fmt.Printf("\nPattern Discovery over %d days:\n", resp.DaysAnalyzed)
	for _, in := range resp.Insights {
		fmt.Printf("- %s\n  %s\n", in.Headline, in.Detail)
	}
}

func ensureUser(ctx context.Context, pool *pgxpool.Pool, email, password string) (uuid.UUID, bool, error) {
	q := sqlc.New(pool)
	existing, err := q.GetUserByEmail(ctx, email)
	if err == nil {
		return existing.ID, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, fmt.Errorf("look up demo user: %w", err)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return uuid.Nil, false, err
	}
	user, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		ID:           uuid.Must(uuid.NewV7()),
		Email:        email,
		PasswordHash: hash,
		FullName:     "Demo Kindling",
		Timezone:     demoTimezone,
		AiConsentAt:  pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("create demo user: %w", err)
	}
	return user.ID, true, nil
}

const upsertDemoLog = `
INSERT INTO daily_logs (
    id, user_id, log_date, raw_answers, brain_dump, fun_cope_input, scores, calibration_tier,
    diagnostic_summary, safety_flag, cope_options, positive_cope_chosen, wins_data, wins_completed_count
) VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8, FALSE, $9, $10, $11, $12)
ON CONFLICT (user_id, log_date) DO UPDATE SET
    raw_answers = EXCLUDED.raw_answers,
    fun_cope_input = EXCLUDED.fun_cope_input,
    scores = EXCLUDED.scores,
    calibration_tier = EXCLUDED.calibration_tier,
    diagnostic_summary = EXCLUDED.diagnostic_summary,
    cope_options = EXCLUDED.cope_options,
    positive_cope_chosen = EXCLUDED.positive_cope_chosen,
    wins_data = EXCLUDED.wins_data,
    wins_completed_count = EXCLUDED.wins_completed_count`

func writeDays(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, days []demoDay) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Same row-level security context the API uses, so the seed can only touch this user.
	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_user_id', $1, true)", userID.String()); err != nil {
		return err
	}
	copeJSON, _ := json.Marshal(demoCopeOptions)
	for i, d := range days {
		answersJSON, _ := json.Marshal(d.answers)
		scoresJSON, _ := json.Marshal(d.scores)
		winsJSON, _ := json.Marshal(winsData(d, i))
		var cope pgtype.Text
		if d.cope != "" {
			cope = pgtype.Text{String: d.cope, Valid: true}
		}
		summary := checkin.BuildCheckinFallback(d.tier, d.scores).DiagnosticSummary
		if _, err := tx.Exec(ctx, upsertDemoLog,
			uuid.Must(uuid.NewV7()), userID, pgtype.Date{Time: d.date, Valid: true},
			answersJSON, "Playing guitar", scoresJSON, string(d.tier), summary,
			copeJSON, cope, winsJSON, d.winsCount(),
		); err != nil {
			return fmt.Errorf("upsert %s: %w", d.date.Format("2006-01-02"), err)
		}
	}
	return tx.Commit(ctx)
}

func main() {
	dryRun := flag.Bool("dry-run", false, "print the demo days and the patterns they produce, write nothing")
	email := flag.String("email", "demo@kindling.test", "demo account email")
	flag.Parse()

	days := buildDemoDays(yesterdayIn(demoTimezone))
	if *dryRun {
		printPlan(days)
		return
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		os.Exit(1)
	}
	// Test-only credential for the local demo account; override it with SEED_DEMO_PASSWORD.
	password := os.Getenv("SEED_DEMO_PASSWORD")
	if strings.TrimSpace(password) == "" {
		password = "KindlingDemo2026!"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, err := database.NewPool(ctx, databaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer pool.Close()

	userID, created, err := ensureUser(ctx, pool, *email, password)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := writeDays(ctx, pool, userID, days); err != nil {
		fmt.Fprintln(os.Stderr, "write days:", err)
		os.Exit(1)
	}
	state := "updated"
	if created {
		state = "created"
	}
	fmt.Printf("Demo account %s (%s): %d days of history, %s to %s. Today is left open.\n",
		*email, state, len(days), days[0].date.Format("2006-01-02"), days[len(days)-1].date.Format("2006-01-02"))
}
