package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/config"
	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/server"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "run HTTP healthcheck against local server and exit")
	flag.Parse()

	if *healthcheck {
		os.Exit(runHealthcheck())
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load configuration", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to postgres", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	redisClient, err := cache.NewRedisClient(ctx, cfg.RedisURL)
	if err != nil {
		logger.Error("failed to connect to redis", "err", err)
		os.Exit(1)
	}
	defer func() {
		_ = redisClient.Close()
	}()

	limiter := cache.NewRateLimiter(redisClient)
	idempotencyStore := cache.NewIdempotencyStore(redisClient)

	handler := server.NewHandler(server.Dependencies{
		Config:           cfg,
		Logger:           logger,
		Pool:             pool,
		Redis:            redisClient,
		Limiter:          limiter,
		IdempotencyStore: idempotencyStore,
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           http.TimeoutHandler(handler, cfg.RequestTimeout, `{"success":false,"error":{"code":"INTERNAL","message":"Request timed out","details":{}},"meta":{"request_id":""}}`),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("starting kindling api server",
			"addr", cfg.HTTPAddr,
			"env", cfg.AppEnv,
			"instance_id", cfg.InstanceID,
			"ai_provider", cfg.AIProvider,
			"gemini_models", cfg.GeminiModel,
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutting down server gracefully")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger.Error("server shutdown error", "err", err)
			os.Exit(1)
		}
		logger.Info("server stopped cleanly")
	case err := <-errCh:
		if err != nil {
			logger.Error("server exited with error", "err", err)
			os.Exit(1)
		}
	}
}

func runHealthcheck() int {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if addr[0] == ':' {
		addr = "127.0.0.1" + addr
	}
	client := &http.Client{Timeout: 2 * time.Second}
	//nolint:gosec // local container self-healthcheck against HTTP_ADDR
	resp, err := client.Get("http://" + addr + "/api/v1/health")
	if err != nil {
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusOK {
		return 0
	}
	return 1
}
