package wins

import "github.com/kindling/backend/pkg/ai"

// BuildSliceTaskFallback returns a deterministic, schema-valid micro-step when the AI provider fails (PRD §7.4 & §8.2).
func BuildSliceTaskFallback(tier ai.CalibrationTier) ai.SliceTaskOutput {
	switch tier {
	case ai.TierGentle:
		return ai.SliceTaskOutput{
			MicroStep:       "Buka bahan tugasmu dan kerjakan bagian pembuka paling kecil selama 5 menit tanpa mengejar sempurna.",
			DurationSeconds: 300,
		}
	case ai.TierStandard:
		return ai.SliceTaskOutput{
			MicroStep:       "Siapkan ruang kerja dan kerjakan langkah pertama tugasmu selama 10 menit dengan fokus tenang.",
			DurationSeconds: 600,
		}
	default: // TierBalanced
		return ai.SliceTaskOutput{
			MicroStep:       "Buka dokumen tugasmu dan selesaikan satu potongan kecil pertama selama 7 menit saja.",
			DurationSeconds: 420,
		}
	}
}

// BuildRecalibrateFallback returns a deterministic, schema-valid gentler target for targetLevel 1..3 (PRD §8.2 & §8.3).
func BuildRecalibrateFallback(pillar string, targetLevel int) ai.RecalibrateOutput {
	level := targetLevel
	if level < 1 {
		level = 1
	}
	if level > MaxRecalibrateLevel {
		level = MaxRecalibrateLevel
	}

	switch pillar {
	case PillarPhysical:
		titles := []string{
			"Jalan santai 5 menit atau peregangan ringan",
			"Berdiri, minum segelas air, dan regangkan bahu 2 menit",
			"Tarik napas dalam 3 kali sambil melemaskan pundak",
		}
		return ai.RecalibrateOutput{NewTitle: titles[level-1]}
	case PillarWork:
		titles := []string{
			"Kerjakan 1 langkah kecil selama 5 menit saja",
			"Buka file tugas dan tulis 1 poin atau kalimat awal",
			"Lihat judul tugas selama 1 menit lalu simpan untuk nanti",
		}
		durations := []int{300, 180, 60}
		dur := durations[level-1]
		return ai.RecalibrateOutput{
			NewTitle:        titles[level-1],
			DurationSeconds: &dur,
		}
	default: // PillarSoul
		titles := []string{
			"Dengarkan 1 lagu favorit tanpa gangguan selama 5 menit",
			"Pejamkan mata 2 menit dan beri izin diri untuk beristirahat",
			"Tarik napas pelan dan akui bahwa hari ini kamu sudah cukup berusaha",
		}
		return ai.RecalibrateOutput{NewTitle: titles[level-1]}
	}
}
