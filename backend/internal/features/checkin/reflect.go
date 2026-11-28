package checkin

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const auditEndpointReflect = "POST /checkin/{date}/reflect"

// Reflect reads a brain dump back to the user (PRD FR-05). The text only lives in this request:
// it is not stored, not logged, and the response never contains it. The day's log must exist
// because its tier sets the tone.
func (s *Service) Reflect(ctx context.Context, userID uuid.UUID, dateStr string, req ReflectRequest) (ReflectResponse, error) {
	if valErr := req.Validate(); valErr != nil {
		return ReflectResponse{}, valErr
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return ReflectResponse{}, err
	}
	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return ReflectResponse{}, err
	}
	row, err := s.repo.GetDailyLogByDate(ctx, userID, parsedDate)
	if err != nil {
		return ReflectResponse{}, err
	}
	tier := ai.CalibrationTier(row.CalibrationTier)

	// Crisis phrases short-circuit before any AI call (PRD FR-09 & §8.4).
	if DetectCrisis(req.Text) {
		return ReflectResponse{Reflection: CrisisReflection, Themes: []string{}, SafetyFlag: true}, nil
	}

	start := time.Now()
	var (
		out    ai.ReflectOutput
		aiErr  error
		aiNote string
	)
	if s.budget != nil && !s.budget.Take(ctx, userID, parsedDate) {
		aiErr, aiNote = errDailyAILimit, shared.AINoteDailyLimit
	} else {
		out, aiErr = s.aiProvider.Reflect(ctx, ai.ReflectInput{CalibrationTier: tier, Text: req.Text})
		if aiErr == nil {
			aiErr = ai.ValidateReflectOutput(out, req.Text)
		}
	}
	latencyMs := clampLatencyMs(time.Since(start))

	isFallback := aiErr != nil
	if isFallback {
		if aiNote == "" {
			aiNote = shared.AINoteUnavailable
		}
		out = BuildReflectFallback(tier, req.Text)
		if s.logger != nil {
			// NFR-06: the brain dump and the model's reply are never logged; validator errors
			// carry neither.
			s.logger.Warn("ai reflection failed; using deterministic fallback",
				"request_id", shared.RequestIDFromContext(ctx),
				"calibration_tier", string(tier),
				"latency_ms", latencyMs,
				"err", aiErr,
			)
		}
	}

	if auditID, err := shared.NewUUIDv7(); err == nil {
		if auditErr := s.repo.InsertAiAuditLog(ctx, sqlc.InsertAiAuditLogParams{
			ID:         auditID,
			UserID:     userID,
			Endpoint:   auditEndpointReflect,
			LatencyMs:  latencyMs,
			IsFallback: isFallback,
		}); auditErr != nil && s.logger != nil {
			s.logger.Error("failed to insert ai_audit_logs",
				"request_id", shared.RequestIDFromContext(ctx),
				"endpoint", auditEndpointReflect,
				"err", auditErr,
			)
		}
	}

	themes := make([]string, 0, len(out.Themes))
	for _, t := range out.Themes {
		if t = strings.TrimSpace(t); t != "" {
			themes = append(themes, t)
		}
	}
	return ReflectResponse{
		Reflection: strings.TrimSpace(out.Reflection),
		Themes:     themes,
		AINote:     aiNote,
	}, nil
}
