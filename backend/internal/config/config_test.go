package config_test

import (
	"testing"

	"github.com/kindling/backend/internal/config"
)

func TestConfigValidate(t *testing.T) {
	valid := func() config.Config {
		return config.Config{
			AppEnv:      "development",
			HTTPAddr:    ":8080",
			DatabaseURL: "postgres://user:pass@localhost:5432/kindling",
			RedisURL:    "redis://localhost:6379/0",
			JWTSecret:   "01234567890123456789012345678901",
			AIProvider:  "mock",
		}
	}

	t.Run("valid mock config passes", func(t *testing.T) {
		c := valid()
		if err := c.Validate(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("short JWT secret fails", func(t *testing.T) {
		c := valid()
		c.JWTSecret = "short"
		if err := c.Validate(); err == nil {
			t.Fatal("expected error for short JWT_SECRET")
		}
	})

	t.Run("gemini without API key fails", func(t *testing.T) {
		c := valid()
		c.AIProvider = "gemini"
		c.GeminiAPIKey = ""
		if err := c.Validate(); err == nil {
			t.Fatal("expected error for gemini without GEMINI_API_KEY")
		}
	})

	t.Run("parse CIDRs", func(t *testing.T) {
		prefixes, err := config.ParseCIDRs("127.0.0.1/32, 172.16.0.0/12")
		if err != nil {
			t.Fatalf("ParseCIDRs failed: %v", err)
		}
		if len(prefixes) != 2 {
			t.Fatalf("expected 2 prefixes, got %d", len(prefixes))
		}
	})
}
