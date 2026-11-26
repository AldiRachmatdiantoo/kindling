package ai

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"strings"
)

// MockAiProvider returns deterministic, schema-valid outputs based on calibration_tier + input hash (PRD §8.1).
type MockAiProvider struct{}

func NewMockAiProvider() *MockAiProvider {
	return &MockAiProvider{}
}

func (m *MockAiProvider) GenerateCheckin(_ context.Context, in CheckinInput) (CheckinOutput, error) {
	seed := hashSeed(
		string(in.CalibrationTier),
		fmt.Sprintf("%d:%d:%d:%d", in.Scores.PhysicalExhaustion, in.Scores.WorkExhaustion, in.Scores.Disengagement, in.Scores.SoulWellbeing),
		strings.TrimSpace(in.FunCopeInput),
		strings.TrimSpace(in.BrainDump),
	)

	funTitle := "Jeda Menyenangkan Tanpa Target 10 Menit"
	funGuidance := "Lakukan aktivitas santai favoritmu selama 10 menit tanpa rasa bersalah atau tuntutan hasil."
	if clean := strings.TrimSpace(in.FunCopeInput); clean != "" {
		short := TruncateRunes(clean, 45)
		funTitle = TruncateRunes("Sesi Santai: "+short, MaxTitleRunes)
		funGuidance = TruncateRunes("Nikmati aktivitas ini selama beberapa menit untuk memulihkan sistem saraf sebelum mulai bekerja.", MaxGuidanceRunes)
	}

	switch in.CalibrationTier {
	case TierGentle:
		summaries := []string{
			"Kelelahan fisik atau kerjamu sedang tinggi. Hari ini cukup ambil langkah paling kecil dan beri ruang untuk pulih.",
			"Energimu sedang di titik rendah, dan itu sepenuhnya wajar. Fokus hari ini adalah menjaga percikan tetap menyala tanpa memaksa diri.",
		}
		wins := []WinsTitles{
			{
				Physical: "Minum segelas air dan regangkan bahu 3 menit",
				Work:     "Pilih 1 tugas untuk dipecah menjadi langkah 5 menit",
				Soul:     "Matikan layar 20 menit sebelum tidur malam ini",
			},
			{
				Physical: "Jalan santai 5 menit tanpa ponsel di sekitar rumah",
				Work:     "Buka dokumen tugas dan tulis 1 kalimat pembuka saja",
				Soul:     "Dengarkan 1 lagu yang menenangkan tanpa multitasking",
			},
		}
		return CheckinOutput{
			DiagnosticSummary: summaries[seed%uint64(len(summaries))],
			CopeOptions: []CopeOption{
				{
					ID:                "cope_1",
					Title:             funTitle,
					BriefCopeCategory: "self_distraction",
					ToolType:          ToolTimer,
					DurationSeconds:   600,
					Guidance:          funGuidance,
				},
				{
					ID:                "cope_2",
					Title:             "Pernapasan 4-7-8",
					BriefCopeCategory: "acceptance",
					ToolType:          ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Tarik napas 4 detik, tahan 7 detik, hembuskan perlahan 8 detik.",
				},
				{
					ID:                "cope_3",
					Title:             "Unfiltered Brain Dump",
					BriefCopeCategory: "venting",
					ToolType:          ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Tuangkan semua beban pikiran tanpa disunting agar kepala terasa lebih ringan.",
				},
			},
			Wins: wins[seed%uint64(len(wins))],
		}, nil

	case TierBalanced:
		summaries := []string{
			"Energimu cukup untuk bergerak pelan, meski ada tanda kelelahan atau rasa berjarak. Mulai dari jeda singkat lalu satu langkah ringan.",
			"Ritme hari ini cocok untuk target ringan-sedang. Pulihkan fokus sejenak agar langkah kecil terasa lebih bermakna.",
		}
		wins := []WinsTitles{
			{
				Physical: "Jalan santai 10 menit sambil menghirup udara segar",
				Work:     "Selesaikan 1 blok fokus ringan 10 menit pada tugas utama",
				Soul:     "Tulis 2 hal kecil yang kamu syukuri hari ini",
			},
			{
				Physical: "Peregangan tubuh ringan 10 menit di sela aktivitas",
				Work:     "Rapikan daftar prioritas dan kerjakan langkah pertama 10 menit",
				Soul:     "Hubungi singkat teman atau keluarga yang membuatmu nyaman",
			},
		}
		return CheckinOutput{
			DiagnosticSummary: summaries[seed%uint64(len(summaries))],
			CopeOptions: []CopeOption{
				{
					ID:                "cope_1",
					Title:             funTitle,
					BriefCopeCategory: "positive_reframing",
					ToolType:          ToolTimer,
					DurationSeconds:   480,
					Guidance:          funGuidance,
				},
				{
					ID:                "cope_2",
					Title:             "Box Breathing 4-4-4-4",
					BriefCopeCategory: "acceptance",
					ToolType:          ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Tarik 4 detik, tahan 4 detik, hembuskan 4 detik, tahan 4 detik untuk menenangkan ritme.",
				},
				{
					ID:                "cope_3",
					Title:             "Brain Dump & Pilah Beban",
					BriefCopeCategory: "planning",
					ToolType:          ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Tulis apa yang mengganjal, lalu tandai satu hal saja yang paling penting hari ini.",
				},
			},
			Wins: wins[seed%uint64(len(wins))],
		}, nil

	default: // TierStandard
		summaries := []string{
			"Kondisimu relatif stabil hari ini. Manfaatkan ritme yang nyaman ini untuk menyelesaikan 3 kemenangan harian secara seimbang.",
			"Energimu terjaga dengan baik. Tetap sisipkan jeda singkat agar konsistensi hari ini terasa ringan dan berkelanjutan.",
		}
		wins := []WinsTitles{
			{
				Physical: "Olahraga ringan atau jalan cepat 20 menit",
				Work:     "Selesaikan 1 sesi fokus mendalam pada prioritas utama hari ini",
				Soul:     "Luangkan 15 menit refleksi tenang atau membaca bacaan favorit",
			},
			{
				Physical: "Aktivitas gerak 20 menit dan cukupi hidrasi harian",
				Work:     "Tuntaskan 1 milestone utama dengan jeda istirahat teratur",
				Soul:     "Nikmati 15 menit waktu santai bebas gawai di sore atau malam hari",
			},
		}
		return CheckinOutput{
			DiagnosticSummary: summaries[seed%uint64(len(summaries))],
			CopeOptions: []CopeOption{
				{
					ID:                "cope_1",
					Title:             funTitle,
					BriefCopeCategory: "active_coping",
					ToolType:          ToolTimer,
					DurationSeconds:   300,
					Guidance:          funGuidance,
				},
				{
					ID:                "cope_2",
					Title:             "Pernapasan Reset Fokus",
					BriefCopeCategory: "acceptance",
					ToolType:          ToolBreathing,
					DurationSeconds:   120,
					Guidance:          "Ambil napas perlahan selama 2 menit untuk menjaga kejernihan sebelum mulai.",
				},
				{
					ID:                "cope_3",
					Title:             "Catatan Niat Harian",
					BriefCopeCategory: "planning",
					ToolType:          ToolBrainDump,
					DurationSeconds:   240,
					Guidance:          "Tulis singkat apa yang ingin kamu rasakan dan selesaikan hari ini.",
				},
			},
			Wins: wins[seed%uint64(len(wins))],
		}, nil
	}
}

func (m *MockAiProvider) SliceTask(_ context.Context, in SliceTaskInput) (SliceTaskOutput, error) {
	clean := TruncateRunes(strings.TrimSpace(in.MainTask), 60)
	duration := 420
	if in.CalibrationTier == TierGentle {
		duration = 300
	} else if in.CalibrationTier == TierStandard {
		duration = 600
	}
	step := fmt.Sprintf("Buka bahan untuk \"%s\" dan kerjakan bagian pembuka paling kecil selama %d menit tanpa mengejar sempurna.", clean, duration/60)
	return SliceTaskOutput{
		MicroStep:       TruncateRunes(step, MaxMicroStepRunes),
		DurationSeconds: duration,
	}, nil
}

func (m *MockAiProvider) Recalibrate(_ context.Context, in RecalibrateInput) (RecalibrateOutput, error) {
	level := in.TargetLevel
	if level < 1 {
		level = 1
	}
	if level > 3 {
		level = 3
	}

	var title string
	switch in.Pillar {
	case "physical":
		titles := []string{
			"Jalan santai 5 menit atau peregangan ringan",
			"Berdiri, minum segelas air, dan regangkan bahu 2 menit",
			"Tarik napas dalam 3 kali sambil melemaskan pundak",
		}
		title = titles[level-1]
	case "work":
		titles := []string{
			"Kerjakan 1 langkah kecil selama 5 menit saja",
			"Buka file tugas dan tulis 1 poin atau kalimat awal",
			"Lihat judul tugas selama 1 menit lalu simpan untuk nanti",
		}
		title = titles[level-1]
		dur := []int{300, 180, 60}[level-1]
		return RecalibrateOutput{
			NewTitle:        title,
			DurationSeconds: &dur,
		}, nil
	default: // soul
		titles := []string{
			"Dengarkan 1 lagu favorit tanpa gangguan selama 5 menit",
			"Pejamkan mata 2 menit dan beri izin diri untuk beristirahat",
			"Tarik napas pelan dan akui bahwa hari ini kamu sudah cukup berusaha",
		}
		title = titles[level-1]
	}

	return RecalibrateOutput{NewTitle: title}, nil
}

func hashSeed(parts ...string) uint64 {
	h := sha256.New()
	for _, p := range parts {
		_, _ = h.Write([]byte(p))
		_, _ = h.Write([]byte{0})
	}
	sum := h.Sum(nil)
	return binary.BigEndian.Uint64(sum[:8])
}
