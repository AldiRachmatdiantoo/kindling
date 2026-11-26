package checkin

import "github.com/kindling/backend/pkg/ai"

// BuildCheckinFallback returns a deterministic, schema-valid template per calibration_tier (PRD §8.2).
func BuildCheckinFallback(tier ai.CalibrationTier) ai.CheckinOutput {
	switch tier {
	case ai.TierGentle:
		return ai.CheckinOutput{
			DiagnosticSummary: "Energimu sedang sangat terbatas hari ini. Tidak apa-apa melambat—cukup pilih satu jeda pemulihan dan langkah paling kecil.",
			CopeOptions: []ai.CopeOption{
				{
					ID:                "cope_1",
					Title:             "Jeda Santai Tanpa Target 5 Menit",
					BriefCopeCategory: "self_distraction",
					ToolType:          ai.ToolTimer,
					DurationSeconds:   300,
					Guidance:          "Beri dirimu izin 5 menit untuk melakukan hal ringan yang kamu sukai tanpa tuntutan hasil.",
				},
				{
					ID:                "cope_2",
					Title:             "Pernapasan 4-7-8",
					BriefCopeCategory: "acceptance",
					ToolType:          ai.ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Tarik napas 4 detik, tahan 7 detik, lalu hembuskan perlahan selama 8 detik.",
				},
				{
					ID:                "cope_3",
					Title:             "Unfiltered Brain Dump",
					BriefCopeCategory: "venting",
					ToolType:          ai.ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Tulis apa pun yang sedang memenuhi kepalamu tanpa perlu rapi atau disunting.",
				},
			},
			Wins: ai.WinsTitles{
				Physical: "Minum segelas air putih dan regangkan tubuh 3 menit",
				Work:     "Pilih 1 tugas untuk dipecah menjadi langkah mikro 5 menit",
				Soul:     "Jauhkan layar 20 menit sebelum tidur malam ini",
			},
		}

	case ai.TierBalanced:
		return ai.CheckinOutput{
			DiagnosticSummary: "Ada tanda kelelahan atau rasa berjarak hari ini, namun kamu masih punya ruang untuk bergerak pelan dengan target ringan-sedang.",
			CopeOptions: []ai.CopeOption{
				{
					ID:                "cope_1",
					Title:             "Waktu Santai Terukur 8 Menit",
					BriefCopeCategory: "positive_reframing",
					ToolType:          ai.ToolTimer,
					DurationSeconds:   480,
					Guidance:          "Ambil jeda singkat dengan aktivitas menyenangkan untuk mengembalikan rasa kendali.",
				},
				{
					ID:                "cope_2",
					Title:             "Box Breathing 4-4-4-4",
					BriefCopeCategory: "acceptance",
					ToolType:          ai.ToolBreathing,
					DurationSeconds:   180,
					Guidance:          "Tarik 4 detik, tahan 4 detik, hembuskan 4 detik, tahan 4 detik secara tenang.",
				},
				{
					ID:                "cope_3",
					Title:             "Brain Dump & Satu Prioritas",
					BriefCopeCategory: "planning",
					ToolType:          ai.ToolBrainDump,
					DurationSeconds:   300,
					Guidance:          "Tuangkan isi pikiranmu, lalu tandai satu hal kecil saja yang paling masuk akal hari ini.",
				},
			},
			Wins: ai.WinsTitles{
				Physical: "Jalan santai 10 menit tanpa melihat ponsel",
				Work:     "Selesaikan 1 blok fokus ringan 10 menit pada satu tugas",
				Soul:     "Catat 2 hal sederhana yang membuatmu sedikit lega hari ini",
			},
		}

	default: // ai.TierStandard
		return ai.CheckinOutput{
			DiagnosticSummary: "Kondisimu cukup stabil hari ini. Jaga ritme yang sehat dengan jeda singkat dan tiga kemenangan harian yang seimbang.",
			CopeOptions: []ai.CopeOption{
				{
					ID:                "cope_1",
					Title:             "Jeda Pemulihan Ringan 5 Menit",
					BriefCopeCategory: "active_coping",
					ToolType:          ai.ToolTimer,
					DurationSeconds:   300,
					Guidance:          "Nikmati jeda singkat sebelum memulai agar fokus tetap jernih dan tidak terburu-buru.",
				},
				{
					ID:                "cope_2",
					Title:             "Pernapasan Reset Fokus",
					BriefCopeCategory: "acceptance",
					ToolType:          ai.ToolBreathing,
					DurationSeconds:   120,
					Guidance:          "Tarik dan hembuskan napas perlahan selama 2 menit untuk menyelaraskan ritme tubuh.",
				},
				{
					ID:                "cope_3",
					Title:             "Catatan Niat Harian",
					BriefCopeCategory: "planning",
					ToolType:          ai.ToolBrainDump,
					DurationSeconds:   240,
					Guidance:          "Tulis singkat prioritas utamamu dan hal baik yang ingin kamu jaga hari ini.",
				},
			},
			Wins: ai.WinsTitles{
				Physical: "Gerak tubuh atau jalan cepat 20 menit hari ini",
				Work:     "Selesaikan 1 sesi fokus terarah pada tugas prioritas utama",
				Soul:     "Luangkan 15 menit waktu tenang untuk refleksi atau hobi favorit",
			},
		}
	}
}
