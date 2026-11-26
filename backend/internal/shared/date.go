package shared

import (
	"time"
)

const DateLayout = "2006-01-02"

// ParseDate parses a YYYY-MM-DD date string strictly.
func ParseDate(raw string) (time.Time, error) {
	t, err := time.Parse(DateLayout, raw)
	if err != nil || t.Format(DateLayout) != raw {
		return time.Time{}, ErrValidation("Invalid date format; expected YYYY-MM-DD", map[string]any{"date": "must be YYYY-MM-DD"})
	}
	return t, nil
}

// ValidateMutationDate ensures dateStr is either today or yesterday in the user's IANA timezone (PRD §7).
func ValidateMutationDate(dateStr, tzName string, now time.Time) (time.Time, error) {
	parsed, err := ParseDate(dateStr)
	if err != nil {
		return time.Time{}, err
	}

	loc, err := time.LoadLocation(tzName)
	if err != nil {
		loc = time.UTC
	}

	localNow := now.In(loc)
	today := localNow.Format(DateLayout)
	yesterday := localNow.AddDate(0, 0, -1).Format(DateLayout)

	if dateStr != today && dateStr != yesterday {
		return time.Time{}, ErrDateOutOfRange()
	}
	return parsed, nil
}
