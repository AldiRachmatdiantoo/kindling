package wins

import (
	"context"
	"log/slog"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const (
	auditEndpointSliceTask   = "POST /wins/{date}/slice-task"
	auditEndpointRecalibrate = "POST /wins/{date}/recalibrate"
)

type Service struct {
	repo       Repository
	aiProvider ai.AiProvider
	logger     *slog.Logger
	now        func() time.Time
}

func NewService(repo Repository, aiProvider ai.AiProvider, logger *slog.Logger) *Service {
	if aiProvider == nil {
		aiProvider = ai.NewMockAiProvider()
	}
	return &Service{
		repo:       repo,
		aiProvider: aiProvider,
		logger:     logger,
		now:        time.Now,
	}
}

// WithClock overrides the clock used for timezone date validation (useful for tests).
func (s *Service) WithClock(fn func() time.Time) *Service {
	if fn != nil {
		s.now = fn
	}
	return s
}

func (s *Service) SliceTask(ctx context.Context, userID uuid.UUID, dateStr string, req SliceTaskRequest) (SliceTaskResponse, error) {
	mainTask, valErr := req.Validate()
	if valErr != nil {
		return SliceTaskResponse{}, valErr
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return SliceTaskResponse{}, err
	}

	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return SliceTaskResponse{}, err
	}

	// Step 1: Read daily_log outside lock to verify existence and obtain calibration_tier.
	snap, err := s.repo.GetDailyWins(ctx, userID, parsedDate)
	if err != nil {
		return SliceTaskResponse{}, err
	}

	// Step 2: Call AI provider outside any DB transaction (PRD §8.1–8.2).
	start := time.Now()
	aiOut, aiErr := s.aiProvider.SliceTask(ctx, ai.SliceTaskInput{
		CalibrationTier: snap.CalibrationTier,
		MainTask:        mainTask,
	})
	if aiErr == nil {
		aiErr = ai.ValidateSliceTaskOutput(aiOut)
	}
	latencyMs := int32(time.Since(start).Milliseconds())

	isFallback := false
	if aiErr != nil {
		isFallback = true
		aiOut = BuildSliceTaskFallback(snap.CalibrationTier)
		if s.logger != nil {
			// NFR-06: never log main_task or LLM output.
			s.logger.Warn("ai slice-task failed; using deterministic fallback",
				"request_id", shared.RequestIDFromContext(ctx),
				"calibration_tier", string(snap.CalibrationTier),
				"latency_ms", latencyMs,
				"err", aiErr,
			)
		}
	}

	s.recordAuditLog(ctx, userID, auditEndpointSliceTask, latencyMs, isFallback)

	microStep := strings.TrimSpace(aiOut.MicroStep)
	if err := s.repo.SaveSlicedTask(ctx, userID, parsedDate, mainTask, microStep, aiOut.DurationSeconds); err != nil {
		return SliceTaskResponse{}, err
	}

	return SliceTaskResponse{
		MainTask:        mainTask,
		MicroStep:       microStep,
		DurationSeconds: aiOut.DurationSeconds,
	}, nil
}

// Recalibrate implements the 3-step lock-free AI recalibration flow (PRD §8.3):
// 1. Unlocked WithUserTx read -> check level == 3 -> 422 MIN_LEVEL_REACHED.
// 2. Call AiProvider.Recalibrate outside any transaction.
// 3. Locked WithUserTx (SELECT ... FOR UPDATE) -> check level unchanged (else 409 CONCURRENT_MODIFICATION) -> write & commit.
func (s *Service) Recalibrate(ctx context.Context, userID uuid.UUID, dateStr string, req RecalibrateRequest) (RecalibrateResponse, error) {
	pillar, valErr := req.Validate()
	if valErr != nil {
		return RecalibrateResponse{}, valErr
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return RecalibrateResponse{}, err
	}

	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return RecalibrateResponse{}, err
	}

	// Step 1: Unlocked read via WithUserTx.
	snap, err := s.repo.GetDailyWins(ctx, userID, parsedDate)
	if err != nil {
		return RecalibrateResponse{}, err
	}

	currentTitle, currentLevel, _, err := snap.WinsData.PillarTarget(pillar)
	if err != nil {
		return RecalibrateResponse{}, err
	}
	if currentLevel >= MaxRecalibrateLevel {
		return RecalibrateResponse{}, shared.ErrMinLevelReached()
	}

	targetLevel := currentLevel + 1

	// Step 2: Call AI provider OUTSIDE any DB transaction (PRD §8.3).
	start := time.Now()
	aiOut, aiErr := s.aiProvider.Recalibrate(ctx, ai.RecalibrateInput{
		CalibrationTier: snap.CalibrationTier,
		Pillar:          pillar,
		CurrentTitle:    currentTitle,
		TargetLevel:     targetLevel,
	})
	if aiErr == nil {
		aiErr = ai.ValidateRecalibrateOutput(aiOut)
	}
	latencyMs := int32(time.Since(start).Milliseconds())

	isFallback := false
	if aiErr != nil {
		isFallback = true
		aiOut = BuildRecalibrateFallback(pillar, targetLevel)
		if s.logger != nil {
			// NFR-06: never log user text or LLM output.
			s.logger.Warn("ai recalibrate failed; using deterministic fallback",
				"request_id", shared.RequestIDFromContext(ctx),
				"pillar", pillar,
				"target_level", targetLevel,
				"latency_ms", latencyMs,
				"err", aiErr,
			)
		}
	}

	s.recordAuditLog(ctx, userID, auditEndpointRecalibrate, latencyMs, isFallback)

	// Step 3: Locked FOR UPDATE write with optimistic level version check (PRD §8.3).
	return s.repo.ApplyRecalibration(
		ctx,
		userID,
		parsedDate,
		pillar,
		currentLevel,
		strings.TrimSpace(aiOut.NewTitle),
		aiOut.DurationSeconds,
	)
}

func (s *Service) Toggle(ctx context.Context, userID uuid.UUID, dateStr string, req ToggleWinRequest) (ToggleWinResponse, error) {
	pillar, completed, valErr := req.Validate()
	if valErr != nil {
		return ToggleWinResponse{}, valErr
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return ToggleWinResponse{}, err
	}

	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return ToggleWinResponse{}, err
	}

	return s.repo.ToggleWin(ctx, userID, parsedDate, pillar, completed)
}

func (s *Service) recordAuditLog(ctx context.Context, userID uuid.UUID, endpoint string, latencyMs int32, isFallback bool) {
	auditID, err := shared.NewUUIDv7()
	if err != nil {
		return
	}
	if err := s.repo.InsertAiAuditLog(ctx, sqlc.InsertAiAuditLogParams{
		ID:         auditID,
		UserID:     userID,
		Endpoint:   endpoint,
		LatencyMs:  latencyMs,
		IsFallback: isFallback,
	}); err != nil && s.logger != nil {
		s.logger.Error("failed to insert ai_audit_logs",
			"request_id", shared.RequestIDFromContext(ctx),
			"endpoint", endpoint,
			"err", err,
		)
	}
}
