package shared

import (
	"fmt"

	"github.com/google/uuid"
)

// NewUUIDv7 generates a time-ordered UUIDv7 in Go to minimize PostgreSQL B-Tree fragmentation.
func NewUUIDv7() (uuid.UUID, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return uuid.Nil, fmt.Errorf("generate uuidv7: %w", err)
	}
	return id, nil
}

// MustUUIDv7 generates a UUIDv7 and panics if the system entropy source fails.
func MustUUIDv7() uuid.UUID {
	id, err := NewUUIDv7()
	if err != nil {
		panic(err)
	}
	return id
}
