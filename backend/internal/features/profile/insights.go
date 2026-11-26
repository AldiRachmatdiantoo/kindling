package profile

import (
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/kindling/backend/pkg/ai"
)

// Pattern Discovery reads the user's own recent check-ins and reports only what the data
// supports. Every insight states its sample size, needs a minimum amount of evidence, and
// is worded as a tendency, never as a promise or a diagnosis.
const (
	insightWindowDays   = 90
	minDaysForInsights  = 7
	minDaysForWeekday   = 14
	minWeekdaySamples   = 2
	weekdayPeakMargin   = 10.0
	minCopePairs        = 3
	minBaselinePairs    = 3
	copeLiftPoints      = 20.0
	minDaysForTrend     = 14
	trendShiftPoints    = 10.0
	minRecoveryDays     = 3
	maxInsightsReturned = 3
)

// InsightDay is one day of the user's history, reduced to what pattern finding needs.
type InsightDay struct {
	Date      time.Time
	Scores    ai.Scores
	Cope      string // empty when no recovery moment was picked
	WinsCount int
	WorkDone  bool
}

type Insight struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Headline   string `json:"headline"`
	Detail     string `json:"detail"`
	SampleSize int    `json:"sample_size"`
}

// InsightsResponse is the body of GET /api/v1/profile/insights.
type InsightsResponse struct {
	WindowDays   int       `json:"window_days"`
	DaysAnalyzed int       `json:"days_analyzed"`
	MinDays      int       `json:"min_days"`
	Insights     []Insight `json:"insights"`
}

func mean(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	sum := 0.0
	for _, x := range xs {
		sum += x
	}
	return sum / float64(len(xs))
}

func pct(n, d int) int {
	if d == 0 {
		return 0
	}
	return int(math.Round(float64(n) * 100 / float64(d)))
}

// weekdayPeak finds the weekday whose physical exhaustion sits clearly above the rest.
func weekdayPeak(days []InsightDay) (Insight, bool) {
	if len(days) < minDaysForWeekday {
		return Insight{}, false
	}
	byDay := map[time.Weekday][]float64{}
	for _, d := range days {
		byDay[d.Date.Weekday()] = append(byDay[d.Date.Weekday()], float64(d.Scores.PhysicalExhaustion))
	}

	best, bestGap, bestAvg, restAvg, bestN := time.Sunday, 0.0, 0.0, 0.0, 0
	for wd, vals := range byDay {
		if len(vals) < minWeekdaySamples {
			continue
		}
		var others []float64
		for owd, ovals := range byDay {
			if owd != wd {
				others = append(others, ovals...)
			}
		}
		gap := mean(vals) - mean(others)
		if gap > bestGap || (gap == bestGap && wd < best) {
			best, bestGap, bestAvg, restAvg, bestN = wd, gap, mean(vals), mean(others), len(vals)
		}
	}
	if bestGap < weekdayPeakMargin {
		return Insight{}, false
	}
	return Insight{
		ID:       "weekday-peak",
		Kind:     "weekday_peak",
		Headline: fmt.Sprintf("Your physical exhaustion tends to peak on %ss", best),
		Detail: fmt.Sprintf(
			"Across your last %d check-ins, %ss averaged %d against %d on other days. A lighter plan for %ss could go a long way.",
			len(days), best, int(math.Round(bestAvg)), int(math.Round(restAvg)), best),
		SampleSize: bestN,
	}, true
}

// copeLift looks for a recovery moment that is followed by more finished Work Wins the next day.
func copeLift(days []InsightDay) (Insight, bool) {
	type tally struct{ done, total int }
	byCope := map[string]*tally{}
	all := tally{}
	for i := 0; i+1 < len(days); i++ {
		today, next := days[i], days[i+1]
		if !next.Date.Equal(today.Date.AddDate(0, 0, 1)) {
			continue // only consecutive days count as "the next day"
		}
		all.total++
		if next.WorkDone {
			all.done++
		}
		if today.Cope == "" {
			continue
		}
		t := byCope[today.Cope]
		if t == nil {
			t = &tally{}
			byCope[today.Cope] = t
		}
		t.total++
		if next.WorkDone {
			t.done++
		}
	}

	titles := make([]string, 0, len(byCope))
	for title := range byCope {
		titles = append(titles, title)
	}
	sort.Strings(titles) // stable choice when two moments tie

	var (
		found           bool
		bestTitle       string
		bestLift        float64
		bestT, bestRest tally
	)
	for _, title := range titles {
		t := byCope[title]
		rest := tally{done: all.done - t.done, total: all.total - t.total}
		if t.total < minCopePairs || rest.total < minBaselinePairs {
			continue
		}
		lift := float64(pct(t.done, t.total) - pct(rest.done, rest.total))
		if lift >= copeLiftPoints && lift > bestLift {
			found, bestTitle, bestLift, bestT, bestRest = true, title, lift, *t, rest
		}
	}
	if !found {
		return Insight{}, false
	}
	return Insight{
		ID:       "cope-lift",
		Kind:     "cope_next_day",
		Headline: fmt.Sprintf("\"%s\" tends to set up your next day", bestTitle),
		Detail: fmt.Sprintf(
			"After the days you picked it, you finished your Work Win the next day %d of %d times (%d%%), compared with %d of %d (%d%%) after other days.",
			bestT.done, bestT.total, pct(bestT.done, bestT.total),
			bestRest.done, bestRest.total, pct(bestRest.done, bestRest.total)),
		SampleSize: bestT.total,
	}, true
}

// exhaustionTrend compares the older half of the window with the more recent half.
func exhaustionTrend(days []InsightDay) (Insight, bool) {
	if len(days) < minDaysForTrend {
		return Insight{}, false
	}
	half := len(days) / 2
	var older, recent []float64
	for i, d := range days {
		v := float64(d.Scores.PhysicalExhaustion)
		if i < half {
			older = append(older, v)
		} else {
			recent = append(recent, v)
		}
	}
	o, r := mean(older), mean(recent)
	switch {
	case o-r >= trendShiftPoints:
		return Insight{
			ID:       "trend-easing",
			Kind:     "exhaustion_trend",
			Headline: "Your physical exhaustion is easing",
			Detail: fmt.Sprintf(
				"It averaged %d in your earlier check-ins and %d in your %d most recent ones. Whatever you're doing, it's helping.",
				int(math.Round(o)), int(math.Round(r)), len(recent)),
			SampleSize: len(days),
		}, true
	case r-o >= trendShiftPoints:
		return Insight{
			ID:       "trend-rising",
			Kind:     "exhaustion_trend",
			Headline: "Physical exhaustion has been climbing lately",
			Detail: fmt.Sprintf(
				"It went from an average of %d to %d in your %d most recent check-ins. Smaller goals are a fair answer to that.",
				int(math.Round(o)), int(math.Round(r)), len(recent)),
			SampleSize: len(days),
		}, true
	}
	return Insight{}, false
}

// recoveryDays celebrates the days that were only rest, which a habit tracker would grey out.
func recoveryDays(days []InsightDay) (Insight, bool) {
	n := 0
	for _, d := range days {
		if d.Cope != "" && d.WinsCount == 0 {
			n++
		}
	}
	if n < minRecoveryDays {
		return Insight{}, false
	}
	return Insight{
		ID:         "recovery-days",
		Kind:       "recovery_days",
		Headline:   fmt.Sprintf("You took %d recovery days, and each one counted", n),
		Detail:     "On those days you picked a recovery moment and nothing else. They're on your heatmap in blue, because resting is part of the work.",
		SampleSize: n,
	}, true
}

// DiscoverPatterns returns up to three insights, strongest evidence first. days must be in
// ascending date order. With fewer than a week of check-ins it returns none.
func DiscoverPatterns(days []InsightDay) InsightsResponse {
	resp := InsightsResponse{
		WindowDays:   insightWindowDays,
		DaysAnalyzed: len(days),
		MinDays:      minDaysForInsights,
		Insights:     []Insight{},
	}
	if len(days) < minDaysForInsights {
		return resp
	}
	for _, find := range []func([]InsightDay) (Insight, bool){copeLift, weekdayPeak, exhaustionTrend, recoveryDays} {
		if in, ok := find(days); ok {
			resp.Insights = append(resp.Insights, in)
		}
		if len(resp.Insights) == maxInsightsReturned {
			break
		}
	}
	return resp
}
