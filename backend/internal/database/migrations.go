package database

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// ReadUpMigrations returns every *.up.sql file in dir, in version order, joined into one
// script. Integration tests apply it so they always run against the full current schema.
func ReadUpMigrations(dir string) ([]byte, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.up.sql"))
	if err != nil {
		return nil, fmt.Errorf("glob migrations: %w", err)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no up migrations in %s", dir)
	}
	sort.Strings(files)
	var out bytes.Buffer
	for _, f := range files {
		b, err := os.ReadFile(f) //nolint:gosec // test-only read of the repo's own migrations
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", filepath.Base(f), err)
		}
		out.Write(b)
		out.WriteString("\n")
	}
	return out.Bytes(), nil
}
