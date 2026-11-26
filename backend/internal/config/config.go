package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv            string
	HTTPAddr          string
	DatabaseURL       string
	RedisURL          string
	JWTSecret         string
	CookieSecure      bool
	TrustedProxyCIDRs []netip.Prefix
	AIProvider        string
	GeminiAPIKey      string
	GeminiModel       string
	InstanceID        string

	RequestTimeout time.Duration
	DBQueryTimeout time.Duration
	LLMTimeout     time.Duration
}

func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		HTTPAddr:       getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:    strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisURL:       strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		AIProvider:     getEnv("AI_PROVIDER", "mock"),
		GeminiAPIKey:   strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
		GeminiModel:    strings.TrimSpace(os.Getenv("GEMINI_MODEL")),
		InstanceID:     getEnv("INSTANCE_ID", defaultHostname()),
		RequestTimeout: 12 * time.Second,
		DBQueryTimeout: 3 * time.Second,
		LLMTimeout:     8 * time.Second,
	}

	cookieSecureStr := getEnv("COOKIE_SECURE", "true")
	cookieSecure, err := strconv.ParseBool(cookieSecureStr)
	if err != nil {
		return nil, fmt.Errorf("invalid COOKIE_SECURE value %q: %w", cookieSecureStr, err)
	}
	cfg.CookieSecure = cookieSecure

	cidrsStr := getEnv("TRUSTED_PROXY_CIDRS", "172.16.0.0/12")
	prefixes, err := ParseCIDRs(cidrsStr)
	if err != nil {
		return nil, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS: %w", err)
	}
	cfg.TrustedProxyCIDRs = prefixes

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) Validate() error {
	var errs []error

	if c.AppEnv != "development" && c.AppEnv != "production" && c.AppEnv != "test" {
		errs = append(errs, fmt.Errorf("APP_ENV must be development, production, or test (got %q)", c.AppEnv))
	}
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	if c.RedisURL == "" {
		errs = append(errs, errors.New("REDIS_URL is required"))
	}
	if len(c.JWTSecret) < 32 {
		errs = append(errs, errors.New("JWT_SECRET must be at least 32 bytes"))
	}
	if c.AIProvider != "mock" && c.AIProvider != "gemini" {
		errs = append(errs, fmt.Errorf("AI_PROVIDER must be mock or gemini (got %q)", c.AIProvider))
	}
	if c.AIProvider == "gemini" && c.GeminiAPIKey == "" {
		errs = append(errs, errors.New("GEMINI_API_KEY is required when AI_PROVIDER=gemini"))
	}

	return errors.Join(errs...)
}

func ParseCIDRs(raw string) ([]netip.Prefix, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	parts := strings.Split(raw, ",")
	out := make([]netip.Prefix, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(p)
		if err != nil {
			return nil, fmt.Errorf("parse CIDR %q: %w", p, err)
		}
		out = append(out, prefix)
	}
	return out, nil
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return fallback
}

func defaultHostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "api"
	}
	return h
}
