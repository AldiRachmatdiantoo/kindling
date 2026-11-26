# progress.md — Kindling: Pelacak Progres & Prompt Handoff Antar-Modul

**Status Terkini:** Modul 1–4 selesai & terverifikasi. Siap memulai **Modul 5**.
**Target Selesai Kode:** 1 Desember 2026 · **Deadline Submisi:** 7 Desember 2026

---

## Checklist Modul

| # | Modul | Target | Status |
| :-: | :--- | :--- | :-: |
| 1 | Infra Docker, NGINX LB, Schema/Index/RLS + `sqlc`, Redis Lua limiter, Go core | 26 Nov | ☑ |
| 2 | `auth`: Argon2id, JWT + cookie, refresh rotation + reuse detection, CSRF, tests | 27 Nov | ☑ |
| 3 | `checkin` + `pkg/ai`: scorer, tier, safety, Mock/Gemini + breaker + fallback, idempotency, UPSERT | 28 Nov | ☑ |
| 4 | `wins` + `profile`: slice-task, recalibrate (FOR UPDATE + versi), toggle, heatmap, `-race` | 29 Nov | ☑ |
| 5 | Frontend React TS: auth, check-in + preset, cope tools, wins board, heatmap, Vitest | 30 Nov | ☐ |
| 6 | Playwright E2E, security scan, GitHub Actions CI | 1 Des | ☐ |

Ganti ☐ menjadi ☑ setelah **Definition of Done** modul (PRD §9) terpenuhi.

---

## Aturan Sesi Terisolasi
1. Kerjakan **hanya 1 modul** per sesi chat baru.
2. Sumber kebenaran adalah `PRD.md`. Jika implementasi harus menyimpang dari PRD, perbarui PRD **dan** catat alasannya di *Log Keputusan*.
3. Sebelum menutup sesi: semua test modul lulus, `openapi.yaml` diperbarui untuk endpoint baru, checklist dicentang, dan bagian *Catatan Handoff* diisi (apa yang selesai, apa yang tertunda, perintah untuk menjalankan test).
4. Jangan menulis isi `brain_dump` / `fun_cope_input` / `main_task` ke log, fixture publik, atau screenshot.
5. Setiap kali suatu modul selesai, selalu tampilkan **prompt siap pakai untuk modul berikutnya** di akhir respons agar pengguna bisa langsung menyalinnya ke sesi baru.
6. Setiap kali suatu modul selesai (setelah semua test lulus, `openapi.yaml` & `progress.md` diperbarui), langsung `git commit` dan `git push` ke `origin main` **hanya atas nama pemilik repo** (tanpa `Co-Authored-By` atau contributor lain, sesuai PRD §9.2).

---

## Prompt Siap Pakai (Copy-Paste Sesuai Modul)

### Modul 1
> Baca `PRD.md` dan `progress.md`. Kerjakan **hanya Modul 1** sesuai PRD §5, §6, §7.0–7.1, dan §9. Bangun struktur monorepo (`backend/`, `frontend/` kosong dengan placeholder, `deploy/`), `docker-compose.yml` (nginx `least_conn` ke `api-1` & `api-2`, service `migrate` one-shot dengan `golang-migrate`, PostgreSQL 16, Redis 7, healthcheck tiap service), `deploy/postgres/init/01-roles.sh` (role `app_migrator` & `app_runtime` dari env), migrasi `000001_init_schema.{up,down}.sql` persis seperti PRD §5.2, `sqlc.yaml` + query awal, `pgxpool` dengan helper `WithTx` dan `WithUserTx` (PRD §5.3), Redis Lua sliding-window limiter, middleware RequestID/RealIP (trusted proxy)/SecurityHeaders/RateLimit/Recoverer, envelope sukses & error + `AppError`, generator UUIDv7, endpoint `/api/v1/health` & `/api/v1/health/ready`, kerangka `backend/api/openapi.yaml`, dan `.env.example`. Tulis integration test (Testcontainers-go) untuk limiter dan untuk RLS (query `daily_logs` tanpa `WithUserTx` mengembalikan 0 baris; user A tidak bisa membaca baris user B). Pastikan `docker compose up` sehat dan request `/health` tersebar ke 2 instans, lalu perbarui `progress.md`.

### Modul 2
> Baca `PRD.md` dan `progress.md`. Modul 1 sudah selesai. Kerjakan **hanya Modul 2** (`internal/features/auth`) dengan pola `route → handler → service → repository` sesuai PRD §7.2 dan NFR-04. Implementasikan Argon2id (m=19 MiB, t=2, p=1), access JWT 15m + refresh token opak 7d (disimpan SHA-256) di cookie HttpOnly, cookie `csrf_token` non-HttpOnly, rotasi refresh token dengan reuse detection **dan grace period 10 detik** untuk refresh paralel, middleware CSRF double-submit, middleware Auth, endpoint `register`/`login`/`me`/`refresh`/`logout`, login rate limit 5/menit per IP+email, dan pesan error generik. Tulis unit test service dan integration test Testcontainers untuk: rotasi berhasil, reuse > 10 detik mencabut seluruh family, dua refresh paralel tidak me-logout user, dan request mutasi tanpa `X-CSRF-Token` = 403. Perbarui `openapi.yaml` dan `progress.md`.

### Modul 3
> Baca `PRD.md` dan `progress.md`. Modul 1–2 sudah selesai. Kerjakan **hanya Modul 3** (`internal/features/checkin` + `pkg/ai`) sesuai PRD §2.1–2.2, §7.3, §8. Buat `scorer.go` (fungsi murni, rumus & tier persis PRD §2.1) dengan table-driven test yang mencakup Preset A/B (Lampiran B) dan contoh §7.3; `safety.go` (deteksi frasa krisis); `fallback.go` (template per tier); interface `AiProvider` dengan `MockAiProvider` (deterministik) dan `GeminiProvider` (delimiter XML + escaping, JSON schema ketat, validator output, `gobreaker`, timeout 8s, catat `ai_audit_logs`); idempotency store Redis sesuai §7.0; endpoint `POST /checkin` (UPSERT `ON CONFLICT ... WHERE wins_completed_count = 0` → `409 CHECKIN_LOCKED`, validasi tanggal hari ini/kemarin per timezone user, rate limit AI 10 req/menit/user), `GET /checkin/{date}`, `GET /checkin/today`, `PATCH /checkin/{date}/cope` (body `cope_option_id`). Semua akses `daily_logs` wajib melalui `database.WithUserTx`. Tulis unit & integration test (gunakan `TESTCONTAINERS_RYUK_DISABLED=true` di Windows Docker Desktop) termasuk replay idempotency, key reuse dengan body beda, fallback saat provider error, dan `safety_flag`. Perbarui `openapi.yaml` dan `progress.md`, lalu tampilkan prompt siap pakai untuk Modul 4.

### Modul 4
> Baca `PRD.md` dan `progress.md`. Modul 1–3 sudah selesai. Kerjakan **hanya Modul 4** (`internal/features/wins` + `internal/features/profile`) sesuai PRD §2.3, §5.1, §7.4–7.5, §8.3. Implementasikan `POST /wins/{date}/slice-task`, `POST /wins/{date}/recalibrate` (alur 3 langkah: baca → panggil AI di luar transaksi → `SELECT ... FOR UPDATE` + cek level → `409 CONCURRENT_MODIFICATION` bila berubah; `422 MIN_LEVEL_REACHED` di level 3), `PATCH /wins/{date}/toggle` (transaksional, `wins_completed_count` dihitung ulang dari `wins_data`), dan `GET /profile/heatmap` (365 hari per timezone, level `rest/recovery/steady/complete`, milestones seumur hidup). Tulis concurrency test `go test -race` (10 recalibrate paralel → level naik tepat 1; toggle paralel → count konsisten) dan test `EXPLAIN` yang memastikan `idx_daily_logs_heatmap` dipakai. Perbarui `openapi.yaml` dan `progress.md`.

### Modul 5
> Baca `PRD.md` dan `progress.md`. Backend Modul 1–4 sudah selesai. Kerjakan **hanya Modul 5** (`frontend/`: React TS + Vite + Tailwind + Zod + React Router). Buat API wrapper (`credentials: 'include'`, header `X-CSRF-Token` dari cookie, `Idempotency-Key` UUID per aksi, refresh **single-flight** saat 401 lalu retry sekali), route guard via `GET /auth/me`, halaman `/login`, `/register` (checkbox persetujuan AI), `/checkin` (9 butir Lampiran A, brain dump, fun thing, tombol Preset A & B dari Lampiran B, redirect ke `/wins` jika sudah check-in hari ini), `/cope` (4 skor + tier, disclaimer, SafetyBanner bila `safety_flag`, 3 kartu cope → BreathingPacer / CountdownTimer / Guided Brain-Dump), `/wins` (3 kartu pilar, AI Task Slicer + Focus Timer, tombol "Masih Terlalu Berat" yang berubah jadi pesan istirahat di level 3), dan `/profile` (HeatmapGrid 365 hari, tanggal kosong = `rest`, statistik). Tambahkan Vite dev proxy `/api` dan `data-testid` pada elemen kunci untuk Playwright. Verifikasi `npm run build` + Vitest (HeatmapGrid, timer, api wrapper), lalu perbarui `progress.md`.

### Modul 6
> Baca `PRD.md` dan `progress.md`. Modul 1–5 sudah selesai. Kerjakan **hanya Modul 6**. Tulis suite Playwright (`frontend/tests/e2e/`) yang berjalan terhadap `docker compose` dengan `AI_PROVIDER=mock`: register → klik Preset A → submit → pilih positive cope → slice task Work Win → recalibrate satu pilar → toggle 3 win → buka `/profile` dan pastikan kotak hari ini berlevel `complete`; plus skenario refresh token setelah access token kedaluwarsa. Buat `.github/workflows/ci.yml` dengan job: `golangci-lint` (aktifkan `gosec`), `govulncheck`, `go test -race` + Testcontainers, Vitest, build image, **Trivy** (gagal pada HIGH/CRITICAL), Playwright, dan **OWASP ZAP API scan** memakai `backend/api/openapi.yaml` + `deploy/zap/zap-rules.tsv`. Pastikan workflow valid dan hijau, lalu perbarui `progress.md`.

---

## Catatan Handoff (diisi tiap akhir sesi)

| Modul | Selesai | Tertunda / Utang Teknis | Cara Menjalankan Test |
| :-: | :--- | :--- | :--- |
| 1 | Struktur monorepo (`backend/`, `frontend/` placeholder, `deploy/`), `docker-compose.yml` (nginx `least_conn` → `api-1`/`api-2`, `migrate`, `postgres`, `redis`), `01-roles.sh`, migrasi `000001_init_schema.{up,down}.sql`, `sqlc` + query awal, `pgxpool` (`WithTx`/`WithUserTx`), Redis Lua sliding-window limiter, middleware (`RequestID`, `RealIP`, `SecurityHeaders`, `RateLimitByIP`, `Recoverer`, `AccessLog`), UUIDv7, envelope & `AppError`, `/api/v1/health` & `/api/v1/health/ready`, `openapi.yaml`, `.env.example`, unit test & Testcontainers test (limiter + RLS) lulus, `docker compose up` sehat & LB tersebar ke `api-1`/`api-2`. | — (catatan: di Windows Docker Desktop, set `TESTCONTAINERS_RYUK_DISABLED=true` saat menjalankan Testcontainers) | Unit test: `cd backend && go test -short -v ./...` · Full + Testcontainers: `TESTCONTAINERS_RYUK_DISABLED=true go test -v ./...` (dari `backend/`) · Stack: `docker compose up -d --build --wait` |
| 2 | `internal/features/auth` (`route → handler → service → repository`, `dto`, `crypto`), query `sqlc` (`queries/auth.sql` → `auth.sql.go`), Argon2id (`m=19 MiB, t=2, p=1`) + timing guard, access JWT HS256 (15m, HttpOnly) + refresh token opak 7d (disimpan SHA-256, HttpOnly) + `csrf_token` (non-HttpOnly, `SameSite=Strict`), rotasi refresh token (`FOR UPDATE`) dengan reuse detection & grace period 10 detik untuk request paralel, middleware `CSRF` double-submit (dipasang pada sub-router `/api/v1/` kecuali `register`/`login`), middleware `Auth` + `UserIDFromContext`, endpoint `register`/`login`/`me`/`refresh`/`logout`, login rate limit 5/menit per IP+email, pesan error generik, `openapi.yaml` v0.2.0, unit test & Testcontainers integration test lulus. | — (catatan: `time/tzdata` di-embed agar validasi timezone IANA jalan di Windows & container distroless; gunakan `TESTCONTAINERS_RYUK_DISABLED=true` di Windows Docker Desktop) | Unit test: `cd backend && go test -short -v ./...` · Full + Testcontainers: `cd backend && $env:TESTCONTAINERS_RYUK_DISABLED="true"; go test -count=1 ./...` |
| 3 | `internal/features/checkin` (`route → handler → service → repository`, `dto`, `scorer.go`, `safety.go`, `fallback.go`) + `pkg/ai` (`AiProvider`, `MockAiProvider`, `GeminiProvider` dengan XML delimiter + escaping, JSON schema ketat, validator output, `gobreaker/v2`, timeout 8s), Redis idempotency store (`internal/cache/idempotency.go` + `middleware.Idempotency`), `middleware.RateLimitByUser` (10 req/menit/user), query `sqlc` (`queries/checkin.sql` → `checkin.sql.go`) + `ai_audit_logs`, endpoint `POST /checkin` (UPSERT `WHERE wins_completed_count = 0` → `409 CHECKIN_LOCKED`, validasi tanggal hari ini/kemarin per timezone user), `GET /checkin/today`, `GET /checkin/{date}`, `PATCH /checkin/{date}/cope`, semua akses `daily_logs` lewat `database.WithUserTx`, `openapi.yaml` v0.3.0, unit & Testcontainers integration tests lulus. | — (catatan: di Windows Docker Desktop gunakan `TESTCONTAINERS_RYUK_DISABLED=true` dan `-p 1` saat menjalankan semua paket Testcontainers sekaligus agar named pipe Docker tidak bentrok) | Unit test: `cd backend && go test -short -v ./...` · Full + Testcontainers: `cd backend && $env:TESTCONTAINERS_RYUK_DISABLED="true"; go test -count=1 -p 1 ./...` |
| 4 | `internal/features/wins` (`route → handler → service → repository`, `dto`, `fallback`) + `internal/features/profile` (`route → handler → service → repository`, `dto`), query `sqlc` (`queries/wins.sql` → `wins.sql.go`, `queries/profile.sql` → `profile.sql.go`), endpoint `POST /wins/{date}/slice-task` (AI Task Slicer 5–10 mnt + idempotency + AI rate limit + fallback + audit log), `POST /wins/{date}/recalibrate` (alur 3 langkah §8.3: baca tanpa lock → panggil AI di luar transaksi → `SELECT ... FOR UPDATE` + cek versi level → `409 CONCURRENT_MODIFICATION`; `422 MIN_LEVEL_REACHED` di level 3; reset `completed=false`; perkecil `micro_step` & `duration_seconds` pada `work` bila sudah di-slice), `PATCH /wins/{date}/toggle` (transaksional `FOR UPDATE`, `wins_completed_count` dihitung ulang dari `wins_data`), `GET /profile/heatmap` (365 hari per timezone user, level `rest/recovery/steady/complete`, milestones seumur hidup), semua akses `daily_logs` lewat `database.WithUserTx`, `openapi.yaml` v0.4.0, unit + Testcontainers concurrency test `-race` (10 recalibrate paralel → level naik tepat 1; toggle paralel → count konsisten) & `EXPLAIN (ANALYZE, BUFFERS)` (`Index Only Scan using idx_daily_logs_heatmap`, `Heap Fetches: 0`) lulus. | — (catatan: di Windows tanpa `gcc`, jalankan `-race` via `docker run --rm -v ${PWD}:/work -v /var/run/docker.sock:/var/run/docker.sock -w /work/backend -e TESTCONTAINERS_RYUK_DISABLED=true -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal golang:1.27.3 go test -race -count=1 -p 1 ./internal/features/wins/... ./internal/features/profile/...`) | Unit test: `cd backend && go test -short -v ./...` · Full + Testcontainers: `cd backend && $env:TESTCONTAINERS_RYUK_DISABLED="true"; go test -count=1 -p 1 ./...` · Race (Docker Linux): `docker run --rm -v c:\projects\kindling:/work -v /var/run/docker.sock:/var/run/docker.sock -w /work/backend -e TESTCONTAINERS_RYUK_DISABLED=true -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal golang:1.27.3 go test -race -count=1 -p 1 ./internal/features/wins/... ./internal/features/profile/...` |
| 5 | — | — | — |
| 6 | — | — | — |

---

## Pertanyaan Terbuka (default sudah dipilih, ubah bila perlu)
1. **Re-check-in di hari yang sama** — default: boleh selama belum ada win selesai; menimpa skor, cope, dan wins.
2. **Check-in untuk tanggal lampau** — default: hanya hari ini & kemarin (mencegah heatmap diisi mundur).
3. **Hotline krisis** — nomor di banner wajib diverifikasi manual sebelum demo.
4. **Model Gemini** — nama model diisi lewat `GEMINI_MODEL`; demo juri default memakai `AI_PROVIDER=mock` agar tidak bergantung kuota/jaringan.
5. **Hapus akun / ekspor data** — di luar lingkup v1; sebut sebagai roadmap di presentasi.

---

## Log Keputusan & Catatan Antar-Sesi
- **26 Nov 2026** — Mengunci arsitektur: Go 1.22+ native `net/http`, PostgreSQL 16 (`sqlc` + `pgxpool` + UUIDv7 + RLS), Redis 7 Lua rate limiter, NGINX load balancer, strategi mock-first (`AI_PROVIDER=mock`).
- **26 Nov 2026** — Nama produk ditetapkan: **Kindling** (menggantikan usulan awal *Ember*, yang dalam bahasa Indonesia berarti wadah air). Tagline *"Small sparks, steady fire."* Gunakan nama ini di judul halaman, README, `<title>` frontend, dan nama image Docker (`kindling-api`, `kindling-web`).
- **26 Nov 2026** — Revisi spesifikasi v1.1 setelah review:
  - *Skor:* contoh `soul_wellbeing` 25 tidak cocok dengan rumus mana pun yang konsisten dengan 3 skor lain → diganti 17; rumus `(sum-n)/(3n)*100` ditulis eksplisit.
  - *Heatmap:* level `rest` hilang dari kontrak API → ditambahkan; backend hanya kirim hari yang ada log.
  - *CSRF:* draft menyebut ketiga cookie HttpOnly → `csrf_token` harus non-HttpOnly agar double-submit berfungsi. `SameSite` dipastikan `Strict`.
  - *RLS:* tanpa `FORCE` owner tabel mem-bypass policy; dengan `pgxpool`, `SET` level sesi bisa bocor antar request → wajib `set_config(..., true)` dalam transaksi (`WithUserTx`). Ditambah `WITH CHECK` & grant `app_runtime`.
  - *Concurrency:* recalibrate yang memanggil LLM di dalam `FOR UPDATE` menahan lock beberapa detik → AI dipanggil di luar transaksi, lalu tulis dengan lock + cek versi. Toggle juga dibuat transaksional karena `wins_completed_count` adalah data turunan.
  - *Auth:* refresh paralel (2 tab) akan memicu false-positive reuse → grace period 10 detik + single-flight refresh di FE. Ditambah `/auth/me`, login rate limit, refresh token disimpan SHA-256.
  - *Rate limit di balik NGINX:* semua request terlihat dari IP NGINX → ambil `X-Real-IP` hanya dari trusted proxy.
  - *Konten:* "4-7-8" ≠ "Physiological Sigh"; "Emotional Regulation" bukan subskala Brief-COPE; Lally 2010 = median, bukan rata-rata.
  - *Gap lain yang ditutup:* bank pertanyaan & nilai preset, envelope error + kode, batas panjang input, validasi tanggal + kolom `timezone`, kebijakan re-check-in, deteksi krisis + disclaimer, privasi log, `openapi.yaml` (dibutuhkan ZAP), runner migrasi, env vars, trigger `updated_at`, penghapusan `pgcrypto` yang tidak terpakai.
