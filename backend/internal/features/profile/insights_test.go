package profile

import (
	"strings"
	"testing"
	"time"

	"github.com/kindling/backend/pkg/ai"
)

// buildDays makes n consecutive days ending the day before 2026-11-26 (a Thursday).
func buildDays(n int, fill func(i int, d *InsightDay)) []InsightDay {
	end := time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC)
	days := make([]InsightDay, n)
	for i := 0; i < n; i++ {
		days[i] = InsightDay{
			Date:   end.AddDate(0, 0, i-n+1),
			Scores: ai.Scores{PhysicalExhaustion: 50, WorkExhaustion: 50, Disengagement: 40, SoulWellbeing: 50},
		}
		fill(i, &days[i])
	}
	return days
}

func findInsight(resp InsightsResponse, kind string) (Insight, bool) {
	for _, in := range resp.Insights {
		if in.Kind == kind {
			return in, true
		}
	}
	return Insight{}, false
}

func TestDiscoverPatterns_NeedsAWeekOfCheckins(t *testing.T) {
	resp := DiscoverPatterns(buildDays(6, func(int, *InsightDay) {}))
	if len(resp.Insights) != 0 || resp.MinDays != 7 || resp.DaysAnalyzed != 6 {
		t.Fatalf("expected no insights below a week, got %+v", resp)
	}
}

func TestDiscoverPatterns_SaysNothingWhenThereIsNoPattern(t *testing.T) {
	resp := DiscoverPatterns(buildDays(30, func(i int, d *InsightDay) {
		d.WorkDone = i%2 == 0
		if i%3 == 0 {
			d.Cope = "Box breathing"
		}
	}))
	for _, kind := range []string{"weekday_peak", "cope_next_day", "exhaustion_trend"} {
		if in, ok := findInsight(resp, kind); ok {
			t.Fatalf("flat data must not produce %s, got %+v", kind, in)
		}
	}
}

func TestDiscoverPatterns_FindsTheWeekdayPeak(t *testing.T) {
	resp := DiscoverPatterns(buildDays(28, func(_ int, d *InsightDay) {
		if d.Date.Weekday() == time.Thursday {
			d.Scores.PhysicalExhaustion = 85
		}
	}))
	in, ok := findInsight(resp, "weekday_peak")
	if !ok {
		t.Fatalf("expected a weekday peak, got %+v", resp.Insights)
	}
	if !strings.Contains(in.Headline, "Thursdays") || !strings.Contains(in.Detail, "averaged 85 against 50") {
		t.Fatalf("unexpected insight: %+v", in)
	}
	if in.SampleSize != 4 {
		t.Fatalf("expected 4 Thursdays, got %d", in.SampleSize)
	}
}

func TestDiscoverPatterns_FindsACopeThatHelpsTheNextDay(t *testing.T) {
	const guitar = "Play guitar for 10 minutes"
	resp := DiscoverPatterns(buildDays(30, func(i int, d *InsightDay) {
		if i%5 == 0 && i < 25 {
			d.Cope = guitar // days 0, 5, 10, 15, 20
		}
		// The day after guitar: work done 4 of 5 times. Otherwise only on days 3 and 13.
		switch i {
		case 1, 6, 11, 16, 3, 13:
			d.WorkDone = true
		}
	}))
	in, ok := findInsight(resp, "cope_next_day")
	if !ok {
		t.Fatalf("expected a cope insight, got %+v", resp.Insights)
	}
	if !strings.Contains(in.Headline, guitar) {
		t.Fatalf("wrong cope: %+v", in)
	}
	if !strings.Contains(in.Detail, "4 of 5 times (80%)") || !strings.Contains(in.Detail, "2 of 24 (8%)") {
		t.Fatalf("the detail must show the real counts, got %q", in.Detail)
	}
}

func TestDiscoverPatterns_SkipsGapsWhenPairingNextDays(t *testing.T) {
	days := buildDays(10, func(i int, d *InsightDay) {
		d.Cope = "Walk"
		d.WorkDone = true
	})
	// Remove every other day: no two remaining days are consecutive, so no pairs exist.
	var sparse []InsightDay
	for i, d := range days {
		if i%2 == 0 {
			sparse = append(sparse, d)
		}
	}
	if _, ok := copeLift(sparse); ok {
		t.Fatal("non-consecutive days must not count as next-day pairs")
	}
}

func TestDiscoverPatterns_CelebratesRecoveryDays(t *testing.T) {
	resp := DiscoverPatterns(buildDays(10, func(i int, d *InsightDay) {
		if i < 3 {
			d.Cope = "Rest"
		}
	}))
	in, ok := findInsight(resp, "recovery_days")
	if !ok || !strings.Contains(in.Headline, "3 recovery days") {
		t.Fatalf("expected the recovery insight, got %+v", resp.Insights)
	}
}
