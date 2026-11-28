package ai

import (
	"fmt"
	"strings"
)

// Limits for the per-card detail fields (PRD §5.1 wins_data).
const (
	MaxWhyThisRunes = 240
	MaxWinStepRunes = 120
	WinStepsCount   = 2
	// A physical or soul win is a roadmap of RoadmapMinSteps..RoadmapMaxSteps ordered steps
	// toward the activity itself. "Make it smaller" may split steps up to MaxRoadmapSteps.
	RoadmapMinSteps       = 3
	RoadmapMaxSteps       = 5
	MaxRoadmapSteps       = 8
	MinWinDurationSeconds = 60
	MaxWinDurationSeconds = 3600
)

// WinPlan is one ready-to-run daily win: what to do, why it fits today, how to start, how long.
type WinPlan struct {
	Title           string   `json:"title"`
	WhyThis         string   `json:"why_this"`
	Steps           []string `json:"steps"`
	DurationSeconds int      `json:"duration_seconds"`
	// FloorStep (1-based, physical and soul only) is the step that counts as showing up:
	// once it is done, today's win is in, and the steps after it are a bonus.
	FloorStep int `json:"floor_step,omitempty"`
}

// IsRoadmapPillar reports whether a pillar's win is a step-by-step roadmap (physical, soul)
// rather than the work pillar's 2 steps plus the task slicer.
func IsRoadmapPillar(pillar string) bool { return pillar == "physical" || pillar == "soul" }

// WinsPlan holds the three pillar wins generated for a check-in.
type WinsPlan struct {
	Physical WinPlan `json:"physical"`
	Work     WinPlan `json:"work"`
	Soul     WinPlan `json:"soul"`
}

// planSeed is one built-in win. Work has the 2 steps its slicer starts from; physical and soul
// have a roadmap: ordered steps where floor is the step that counts as showing up today.
type planSeed struct {
	title    string
	steps    []string
	floor    int
	duration int
}

type tierPlans struct{ physical, work, soul planSeed }

func workSeed(title, a, b string, duration int) planSeed {
	return planSeed{title: title, steps: []string{a, b}, duration: duration}
}

func roadmapSeed(title string, floor, duration int, steps ...string) planSeed {
	return planSeed{title: title, steps: steps, floor: floor, duration: duration}
}

var plansByTier = map[CalibrationTier][]tierPlans{
	TierGentle: {
		{
			physical: roadmapSeed("Drink a glass of water and stretch your shoulders for 3 minutes", 3, 180,
				"Fill a glass of water", "Sip it slowly while you sit up tall", "Roll your shoulders back five times", "Stretch your neck gently side to side"),
			work: workSeed("Pick 1 task and break it into a 5-minute step", "Type the one task on your mind into the slicer below", "Work on the tiny step it gives you until the timer rings", 300),
			soul: roadmapSeed("Put screens away 20 minutes before bed tonight", 3, 1200,
				"Set a reminder for 20 minutes before bed", "Turn on Do Not Disturb when it rings", "Leave your phone somewhere you can't reach from bed", "Do something slow until you sleep, like reading"),
		},
		{
			physical: roadmapSeed("Take a 5-minute stroll around the house, phone left behind", 3, 300,
				"Leave your phone on the table", "Slip on your sandals", "Step outside or into the hallway", "Walk slowly for 5 minutes and look around"),
			work: workSeed("Open your task doc and write just one opening sentence", "Open the document and put your cursor on the empty spot", "Type one rough sentence and leave the typos alone", 300),
			soul: roadmapSeed("Listen to one calming song without doing anything else", 3, 240,
				"Pick one slow song you already love", "Sit or lie down somewhere comfy", "Press play and close your eyes", "Just listen until it ends"),
		},
	},
	TierBalanced: {
		{
			physical: roadmapSeed("Take a 10-minute walk and get some fresh air", 3, 600,
				"Put on your shoes", "Put your phone in your pocket", "Step out the door", "Walk at an easy pace for 10 minutes"),
			work: workSeed("Do one light 10-minute focus block on your main task", "Close every tab you don't need for this task", "Work on just this task until the timer rings", 600),
			soul: roadmapSeed("Write down 2 small things you are grateful for today", 3, 300,
				"Grab a notebook or open a blank note", "Think back over today for a moment", "Write one good thing, even a tiny one", "Add a second one"),
		},
		{
			physical: roadmapSeed("Do 10 minutes of light stretching between tasks", 3, 600,
				"Stand up from your chair", "Clear a little space around you", "Stretch your neck and shoulders", "Stretch your back and legs slowly"),
			work: workSeed("Tidy up your priorities and spend 10 minutes on the first step", "List today's tasks and star the most important one", "Start on the starred task until the timer rings", 600),
			soul: roadmapSeed("Send a quick hello to a friend or family member you feel safe with", 3, 300,
				"Think of one person who makes you feel at ease", "Open your chat with them", "Send a short hello, no reply needed"),
		},
	},
	TierStandard: {
		{
			physical: roadmapSeed("Do 20 minutes of light exercise or a brisk walk", 3, 1200,
				"Change into comfy clothes", "Fill a water bottle", "Start moving: a walk, a dance or a workout", "Keep a pace where you can still chat", "Stop at 20 minutes and drink some water"),
			work: workSeed("Finish one deep focus session on today's top priority", "Silence notifications and open only what you need", "Work on your top priority until the timer rings", 1500),
			soul: roadmapSeed("Take 15 minutes to quietly reflect or read something you love", 3, 900,
				"Find a quiet spot", "Put your phone face down", "Open your book or notebook", "Read or write freely for 15 minutes"),
		},
		{
			physical: roadmapSeed("Move for 20 minutes and keep yourself hydrated", 3, 1200,
				"Fill a water bottle and keep it close", "Pick a walk, a dance or a workout", "Start moving for the first minute", "Keep going for 20 minutes"),
			work: workSeed("Wrap up one key milestone with regular breaks", "Write down what done looks like for this milestone", "Work in one focused block, then take a short break", 1500),
			soul: roadmapSeed("Enjoy 15 screen-free minutes this afternoon or evening", 3, 900,
				"Put your phone in another room", "Make a tea or pick some music", "Sit down with it, no screens", "Enjoy something slow for 15 minutes"),
		},
	},
}

// PlanWins returns deterministic, schema-valid wins for a tier. variant picks between the
// built-in sets; why_this is written from today's scores so the card explains itself.
func PlanWins(tier CalibrationTier, scores Scores, variant uint64) WinsPlan {
	sets, ok := plansByTier[tier]
	if !ok {
		sets = plansByTier[TierStandard]
	}
	set := sets[variant%uint64(len(sets))]
	build := func(pillar string, p planSeed) WinPlan {
		return WinPlan{
			Title:           p.title,
			WhyThis:         WhyThis(pillar, scores),
			Steps:           append([]string(nil), p.steps...),
			DurationSeconds: p.duration,
			FloorStep:       p.floor,
		}
	}
	return WinsPlan{
		Physical: build("physical", set.physical),
		Work:     build("work", set.work),
		Soul:     build("soul", set.soul),
	}
}

// WhyThis ties a pillar's win to the matching score from today's check-in.
func WhyThis(pillar string, s Scores) string {
	switch pillar {
	case "physical":
		p := s.PhysicalExhaustion
		switch {
		case p >= 70:
			return fmt.Sprintf("Your physical exhaustion is at %d today. Gentle movement gets your blood flowing without draining what's left.", p)
		case p >= 40:
			return fmt.Sprintf("Your body tiredness is at %d today. A little movement wakes you up without wearing you out.", p)
		default:
			return fmt.Sprintf("Your body has some energy today (tiredness %d). Moving now helps you keep it.", p)
		}
	case "work":
		w := s.WorkExhaustion
		if s.Disengagement > w {
			w = s.Disengagement
		}
		switch {
		case w >= 70:
			return fmt.Sprintf("Work exhaustion is at %d, so focus is thin. Starting with just 5 minutes gets you past that stuck feeling without asking too much.", w)
		case w >= 40:
			return fmt.Sprintf("Work tiredness is at %d. One short, clear block of focus keeps you moving without burning out.", w)
		default:
			return fmt.Sprintf("Your work energy looks good today (tiredness %d). Put it into the one task that matters most.", w)
		}
	default: // soul
		v := s.SoulWellbeing
		switch {
		case v < 40:
			return fmt.Sprintf("Your well-being score is %d today. Your mind needs a break from constant input so rest can actually restore you.", v)
		case v < 70:
			return fmt.Sprintf("Your well-being is at %d. A small moment just for you keeps it from slipping.", v)
		default:
			return fmt.Sprintf("Your well-being is a healthy %d today. A quiet moment helps you hold on to that.", v)
		}
	}
}

// habitSizes is how big a habit gets on each kind of day: title pattern and duration.
var habitSizes = map[CalibrationTier]struct {
	title    string
	duration int
}{
	TierGentle:   {"Just start: 2 minutes of %s", 120},
	TierBalanced: {"10 easy minutes of %s", 600},
	TierStandard: {"20 focused minutes of %s", 1200},
}

// HabitWin builds a deterministic win from a habit, sized to today's tier. The mock provider
// uses it, and so does every fallback when the AI is unavailable, so a habit is never lost.
func HabitWin(tier CalibrationTier, scores Scores, pillar, activity, struggle string) WinPlan {
	size, ok := habitSizes[tier]
	if !ok {
		size = habitSizes[TierBalanced]
	}
	act := strings.TrimSpace(activity)
	title := TruncateRunes(fmt.Sprintf(size.title, TruncateRunes(act, 50)), MaxTitleRunes)
	first := TruncateRunes(fmt.Sprintf("Get what you need for %s ready, nothing more", TruncateRunes(act, 60)), MaxWinStepRunes)
	plan := WinPlan{
		Title:           title,
		WhyThis:         TruncateRunes("Built from what you picked. "+WhyThis(pillar, scores), MaxWhyThisRunes),
		DurationSeconds: size.duration,
	}
	struggle = strings.TrimSpace(struggle)
	if !IsRoadmapPillar(pillar) {
		second := "Set a timer and stop when it rings, even if you are mid-way"
		if struggle != "" {
			second = TruncateRunes(fmt.Sprintf("If \"%s\" shows up, shrink it to the first minute and begin", TruncateRunes(struggle, 55)), MaxWinStepRunes)
		}
		plan.Steps = []string{first, second}
		return plan
	}
	// A roadmap toward the activity itself; starting it (step 3) is what counts today.
	start := "Start, even if it is just for one minute"
	if struggle != "" {
		start = TruncateRunes(fmt.Sprintf("If \"%s\" shows up, shrink it to one minute and start anyway", TruncateRunes(struggle, 50)), MaxWinStepRunes)
	}
	plan.Steps = []string{first, "Head to the spot where you will do it", start, "Keep going until the timer rings, then stop, even mid-way"}
	plan.FloorStep = 3
	return plan
}

// ApplyHabits swaps in a habit-built win for every pillar that has a habit.
func ApplyHabits(plan WinsPlan, tier CalibrationTier, scores Scores, habits Habits) WinsPlan {
	if h, ok := habits["physical"]; ok {
		plan.Physical = HabitWin(tier, scores, "physical", h.Activity, h.Struggle)
	}
	if h, ok := habits["work"]; ok {
		plan.Work = HabitWin(tier, scores, "work", h.Activity, h.Struggle)
	}
	if h, ok := habits["soul"]; ok {
		plan.Soul = HabitWin(tier, scores, "soul", h.Activity, h.Struggle)
	}
	return plan
}

// SplitStepTemplate splits a step without the AI: a one-minute way in, then the step itself.
// The mock provider uses it, and so does the fallback when the AI is unavailable.
func SplitStepTemplate(step string) SplitStepOutput {
	step = strings.TrimSpace(step)
	return SplitStepOutput{
		First:  TruncateRunes("Just the first minute: "+step, MaxWinStepRunes),
		Second: TruncateRunes(step, MaxWinStepRunes),
	}
}
