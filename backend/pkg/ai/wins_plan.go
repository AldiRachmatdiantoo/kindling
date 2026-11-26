package ai

import "fmt"

// Limits for the per-card detail fields (PRD §5.1 wins_data).
const (
	MaxWhyThisRunes       = 240
	MaxWinStepRunes       = 120
	WinStepsCount         = 2
	MinWinDurationSeconds = 60
	MaxWinDurationSeconds = 3600
)

// WinPlan is one ready-to-run daily win: what to do, why it fits today, how to start, how long.
type WinPlan struct {
	Title           string   `json:"title"`
	WhyThis         string   `json:"why_this"`
	Steps           []string `json:"steps"`
	DurationSeconds int      `json:"duration_seconds"`
}

// WinsPlan holds the three pillar wins generated for a check-in.
type WinsPlan struct {
	Physical WinPlan `json:"physical"`
	Work     WinPlan `json:"work"`
	Soul     WinPlan `json:"soul"`
}

type planSeed struct {
	title    string
	steps    [WinStepsCount]string
	duration int
}

type tierPlans struct{ physical, work, soul planSeed }

var plansByTier = map[CalibrationTier][]tierPlans{
	TierGentle: {
		{
			physical: planSeed{"Drink a glass of water and stretch your shoulders for 3 minutes", [2]string{"Fill a glass of water and sip it slowly", "Roll your shoulders and stretch your neck side to side"}, 180},
			work:     planSeed{"Pick 1 task and break it into a 5-minute step", [2]string{"Type the one task on your mind into the slicer below", "Work on the tiny step it gives you until the timer rings"}, 300},
			soul:     planSeed{"Put screens away 20 minutes before bed tonight", [2]string{"Turn on Do Not Disturb before you get ready for bed", "Leave your phone somewhere you can't reach from bed"}, 1200},
		},
		{
			physical: planSeed{"Take a 5-minute stroll around the house, phone left behind", [2]string{"Slip on your sandals and step outside or into the hallway", "Walk slowly and look around instead of at your phone"}, 300},
			work:     planSeed{"Open your task doc and write just one opening sentence", [2]string{"Open the document and put your cursor on the empty spot", "Type one rough sentence and leave the typos alone"}, 300},
			soul:     planSeed{"Listen to one calming song without doing anything else", [2]string{"Pick one slow song you already love", "Close your eyes and just listen until it ends"}, 240},
		},
	},
	TierBalanced: {
		{
			physical: planSeed{"Take a 10-minute walk and get some fresh air", [2]string{"Put on your shoes and head outside", "Walk at an easy pace with your phone in your pocket"}, 600},
			work:     planSeed{"Do one light 10-minute focus block on your main task", [2]string{"Close every tab you don't need for this task", "Work on just this task until the timer rings"}, 600},
			soul:     planSeed{"Write down 2 small things you are grateful for today", [2]string{"Grab a notebook or open a blank note", "Write two good things, even tiny ones count"}, 300},
		},
		{
			physical: planSeed{"Do 10 minutes of light stretching between tasks", [2]string{"Stand up and give yourself a little space", "Slowly stretch your neck, shoulders, back and legs"}, 600},
			work:     planSeed{"Tidy up your priorities and spend 10 minutes on the first step", [2]string{"List today's tasks and star the most important one", "Start on the starred task until the timer rings"}, 600},
			soul:     planSeed{"Send a quick hello to a friend or family member you feel safe with", [2]string{"Think of one person who makes you feel at ease", "Send them a short message, no reply needed"}, 300},
		},
	},
	TierStandard: {
		{
			physical: planSeed{"Do 20 minutes of light exercise or a brisk walk", [2]string{"Change into comfy clothes and fill a water bottle", "Move at a pace where you can still chat"}, 1200},
			work:     planSeed{"Finish one deep focus session on today's top priority", [2]string{"Silence notifications and open only what you need", "Work on your top priority until the timer rings"}, 1500},
			soul:     planSeed{"Take 15 minutes to quietly reflect or read something you love", [2]string{"Find a quiet spot and put your phone face down", "Read or write freely until the timer rings"}, 900},
		},
		{
			physical: planSeed{"Move for 20 minutes and keep yourself hydrated", [2]string{"Fill a water bottle and keep it close", "Pick a walk, a dance or a workout and move for 20 minutes"}, 1200},
			work:     planSeed{"Wrap up one key milestone with regular breaks", [2]string{"Write down what done looks like for this milestone", "Work in one focused block, then take a short break"}, 1500},
			soul:     planSeed{"Enjoy 15 screen-free minutes this afternoon or evening", [2]string{"Put your phone in another room", "Do something slow you enjoy, like tea, music or a doodle"}, 900},
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
			Steps:           []string{p.steps[0], p.steps[1]},
			DurationSeconds: p.duration,
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
