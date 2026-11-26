package checkin

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const auditEndpointCheckin = "POST /checkin"

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

func (s *Service) SubmitCheckin(ctx context.Context, userID uuid.UUID, req CheckinRequest) (DailyLogResponse, error) {
	answers, valErr := req.Validate()
	if valErr != nil {
		return DailyLogResponse{}, valErr
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return DailyLogResponse{}, err
	}

	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(req.LogDate), tz, s.now())
	if err != nil {
		return DailyLogResponse{}, err
	}

	// Deterministic psychometric scoring before any LLM call (PRD FR-04 & §2.1).
	scores, tier := Score(answers)

	// Deterministic crisis phrase detection before LLM call (PRD FR-09 & §8.4).
	safetyFlag := DetectCrisis(req.BrainDump, req.FunCopeInput)

	// Call AI provider outside any DB transaction (PRD §8.1–8.2).
	start := time.Now()
	aiOut, aiErr := s.aiProvider.GenerateCheckin(ctx, ai.CheckinInput{
		Scores:          scores,
		CalibrationTier: tier,
		BrainDump:       req.BrainDump,
		FunCopeInput:    req.FunCopeInput,
	})
	if aiErr == nil {
		aiErr = ai.ValidateCheckinOutput(aiOut)
	}
	latencyMs := clampLatencyMs(time.Since(start))

	isFallback := false
	if aiErr != nil {
		isFallback = true
		aiOut = BuildCheckinFallback(tier)
		if s.logger != nil {
			// NFR-06: never log brain_dump, fun_cope_input, or LLM output.
			s.logger.Warn("ai checkin generation failed; using deterministic fallback",
				"request_id", shared.RequestIDFromContext(ctx),
				"calibration_tier", string(tier),
				"latency_ms", latencyMs,
				"err", aiErr,
			)
		}
	}

	// Record metadata-only audit log (PRD §5.2, NFR-06, §8.2).
	if auditID, err := shared.NewUUIDv7(); err == nil {
		if auditErr := s.repo.InsertAiAuditLog(ctx, sqlc.InsertAiAuditLogParams{
			ID:         auditID,
			UserID:     userID,
			Endpoint:   auditEndpointCheckin,
			LatencyMs:  latencyMs,
			IsFallback: isFallback,
		}); auditErr != nil && s.logger != nil {
			s.logger.Error("failed to insert ai_audit_logs",
				"request_id", shared.RequestIDFromContext(ctx),
				"endpoint", auditEndpointCheckin,
				"err", auditErr,
			)
		}
	}

	// PRD §8.4: when safety_flag is true, replace diagnostic_summary with empathetic crisis template.
	if safetyFlag {
		aiOut.DiagnosticSummary = CrisisDiagnosticSummary
	}

	winsData := WinsData{
		Physical: WinItem{Title: strings.TrimSpace(aiOut.Wins.Physical), Level: 0, Completed: false},
		Work: WorkWinItem{
			Title:           strings.TrimSpace(aiOut.Wins.Work),
			Level:           0,
			Completed:       false,
			MainTask:        nil,
			MicroStep:       nil,
			DurationSeconds: nil,
		},
		Soul: WinItem{Title: strings.TrimSpace(aiOut.Wins.Soul), Level: 0, Completed: false},
	}

	rawAnswersJSON, err := json.Marshal(answers)
	if err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("marshal raw_answers: %w", err))
	}
	scoresJSON, err := json.Marshal(scores)
	if err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("marshal scores: %w", err))
	}
	copeOptionsJSON, err := json.Marshal(aiOut.CopeOptions)
	if err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("marshal cope_options: %w", err))
	}
	winsDataJSON, err := json.Marshal(winsData)
	if err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("marshal wins_data: %w", err))
	}

	logID, err := shared.NewUUIDv7()
	if err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("generate daily_log id: %w", err))
	}

	row, err := s.repo.UpsertDailyLog(ctx, userID, sqlc.UpsertDailyLogParams{
		ID:                logID,
		UserID:            userID,
		LogDate:           pgtype.Date{Time: parsedDate, Valid: true},
		RawAnswers:        rawAnswersJSON,
		BrainDump:         req.BrainDump,
		FunCopeInput:      req.FunCopeInput,
		Scores:            scoresJSON,
		CalibrationTier:   string(tier),
		DiagnosticSummary: strings.TrimSpace(aiOut.DiagnosticSummary),
		SafetyFlag:        safetyFlag,
		CopeOptions:       copeOptionsJSON,
		WinsData:          winsDataJSON,
	})
	if err != nil {
		return DailyLogResponse{}, err
	}

	return mapDailyLogToResponse(row)
}

func (s *Service) GetByDate(ctx context.Context, userID uuid.UUID, dateStr string) (DailyLogResponse, error) {
	parsedDate, err := shared.ParseDate(strings.TrimSpace(dateStr))
	if err != nil {
		return DailyLogResponse{}, err
	}

	row, err := s.repo.GetDailyLogByDate(ctx, userID, parsedDate)
	if err != nil {
		return DailyLogResponse{}, err
	}
	return mapDailyLogToResponse(row)
}

func (s *Service) GetToday(ctx context.Context, userID uuid.UUID) (DailyLogResponse, error) {
	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return DailyLogResponse{}, err
	}

	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	todayStr := s.now().In(loc).Format(shared.DateLayout)
	return s.GetByDate(ctx, userID, todayStr)
}

func (s *Service) ChooseCope(ctx context.Context, userID uuid.UUID, dateStr string, req CopeUpdateRequest) (CopeUpdateResponse, error) {
	copeID := strings.TrimSpace(req.CopeOptionID)
	if copeID == "" {
		return CopeUpdateResponse{}, shared.ErrValidation("Invalid cope_option_id", map[string]any{
			"cope_option_id": "is required",
		})
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return CopeUpdateResponse{}, err
	}

	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return CopeUpdateResponse{}, err
	}

	chosenTitle, err := s.repo.ChooseCopeOption(ctx, userID, parsedDate, copeID)
	if err != nil {
		return CopeUpdateResponse{}, err
	}
	return CopeUpdateResponse{PositiveCopeChosen: chosenTitle}, nil
}

func mapDailyLogToResponse(row sqlc.DailyLog) (DailyLogResponse, error) {
	var scores ai.Scores
	if err := json.Unmarshal(row.Scores, &scores); err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("unmarshal scores: %w", err))
	}
	var copeOptions []ai.CopeOption
	if err := json.Unmarshal(row.CopeOptions, &copeOptions); err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("unmarshal cope_options: %w", err))
	}
	var winsData WinsData
	if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
		return DailyLogResponse{}, shared.ErrInternal(fmt.Errorf("unmarshal wins_data: %w", err))
	}

	var positiveCope *string
	if row.PositiveCopeChosen.Valid {
		v := row.PositiveCopeChosen.String
		positiveCope = &v
	}

	return DailyLogResponse{
		ID:                 row.ID.String(),
		LogDate:            row.LogDate.Time.Format(shared.DateLayout),
		Scores:             scores,
		CalibrationTier:    ai.CalibrationTier(row.CalibrationTier),
		DiagnosticSummary:  row.DiagnosticSummary,
		SafetyFlag:         row.SafetyFlag,
		CopeOptions:        copeOptions,
		PositiveCopeChosen: positiveCope,
		WinsData:           winsData,
		WinsCompletedCount: int(row.WinsCompletedCount),
	}, nil
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
