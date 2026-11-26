package wins

import (
	"context"
	"errors"
	"log/slog"
	"math"
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
	budget     shared.AIBudget
}

// WithAIBudget caps the user's AI calls per day; nil means no cap.
func (s *Service) WithAIBudget(b shared.AIBudget) *Service {
	s.budget = b
	return s
}

var errDailyAILimit = errors.New("daily ai limit reached")

// takeAI reports whether today's AI budget allows one more call, with the note to send if not.
func (s *Service) takeAI(ctx context.Context, userID uuid.UUID, day time.Time) (bool, string) {
	if s.budget != nil && !s.budget.Take(ctx, userID, day) {
		return false, shared.AINoteDailyLimit
	}
	return true, ""
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

	// Progressive slicing: the finished step is read from the server, never taken from the client.
	in := ai.SliceTaskInput{CalibrationTier: snap.CalibrationTier, MainTask: mainTask, StepNumber: 1}
	stepsDone := 0
	if req.NextStep {
		work := snap.WinsData.Work
		if work.MicroStep == nil || strings.TrimSpace(*work.MicroStep) == "" {
			return SliceTaskResponse{}, shared.ErrValidation("Slice a task first", map[string]any{
				"next_step": "needs a current micro-step",
			})
		}
		if work.MainTask != nil && strings.TrimSpace(*work.MainTask) != "" {
			mainTask = strings.TrimSpace(*work.MainTask)
			in.MainTask = mainTask
		}
		stepsDone = work.StepsDone + 1
		in.PreviousStep = *work.MicroStep
		in.StepNumber = stepsDone + 1
	}

	// Step 2: Call AI provider outside any DB transaction (PRD §8.1–8.2).
	start := time.Now()
	var (
		aiOut ai.SliceTaskOutput
		aiErr error
	)
	allowed, aiNote := s.takeAI(ctx, userID, parsedDate)
	if !allowed {
		aiErr = errDailyAILimit
	} else {
		aiOut, aiErr = s.aiProvider.SliceTask(ctx, in)
		if aiErr == nil {
			aiErr = ai.ValidateSliceTaskOutput(aiOut)
		}
	}
	latencyMs := clampLatencyMs(time.Since(start))

	isFallback := false
	if aiErr != nil {
		isFallback = true
		if aiNote == "" {
			aiNote = shared.AINoteUnavailable
		}
		aiOut = BuildSliceTaskFallback(snap.CalibrationTier)
		if req.NextStep {
			aiOut = BuildNextStepFallback(snap.CalibrationTier)
		}
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
	if err := s.repo.SaveSlicedTask(ctx, userID, parsedDate, mainTask, microStep, aiOut.DurationSeconds, stepsDone); err != nil {
		return SliceTaskResponse{}, err
	}

	return SliceTaskResponse{
		MainTask:        mainTask,
		MicroStep:       microStep,
		DurationSeconds: aiOut.DurationSeconds,
		StepsDone:       stepsDone,
		AINote:          aiNote,
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
	var (
		aiOut ai.RecalibrateOutput
		aiErr error
	)
	allowed, aiNote := s.takeAI(ctx, userID, parsedDate)
	if !allowed {
		aiErr = errDailyAILimit
	} else {
		aiOut, aiErr = s.aiProvider.Recalibrate(ctx, ai.RecalibrateInput{
			CalibrationTier: snap.CalibrationTier,
			Pillar:          pillar,
			CurrentTitle:    currentTitle,
			TargetLevel:     targetLevel,
		})
		if aiErr == nil {
			aiErr = ai.ValidateRecalibrateOutput(aiOut)
		}
	}
	latencyMs := clampLatencyMs(time.Since(start))
	if aiErr == nil && pillar == PillarWork {
		aiOut.DurationSeconds = capWorkDuration(aiOut.DurationSeconds, targetLevel)
	}

	isFallback := false
	if aiErr != nil {
		isFallback = true
		if aiNote == "" {
			aiNote = shared.AINoteUnavailable
		}
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
	resp, err := s.repo.ApplyRecalibration(
		ctx,
		userID,
		parsedDate,
		pillar,
		currentLevel,
		strings.TrimSpace(aiOut.NewTitle),
		aiOut.DurationSeconds,
	)
	if err != nil {
		return RecalibrateResponse{}, err
	}
	resp.AINote = aiNote
	return resp, nil
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

func clampLatencyMs(d time.Duration) int32 {
	ms := d.Milliseconds()
	if ms < 0 {
		return 0
	}
	if ms > math.MaxInt32 {
		return math.MaxInt32
	}
	return int32(ms)
}
