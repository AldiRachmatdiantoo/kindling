package checkin

import (
	"strings"
	"unicode"
)

// CrisisDiagnosticSummary replaces the LLM summary when safety_flag is true (PRD §8.4).
// Hotline numbers must be verified before live demo (PRD §8.4 & progress.md).
const CrisisDiagnosticSummary = "Terima kasih sudah berani menuliskan perasaanmu hari ini. Kamu tidak harus menghadapi beban seberat ini sendirian. Jika kamu sedang berada dalam kondisi krisis atau merasa tidak aman, segera hubungi tenaga profesional atau layanan bantuan darurat seperti layanan SEJIWA 119 ext. 8 atau nomor darurat 112."

// crisisPhrases are normalized lowercase phrases with single spaces (PRD §8.4).
var crisisPhrases = []string{
	"bunuh diri",
	"ingin mati",
	"mau mati",
	"pengen mati",
	"mengakhiri hidup",
	"akhiri hidup",
	"menyakiti diri",
	"melukai diri",
	"self harm",
	"kill myself",
	"end my life",
	"want to die",
	"suicidal",
	"suicide",
}

// DetectCrisis deterministically scans user texts for crisis phrases before calling the LLM (PRD FR-09 & §8.4).
func DetectCrisis(texts ...string) bool {
	for _, raw := range texts {
		norm := normalizeSafetyText(raw)
		if norm == "" {
			continue
		}
		for _, phrase := range crisisPhrases {
			if strings.Contains(norm, phrase) {
				return true
			}
		}
	}
	return false
}

func normalizeSafetyText(raw string) string {
	var b strings.Builder
	b.Grow(len(raw))
	prevSpace := true
	for _, r := range strings.ToLower(raw) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevSpace = false
		} else if !prevSpace {
			b.WriteByte(' ')
			prevSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

// CrisisReflection replaces the AI read-back when the brain dump shows signs of crisis. The AI
// is not called at all in that case; the UI shows the support banner next to it.
const CrisisReflection = "Thank you for trusting this page with something this heavy. You don't have to carry it alone. Please reach out to someone you trust or a support line right now; the numbers are just below."
