package profile

import (
	"time"

	"github.com/kindling/backend/internal/shared"
)

// winsPerCheckpoint is how many completed wins of one pillar open the next checkpoint.
const winsPerCheckpoint = 3

// PillarDay is one daily log's completion flags, the input Milestone Path is built from.
type PillarDay struct {
	Date         time.Time
	PhysicalDone bool
	WorkDone     bool
	SoulDone     bool
}

// Checkpoint marks the day a pillar's (3n)-th win was completed.
type Checkpoint struct {
	Number    int    `json:"number"`
	ReachedOn string `json:"reached_on"`
}

// PillarProgress is one pillar's lifetime Milestone Path. Past days are locked, so it only
// moves forward or stays still; unticking a win on today/yesterday is the only way it drops.
type PillarProgress struct {
	CompletedTotal   int          `json:"completed_total"`
	Checkpoints      []Checkpoint `json:"checkpoints"`
	NextCheckpointAt int          `json:"next_checkpoint_at"`
	LastCompletedOn  *string      `json:"last_completed_on"`
}

// PillarProgressSet holds the Milestone Path of all three pillars.
type PillarProgressSet struct {
	Physical PillarProgress `json:"physical"`
	Work     PillarProgress `json:"work"`
	Soul     PillarProgress `json:"soul"`
}

// TotalCheckpoints is the sum of checkpoints across the three pillars.
func (s PillarProgressSet) TotalCheckpoints() int64 {
	return int64(len(s.Physical.Checkpoints) + len(s.Work.Checkpoints) + len(s.Soul.Checkpoints))
}

type pillarCounter struct {
	p PillarProgress
}

func newPillarCounter() pillarCounter {
	return pillarCounter{p: PillarProgress{Checkpoints: []Checkpoint{}, NextCheckpointAt: winsPerCheckpoint}}
}

func (c *pillarCounter) add(date string) {
	c.p.CompletedTotal++
	d := date
	c.p.LastCompletedOn = &d
	if c.p.CompletedTotal%winsPerCheckpoint == 0 {
		c.p.Checkpoints = append(c.p.Checkpoints, Checkpoint{
			Number:    c.p.CompletedTotal / winsPerCheckpoint,
			ReachedOn: date,
		})
	}
	c.p.NextCheckpointAt = (c.p.CompletedTotal/winsPerCheckpoint + 1) * winsPerCheckpoint
}

// ComputePillarProgress walks the days oldest first. A log holds at most one win per pillar,
// so the (3n)-th completed win of a pillar lands on exactly one date. Unsorted input is fine
// for the totals but would misdate checkpoints, so callers pass rows ordered by log_date.
func ComputePillarProgress(days []PillarDay) PillarProgressSet {
	physical, work, soul := newPillarCounter(), newPillarCounter(), newPillarCounter()
	for _, d := range days {
		date := d.Date.Format(shared.DateLayout)
		if d.PhysicalDone {
			physical.add(date)
		}
		if d.WorkDone {
			work.add(date)
		}
		if d.SoulDone {
			soul.add(date)
		}
	}
	return PillarProgressSet{Physical: physical.p, Work: work.p, Soul: soul.p}
}
