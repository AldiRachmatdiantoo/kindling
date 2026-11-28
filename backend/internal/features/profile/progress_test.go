package profile

import (
	"encoding/json"
	"testing"
	"time"
)

func day(s string, physical, work, soul bool) PillarDay {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return PillarDay{Date: d, PhysicalDone: physical, WorkDone: work, SoulDone: soul}
}

func TestComputePillarProgress_Empty(t *testing.T) {
	got := ComputePillarProgress(nil)
	for name, p := range map[string]PillarProgress{"physical": got.Physical, "work": got.Work, "soul": got.Soul} {
		if p.CompletedTotal != 0 || len(p.Checkpoints) != 0 || p.NextCheckpointAt != 3 || p.LastCompletedOn != nil {
			t.Fatalf("%s: unexpected empty progress %+v", name, p)
		}
	}
	if got.TotalCheckpoints() != 0 {
		t.Fatalf("TotalCheckpoints = %d, want 0", got.TotalCheckpoints())
	}

	// An empty pillar serialises checkpoints as [] and last_completed_on as null.
	raw, err := json.Marshal(got.Physical)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"completed_total":0,"checkpoints":[],"next_checkpoint_at":3,"last_completed_on":null}`
	if string(raw) != want {
		t.Fatalf("json = %s, want %s", raw, want)
	}
}

func TestComputePillarProgress_MixedDays(t *testing.T) {
	days := []PillarDay{
		day("2026-11-01", true, false, true),
		day("2026-11-03", true, true, false),
		day("2026-11-04", false, true, false),
		day("2026-11-08", true, false, false), // physical #3 -> checkpoint 1
		day("2026-11-09", true, true, false),  // work #3 -> checkpoint 1
		day("2026-11-12", true, false, true),
		day("2026-11-20", true, false, false), // physical #6 -> checkpoint 2
		day("2026-11-21", true, false, false),
	}
	got := ComputePillarProgress(days)

	phys := got.Physical
	if phys.CompletedTotal != 7 || phys.NextCheckpointAt != 9 {
		t.Fatalf("physical = %+v, want total 7 next 9", phys)
	}
	if len(phys.Checkpoints) != 2 ||
		phys.Checkpoints[0] != (Checkpoint{Number: 1, ReachedOn: "2026-11-08"}) ||
		phys.Checkpoints[1] != (Checkpoint{Number: 2, ReachedOn: "2026-11-20"}) {
		t.Fatalf("physical checkpoints = %+v", phys.Checkpoints)
	}
	if phys.LastCompletedOn == nil || *phys.LastCompletedOn != "2026-11-21" {
		t.Fatalf("physical last_completed_on = %v", phys.LastCompletedOn)
	}

	work := got.Work
	if work.CompletedTotal != 3 || work.NextCheckpointAt != 6 || len(work.Checkpoints) != 1 ||
		work.Checkpoints[0].ReachedOn != "2026-11-09" || *work.LastCompletedOn != "2026-11-09" {
		t.Fatalf("work = %+v", work)
	}

	soul := got.Soul
	if soul.CompletedTotal != 2 || soul.NextCheckpointAt != 3 || len(soul.Checkpoints) != 0 ||
		*soul.LastCompletedOn != "2026-11-12" {
		t.Fatalf("soul = %+v", soul)
	}

	if got.TotalCheckpoints() != 3 {
		t.Fatalf("TotalCheckpoints = %d, want 3", got.TotalCheckpoints())
	}
}

func TestServiceGetHeatmap_IncludesPillarProgress(t *testing.T) {
	repo := &stubRepo{
		tz: "UTC",
		data: HeatmapData{PillarDays: []PillarDay{
			day("2026-11-20", true, true, true),
			day("2026-11-21", true, false, true),
			day("2026-11-22", true, false, false),
		}},
	}
	svc := NewService(repo).WithClock(func() time.Time { return time.Date(2026, 11, 23, 9, 0, 0, 0, time.UTC) })
	resp, err := svc.GetHeatmap(t.Context(), [16]byte{})
	if err != nil {
		t.Fatal(err)
	}
	if resp.PillarProgress.Physical.CompletedTotal != 3 || resp.Milestones.TotalCheckpoints != 1 {
		t.Fatalf("pillar progress not wired: %+v / %+v", resp.PillarProgress, resp.Milestones)
	}
}
