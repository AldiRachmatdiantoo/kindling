package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/kindling/backend/internal/shared"
)

// RealIP extracts the client IP from X-Real-IP ONLY when RemoteAddr is within trustedProxies (NFR-02).
func RealIP(trustedProxies []netip.Prefix) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clientIP := extractClientIP(r.RemoteAddr, r.Header.Get("X-Real-IP"), trustedProxies)
			ctx := shared.WithClientIP(r.Context(), clientIP)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func extractClientIP(remoteAddr, xRealIP string, trustedProxies []netip.Prefix) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	remoteIP, err := netip.ParseAddr(strings.TrimSpace(host))
	if err != nil {
		return host
	}
	remoteIP = remoteIP.Unmap()

	if isTrustedProxy(remoteIP, trustedProxies) {
		if candidate, err := netip.ParseAddr(strings.TrimSpace(xRealIP)); err == nil {
			return candidate.Unmap().String()
		}
	}
	return remoteIP.String()
}

func isTrustedProxy(ip netip.Addr, prefixes []netip.Prefix) bool {
	for _, p := range prefixes {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}
