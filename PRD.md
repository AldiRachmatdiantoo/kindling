# PRD.md — Kindling: Product Requirements & Technical Specification

**Nama Produk:** **Kindling**
**Tagline:** *"Small sparks, steady fire."*
**Makna Nama:** *Kindling is the small twigs and dry leaves you use to start a fire. Nobody lights a log with a match; you start small, and the fire grows on its own. Kindling works the same way: on low-energy days you don't need a big flame — a recovery moment or a few small wins is enough to keep the spark alive.*
**Maskot:** **Ember**, bara kecil yang dijaga tetap hangat. Kindling adalah kayunya, Ember adalah baranya. Nama produk tetap Kindling: kata umum bahasa Inggris yang berbeda dari merek "Kindle", sedangkan "Ember" sudah ramai dipakai produk lain (mis. Ember.js, Ember mug), jadi lebih cocok sebagai nama maskot di dalam app.

**Proyek:** Holistic Self-Calibration & Anti-Burnout App (SLAY HACKS 2026)
**Versi Dokumen:** 1.3 (revisi 28 Nov 2026: sinkronisasi Fase 2 — refleksi brain-dump, Milestone Path, Adaptive Atmosphere, Pattern Discovery, kontrak API final; lihat §15)
**Target Selesai Kode:** 1 Desember 2026
**Deadline Submisi:** 7 Desember 2026

**Stack:**
- **Backend:** Go 1.22+ native (`net/http` + pattern routing `GET /path/{param}`), `sqlc` + `pgx/v5` (`pgxpool`), `golang-migrate`, `gobreaker`, `golang-jwt/jwt/v5`, `golang.org/x/crypto/argon2`
- **Data:** PostgreSQL 16, Redis 7
- **Frontend:** React + TypeScript (Vite), Tailwind CSS, Zod, React Router, Vitest
- **Infra:** NGINX (reverse proxy + load balancer), Docker Compose, GitHub Actions CI/CD
- **AI:** `AiProvider` interface → `MockAiProvider` (default) & `GeminiProvider`

---

## 1. Latar Belakang & Filosofi Inti

### 1.1 Latar Belakang
Di tengah tuntutan produktivitas tinggi, banyak mahasiswa, pekerja, maupun individu yang sedang mencari arah hidup terjebak dalam **burnout** (kelelahan fisik dan mental kronis) dan perasaan **lost in life** (hilang arah, motivasi, dan rasa kendali). Aplikasi *self-improvement* yang ada saat ini gagal membantu karena tiga hal:

1. **Tekanan Mitos 66 Hari & *Streak* Kaku.** Studi Lally dkk. (2010) menunjukkan pembentukan kebiasaan memakan waktu dengan **median 66 hari** (rentang 18–254 hari), dan melewatkan satu hari **tidak** merusak proses pembentukan kebiasaan secara berarti. Memaksakan target kaku dan menghukum pengguna saat *streak* putus justru memicu *guilt-tripping* yang memperparah *burnout*.
2. **Stigma Negatif terhadap *Coping Mechanism*.** Pelarian saat lelah sering dianggap kemalasan, padahal secara psikologi (Carver, 1997) *coping* adalah respons alami terhadap stres. Sistem saraf perlu dipulihkan terlebih dahulu lewat *positive cope* pilihan pengguna sendiri sebelum mulai bekerja.
3. **Pendekatan yang Tidak Menyeluruh.** Kebiasaan bertahan lama membutuhkan keseimbangan pada tiga sisi kehidupan sekaligus: **Physical** (tubuh), **Work** (karya/studi), dan **Soul** (batin).

**Data pendukung.** Hanya angka yang sudah dicek ke sumbernya; setiap angka ditulis bersama tahunnya.

| Data | Sumber | Catatan pemakaian |
| :--- | :--- | :--- |
| ±280 juta orang mengalami depresi (5% orang dewasa); estimasi 2023 naik menjadi ±322 juta | WHO, *Depression fact sheet* (estimasi 2019 dan 2023) | Sebut tahun estimasinya; angka 2023 lebih baru |
| Prevalensi kecemasan dan depresi global naik ±25% pada tahun pertama pandemi; dewasa muda (20–24) termasuk yang paling terdampak | WHO, *Scientific brief* 2 Maret 2022 | Angka 25% adalah angka global, **bukan** khusus usia 18–29 |
| Prevalensi depresi tertinggi ada di usia 15–24 tahun (2%, nasional 1,4%), dan hanya 10,4% dari mereka yang berobat | Kemenkes, Survei Kesehatan Indonesia (SKI) 2023 | Kelompok dengan akses pengobatan terendah |
| 44% pekerja mengalami stres "sepanjang banyak waktu" dalam sehari kemarin; hanya 21% yang *engaged* di pekerjaan | Gallup, *State of the Global Workplace 2022* | Ini keterlibatan **kerja**, bukan makna hidup secara umum. Angka berubah tiap edisi (edisi 2026: stres ±40%, *engaged* ±20%), jadi selalu sebut edisinya |
| Pembentukan habit butuh median 66 hari (rentang 18–254); melewatkan satu hari tidak merusak prosesnya secara berarti | Lally dkk. (2010) | **Median**, bukan rata-rata |

Tidak dipakai karena tidak ada sumbernya: klaim ">80% pengguna berhenti karena *streak*". Efek *what-the-hell* (satu pelanggaran memicu menyerah total) berasal dari riset diet Polivy & Herman, bukan Lally; boleh disebut sebagai analogi dengan sumber yang benar, bukan sebagai data aplikasi habit.

### 1.2 Filosofi Produk
- **"Siapa Peduli 66 Hari Baru Kebentuk".** Fokus penuh pada kemenangan realistis **hari ini** sesuai kapasitas energi pengguna. Konsistensi jangka panjang terjadi sebagai efek samping alami, bukan beban *countdown*.
- **"Having a Coping Mechanism is Not a Bad Thing — Choose Your Own Positive Cope".** Sistem tidak menghakimi pelarian pengguna saat lelah, melainkan menerjemahkannya menjadi 3 opsi *positive cope* yang **100% dipilih sendiri** oleh pengguna untuk mengembalikan rasa kendali (*agency*).
- **Istirahat adalah hasil yang sah.** Hari tanpa *win* tidak pernah ditampilkan sebagai kegagalan; heatmap tidak mengenal *reset streak*.
- **Tidak ada metrik yang menghukum.** Aplikasi tidak menampilkan *streak* maupun persentase *win rate*, karena angka yang turun saat pengguna absen memicu kecemasan baru. Semua statistik bersifat kumulatif: hanya bisa naik atau diam. Hari lampau terkunci (mutasi hanya untuk hari ini/kemarin), jadi progres lama tidak pernah turun; satu-satunya yang bisa mengurangi angka adalah pengguna membatalkan centang win pada hari itu sendiri.
- **Habit milik pengguna, langkahnya dari AI.** Pengguna menentukan sendiri kegiatan yang ia nikmati atau ingin ia tingkatkan per pilar; AI hanya menerjemahkannya menjadi langkah kecil sesuai energi hari itu, tanpa mendikte detail teknis (mis. program gym) kecuali diminta.

### 1.3 Referensi Ilmiah
| Instrumen | Referensi | Dipakai untuk |
| :--- | :--- | :--- |
| Copenhagen Burnout Inventory (CBI) | Kristensen et al. (2005) | Kelelahan fisik (personal burnout) |
| Oldenburg Burnout Inventory (OLBI) | Demerouti, Mostert & Bakker (2010) | Pemisahan *Exhaustion* vs *Disengagement* |
| WHO-5 Well-Being Index | WHO (1998) | Kesejahteraan emosional/batin |
| Brief-COPE | Carver (1997) | Klasifikasi strategi *coping* |
| Habit Automaticity Study | Lally et al. (2010) | Bantahan mitos 21/30 hari & efek *missed day* |

### 1.4 Batasan & Disclaimer (wajib tampil di UI)
- 9 butir check-in adalah **adaptasi singkat** dari CBI/OLBI/WHO-5 dengan skala seragam 1–4. Ini **bukan** instrumen tervalidasi dan **bukan alat diagnosis klinis**. Skor dipakai hanya untuk mengkalibrasi saran harian.
- Aplikasi bukan pengganti tenaga profesional. Jika pengguna menunjukkan tanda krisis, aplikasi menampilkan informasi layanan bantuan (lihat FR-09).

---

## 2. Functional Requirements (FR)

| ID | Modul | Kebutuhan Fungsional |
| :--- | :--- | :--- |
| **FR-01** | Auth & Session | Registrasi, login, `GET /auth/me`, refresh token otomatis, dan logout. **Access JWT (15m)** dan **Refresh Token opak (7d)** disimpan di cookie **HttpOnly**; token CSRF disimpan di cookie **non-HttpOnly** agar bisa dibaca JS (double-submit). Rotasi refresh token dengan *reuse detection* (grace period 10 detik untuk request paralel). Registrasi memuat persetujuan pemrosesan teks oleh AI. |
| **FR-02** | Psychometric Check-In | Form 9 butir skala Likert 1–4 (Lampiran A), kotak *brain dump* (maks 2.000 karakter), dan pertanyaan kunci: *"What fun thing do you always want to do when everything feels tired?"* (maks 200 karakter). Satu log per pengguna per hari. Disajikan percakapan: panduan 3 halaman di awal (bisa dilewati), 1 pertanyaan per layar dengan label bahasa manusia (bukan angka 1–4), animasi *reading* setelah tiap pilar selesai ("memprediksi tingkat"), dan kartu kesimpulan hari itu setelah pertanyaan terakhir. **Auto-advance:** memilih jawaban (klik/tap, Enter, atau Space) langsung lanjut ke pertanyaan berikutnya setelah ±400 ms agar pilihan sempat terlihat; tombol panah hanya memindah pilihan tanpa lanjut, ketukan ganda cepat hanya maju 1 pertanyaan, tombol Back selalu ada, dan tombol Next hanya muncul saat kembali ke pertanyaan yang sudah dijawab. Dengan `prefers-reduced-motion` tetap auto-advance tanpa animasi. **Quick-pick chips:** 4–5 *chip* contoh spesifik per pilar di bawah input *fun thing*, input habit (FR-10), dan input swap (FR-11); chip mengisi input dan teksnya tetap bisa diedit. Pengguna baru disambut halaman *welcome* setelah registrasi. |
| **FR-03** | Demo Presets | Halaman `/checkin` menyediakan 2 tombol sekali klik (`Preset A: High Exhaustion`, `Preset B: High Disengagement`) yang mengisi form dengan nilai tetap (Lampiran B). Preset hanya mengisi form; pengguna tetap menekan Submit. |
| **FR-04** | Deterministic Scorer | Backend menghitung 4 skor dimensi (0–100) dengan rumus pada §2.1, plus `calibration_tier`, **sebelum** memanggil LLM. Skor tidak pernah berasal dari LLM. |
| **FR-05** | Choose Your Own Positive Cope | AI memetakan jawaban *fun thing* ke kategori **Brief-COPE adaptif** (enum §2.2) dan menyusun tepat 3 opsi pemulihan (60–600 detik). Pengguna memilih 1 kartu untuk masuk ke ruang interaktif layar penuh: *Breathing Pacer* beranimasi (pola 4-7-8, *box*, atau *slow*), *Activity Timer* untuk hobinya, atau *Guided Brain-Dump* yang dilipat dan diarsipkan saat selesai. Setelah dilipat, pengguna memilih **"Read it back to me"** atau **"Keep it private"**; di atas tombol tertulis bahwa teks dikirim ke layanan AI (Google Gemini) hanya untuk refleksi ini dan tidak disimpan. Bila dipilih, `POST /checkin/{date}/reflect` (§7.3) mengembalikan refleksi ≤ 280 karakter + ≤ 3 tema dengan nada mengikuti tier hari itu, lalu tombol "On to my 3 Daily Wins". "Keep it private" tidak mengirim apa pun. |
| **FR-06** | Calibrated 3 Daily Wins | Tepat 3 target, 1 per pilar **Physical, Work, Soul**, sesuai `calibration_tier`. Bila pengguna punya habit untuk pilar itu (FR-10), AI membangun target **dari habit tersebut**; bila tidak, AI memilihkan. Kartu wins baru terbuka setelah pengguna memilih 1 *positive cope* di `/cope`, atau menekan "Not today? Skip recovery" (disimpan per hari di localStorage). Detail kartu (cara mulai, timer, slicer) ada di balik tombol buka/tutup; timer tetap berjalan saat ditutup. Pilar **Work** memiliki **AI Task Slicer**: pengguna memasukkan 1 tugas (maks 300 karakter), AI mengembalikan 1 langkah mikro 5–10 menit + *Focus Timer*. Setelah langkah itu selesai, pengguna bisa memilih "Win here for today" atau "Slice the next step" (`next_step: true`, §7.4): server membaca tugas & langkah tersimpan lalu memberi langkah berikutnya, dan `steps_done` bertambah. |
| **FR-07** | Dynamic Target Renegotiation | Setiap kartu *win* memiliki tombol *"Masih Terlalu Berat"* yang menurunkan skala target satu tingkat (`level` 0 → 3). Penulisan hasil dilakukan di transaksi `SELECT ... FOR UPDATE` dengan pengecekan versi (§8.3). Pada level 3 tombol berubah menjadi pesan bahwa istirahat juga merupakan pilihan sah. |
| **FR-08** | Anti-Burnout Heatmap & Milestone Path | Halaman `/profile` merender grid 365 hari ala GitHub tanpa *reset streak* + statistik kumulatif seumur hidup (Total wins, Checkpoints reached, Active days, Recovery days; tanpa persentase, tanpa *streak*). Level warna lihat §2.3. **Milestone Path** per pilar (Physical, Work, Soul): pilar dipilih lewat tab (panah kiri/kanan, Home, End; terbuka di pilar yang terakhir bergerak). Tiap pilar berupa jalur vertikal yang berkelok kiri-kanan dari atas ke bawah: 1 node bulat besar bertanda centang per win yang selesai, tiap 3 win menjadi *checkpoint* berupa "peti apresiasi" besar di tengah jalur yang bisa dibuka (tombol, keyboard) berisi catatan apresiasi deterministik per pilar & nomor checkpoint + tanggal tercapai, tanpa hadiah/poin; langkah berikutnya sampai peti selanjutnya digambar bergaris putus. Maskot pilar berdiri di samping langkah terakhir. Penanda posisi terakhir: "Today you got here" / "Yesterday you got here" / "Last time you got here · <tanggal>". Nama aksesibel per pilar, mis. "Physical: 7 wins, 2 checkpoints"; jalur panjang menampilkan 2 checkpoint terakhir dengan tombol "Show N earlier checkpoints"; *empty state* saat belum ada win; animasi buka peti dilewati dengan `prefers-reduced-motion`. Saat win ketiga hari itu ditandai selesai, perayaan 3/3 berlanjut ke babak kedua: ketiga jalur (versi kecil yang berkelok sama) bertambah satu langkah bergantian per pilar, peti yang tercapai hari itu terbuka; bila `pillar_progress` tidak termuat, perayaan 3/3 tetap tampil tanpa babak ini. Perayaan win (1 win maupun 3/3) baru bisa ditutup dengan tap, Enter, atau Space setelah animasinya selesai, dan tulisan "Tap anywhere to keep going" baru muncul saat itu; Escape selalu bisa menutup, dan dengan `prefers-reduced-motion` bisa langsung ditutup. Data: `pillar_progress` (§5.1, §7.5). |
| **FR-10** | Standing Habits per Pilar | Pengguna menyimpan maks 1 habit per pilar: kegiatan yang ia nikmati atau ingin ia tingkatkan (maks 120 karakter) + opsional hambatan yang biasanya muncul (maks 200 karakter). Diisi pada langkah *"Your habits"* di akhir check-in (bisa dilewati; bila sudah ada, cukup "Keep these" atau "Edit") dan bisa diubah kapan saja di kartu *Your habits* di `/profile`. Perubahan berlaku mulai check-in berikutnya. Ukuran langkah mengikuti tier: `gentle` ±2 menit, `balanced` ±10 menit, `standard` ±20 menit; hambatan dipakai AI untuk memilih langkah yang mengakalinya. Kartu win menampilkan asalnya: *"From your habit: …"*. |
| **FR-11** | Swap for Today | Kartu win **Physical** dan **Soul** yang belum selesai punya tombol *"Do something else today"*. Pengguna menulis kegiatan lain (maks 120 karakter) dan AI menyusun ulang win pilar itu dari kegiatan tersebut, **khusus hari itu**. Habit tetap tidak berubah dan kembali besok. Kartu menampilkan *"Just for today: …"*. Pilar Work tidak memakai swap karena sudah punya Task Slicer. |
| **FR-12** | Pattern Discovery | Kartu *"What your check-ins are telling you"* di `/profile` dari `GET /profile/insights` (§7.5): membaca check-in pengguna sendiri 90 hari terakhir, butuh minimal 7 hari data (sebelum itu kartu menyebut berapa hari lagi), maksimal 3 *insight* deterministik (`weekday_peak`, `cope_next_day`, `exhaustion_trend`, `recovery_days`). Tiap insight menyebut jumlah hari yang mendasarinya dan ditulis sebagai kecenderungan, bukan janji atau diagnosis. Tanpa AI. |
| **FR-13** | Adaptive Atmosphere | Warna aksen dan tempo animasi mengikuti `calibration_tier` check-in hari ini lewat atribut `data-atmosphere` (`gentle` / `balanced` / `standard`) di `<html>` (rincian palet di §9.3). Tanpa check-in hari ini, atau toggle *"Match colors to my day"* di `/profile` dimatikan (default on, localStorage), tema memakai palet default. |
| **FR-09** | Safety & Privacy | (a) Deteksi kata kunci krisis secara deterministik pada `brain_dump`/`fun_cope_input` sebelum LLM; bila terpicu, response membawa `safety_flag: true` dan UI menampilkan banner layanan bantuan. (b) Isi teks pengguna tidak pernah ditulis ke log aplikasi. (c) Disclaimer §1.4 tampil di `/checkin` dan `/cope`. |

### 2.1 Rumus Skor Deterministik
Semua butir berskala 1–4 dan **searah** (tidak ada *reverse scoring*; Lampiran A sudah ditulis searah).

```
score(items) = round( (sum(items) - n) / (3 * n) * 100 )      // n = jumlah butir, hasil 0..100

physical_exhaustion = score(cbi_1, cbi_2, cbi_3)              // tinggi = makin lelah
work_exhaustion     = score(olbi_ex_1, olbi_ex_2)             // tinggi = makin lelah
disengagement       = score(olbi_dis_1, olbi_dis_2)           // tinggi = makin berjarak
soul_wellbeing      = score(who5_1, who5_2)                   // tinggi = makin baik
```

`round` = *round half away from zero* (`math.Round` Go). Contoh: `cbi = 4,3,4` → `(11-3)/9 = 88.9` → **89**.

**Calibration tier** (input untuk AI & fallback):

| Tier | Kondisi (dievaluasi berurutan) | Arti |
| :--- | :--- | :--- |
| `gentle` | `physical_exhaustion >= 67` ATAU `work_exhaustion >= 67` | Target sekecil mungkin |
| `balanced` | salah satu dari `physical/work/disengagement >= 34` ATAU `soul_wellbeing <= 33` | Target ringan-sedang |
| `standard` | selain itu | Target normal |

### 2.2 Enum Kategori Brief-COPE yang Diizinkan
Hanya subskala yang umumnya tergolong adaptif. Output LLM di luar enum ditolak validator dan memicu fallback.

`active_coping`, `planning`, `positive_reframing`, `acceptance`, `humor`, `religion`, `emotional_support`, `instrumental_support`, `self_distraction`, `venting`

`tool_type` enum: `breathing` | `timer` | `brain_dump`.

### 2.3 Level Heatmap

| Level | Kondisi | Warna |
| :--- | :--- | :--- |
| `rest` | Tidak ada log pada tanggal itu, **atau** ada log tanpa cope dipilih dan 0 win | Abu-abu |
| `recovery` | `positive_cope_chosen IS NOT NULL` dan `wins_completed_count = 0` | Biru |
| `steady` | `wins_completed_count` 1–2 | Hijau muda |
| `complete` | `wins_completed_count = 3` | Hijau penuh |

Backend hanya mengembalikan tanggal yang punya log; frontend mengisi tanggal kosong sebagai `rest`.

---

## 3. Non-Functional Requirements (NFR)

| ID | Kategori | Spesifikasi & Standar Teknik |
| :--- | :--- | :--- |
| **NFR-01** | Arsitektur Backend | Go 1.22+ native `net/http` dengan **Layered + Feature-Based Architecture** (`route → handler → service → repository`). Minimal 2 instans *stateless* (`api-1`, `api-2`) di belakang NGINX (`least_conn`). Seluruh state bersama (rate limit, idempotency) di Redis/Postgres. |
| **NFR-02** | Rate Limiting & Resilience | Redis Lua *sliding window*: 60 req/menit/IP (umum), 10 req/menit/user (endpoint AI), 5 req/menit per IP+email (login). IP klien diambil dari header `X-Real-IP` **hanya** jika request datang dari CIDR proxy tepercaya. *Idempotency-Key* pada semua mutasi AI (§7.0). *Circuit Breaker* (`gobreaker`) untuk LLM dengan fallback deterministik. Timeout: LLM 8s, request total 12s, query DB 3s. |
| **NFR-03** | Database Engineering | PostgreSQL 16, `sqlc` + `pgxpool`. **UUIDv7 dibangkitkan di Go** (PG16 belum punya `uuidv7()` bawaan) untuk mengurangi fragmentasi B-Tree. Composite index `INCLUDE` untuk *Index-Only Scan* heatmap, partial index statistik, BRIN index pada audit log. Migrasi via `golang-migrate`. |
| **NFR-04** | Security-First | Argon2id (m=19 MiB, t=2, p=1 — baseline OWASP). Cookie `Secure` (bisa dimatikan via env hanya untuk dev), `SameSite=Strict`. CSRF double-submit (`X-CSRF-Token` == cookie `csrf_token`) pada semua method non-GET kecuali `register`/`login`. **RLS** di `daily_logs` dengan `FORCE ROW LEVEL SECURITY`, role runtime `app_runtime` (bukan owner tabel). Refresh token disimpan sebagai SHA-256. XML delimiter + JSON schema ketat anti-*prompt injection*. React escaping default; `DOMPurify` hanya bila merender HTML. Pesan error auth generik (anti user enumeration). |
| **NFR-05** | Testing & CI/CD | GitHub Actions: `golangci-lint` (termasuk `gosec`), `govulncheck`, `go test -race`, integration test via **Testcontainers-go** (Postgres + Redis asli), Vitest, E2E **Playwright**, **Trivy** image scan, **OWASP ZAP** API scan berbasis `backend/api/openapi.yaml`. |
| **NFR-06** | Observability & Privacy | Log JSON terstruktur (`log/slog`) dengan `request_id`; isi `brain_dump`, `fun_cope_input`, `main_task`, dan output LLM **tidak** di-log. `ai_audit_logs` hanya menyimpan metadata (endpoint, latency, fallback). **Teks refleksi brain-dump** (§7.3) hanya dikirim ke AI dengan `consent: true`, tidak disimpan di tabel mana pun (termasuk `daily_logs`), tidak di-log, dan tidak muncul di response; cache idempotency Redis hanya menyimpan hash SHA-256 body + response tersebut. |

---

## 4. User Flow End-to-End

```text
[1. Landing / Auth (/login, /register)]
        │  (register: centang persetujuan pemrosesan AI)
        ▼
[2. Daily Check-In (/checkin)]
        │  Panduan 3 halaman → 9 butir (1 per layar, auto-advance, reading tiap pilar)
        │  → kartu kesimpulan → "Your habits" (FR-10, bisa dilewati)
        │  → Brain Dump + "Fun Thing When Tired"
        │  (opsional: klik Demo Preset A / B untuk auto-fill)
        │  Jika sudah check-in hari ini → langsung redirect ke /wins
        ▼
[3. Diagnostic & Positive Cope (/cope)]
        ├─► Lihat 4 skor + calibration tier + ringkasan AI (+ banner safety bila safety_flag)
        └─► Pilih 1 dari 3 Positive Cope ─► Jalankan Tool (Breathing / Timer / Brain-Dump)
        │   (Wins terbuka setelah 1 cope dipilih; boleh dilewati — "Not today? Skip recovery")
        ▼
[4. Calibrated 3 Daily Wins (/wins)]
        ├─► Physical Win (dari habit) ─► opsional "Do something else today" (FR-11)
        ├─► Work Win ─► Input 1 tugas ─► AI Task Slicer (5–10 mnt) ─► Focus Timer
        └─► Soul Win (dari habit)     ─► opsional "Do something else today" (FR-11)
            └─► "Masih Terlalu Berat" ─► AI turunkan level target (maks level 3)
        ▼
[5. Profile & Anti-Burnout Heatmap (/profile)]
        ├─► Grid 365 hari (rest / recovery / steady / complete) + statistik seumur hidup
        ├─► Milestone Path per pilar (peti apresiasi tiap 3 win)
        ├─► Pattern Discovery (≥ 7 hari check-in), kartu Your habits
        └─► Toggle "Match colors to my day" (Adaptive Atmosphere)
```

---

## 5. Entity Relationship Diagram (ERD)

```text
+--------------------------+   1:N   +--------------------------+
|          users           |-------->|      refresh_tokens      |
+--------------------------+         +--------------------------+
| PK id (UUIDv7)           |         | PK id (UUIDv7)           |
| UK email (lowercase)     |         | FK user_id               |
|    password_hash         |         | UK token_hash (SHA-256)  |
|    full_name             |         |    family_id             |
|    timezone              |         |    revoked_at            |
|    ai_consent_at         |         |    replaced_by           |
|    created_at            |         |    expires_at            |
+--------------------------+         |    created_at            |
            │ 1:N                    +--------------------------+
            ▼
+--------------------------------------+   +--------------------------+
|              daily_logs              |   |      ai_audit_logs       |
+--------------------------------------+   +--------------------------+
| PK id (UUIDv7)                       |   | PK id (UUIDv7)           |
| FK user_id      ┐ UNIQUE             |   |    user_id (tanpa FK)    |
|    log_date     ┘                    |   |    endpoint              |
|    raw_answers (JSONB)               |   |    latency_ms            |
|    brain_dump, fun_cope_input        |   |    is_fallback           |
|    scores (JSONB), calibration_tier  |   |    created_at            |
|    diagnostic_summary, safety_flag   |   +--------------------------+
|    cope_options (JSONB array)        |
|    positive_cope_chosen              |
|    wins_data (JSONB)                 |
|    wins_completed_count (0..3)       |
|    created_at, updated_at            |
+--------------------------------------+
```

```text
+--------------------------+
|       user_habits        |   users 1:N (maks 3 baris per user)
+--------------------------+
| PK user_id (FK) ┐        |
|    pillar       ┘        |   physical | work | soul
|    activity (≤120)       |
|    struggle (≤200, '')   |
|    updated_at            |
+--------------------------+
```
Migrasi `000002_user_habits`: RLS `ENABLE` + `FORCE` dengan policy isolasi per `app.current_user_id` (sama seperti `daily_logs`), grant `SELECT/INSERT/UPDATE/DELETE` ke `app_runtime`.

`ai_audit_logs.user_id` sengaja tanpa FK agar audit tetap ada walau user dihapus dan insert append-only tidak membebani FK check.

### 5.1 Struktur JSONB

**`wins_data`**
```json
{
  "physical": {
    "title": "Take a 10-minute walk and get some fresh air",
    "why_this": "Your physical exhaustion is at 89 today. Gentle movement gets your blood flowing without draining what's left.",
    "steps": ["Put on your shoes and head outside", "Walk at an easy pace with your phone in your pocket"],
    "duration_seconds": 600,
    "level": 0, "completed": false
  },
  "work": {
    "title": "Pick 1 task and break it into a 5-minute step",
    "why_this": "Work exhaustion is at 75, so focus is thin. Starting with just 5 minutes gets you past that stuck feeling without asking too much.",
    "steps": ["Type the one task on your mind into the slicer below", "Work on the tiny step it gives you until the timer rings"],
    "duration_seconds": 300,
    "level": 0, "completed": false,
    "main_task": null, "micro_step": null
  },
  "soul": {
    "title": "Put screens away 20 minutes before bed tonight",
    "why_this": "Your well-being score is 25 today. Your mind needs a break from constant input so rest can actually restore you.",
    "steps": ["Turn on Do Not Disturb before you get ready for bed", "Leave your phone somewhere you can't reach from bed"],
    "duration_seconds": 1200,
    "level": 0, "completed": false
  }
}
```
Setiap kartu pilar dibuat **siap eksekusi tanpa berpikir** (mengurangi *decision fatigue*):
- `title`: aksi utama, ≤ 80 karakter.
- `why_this`: 1–2 kalimat (≤ 240 karakter) yang **menyebut skor terkait** hari ini (physical → `physical_exhaustion`, work → `work_exhaustion`/`disengagement`, soul → `soul_wellbeing`), supaya pengguna tahu target ini dibuat untuk kondisinya.
- `steps`: **tepat 2** langkah mikro konkret (masing-masing ≤ 120 karakter).
- `duration_seconds`: panjang timer aktivitas di kartu (60–3600 detik). Untuk `work`, nilai awalnya panjang rencana dan diganti durasi `micro_step` setelah AI Task Slicer dipakai.

Setelah recalibrate, `why_this` diganti kalimat tetap ("You asked for something lighter…"), `steps` dikosongkan, dan `duration_seconds` pilar physical/soul menjadi `null` (timer disembunyikan), karena alasan dan langkah lama tidak lagi cocok dengan target yang lebih kecil. Log lama yang belum punya `why_this`/`steps` tetap valid; kartu cukup menampilkan judulnya.

Field opsional per kartu:
- `habit` (≤ 120): kegiatan asal win ini, dari habit (FR-10) atau dari swap hari itu (FR-11). Tidak ada bila AI yang memilihkan.
- `swapped`: `true` bila win ditukar khusus hari itu (FR-11).

`level` 0 = target awal, 3 = paling ringan. `wins_completed_count` **selalu** dihitung ulang dari `wins_data` dalam statement UPDATE yang sama.

**`pillar_progress` (turunan, tanpa tabel baru).** Milestone Path dihitung saat dibaca dari `wins_data.<pilar>.completed` di semua log pengguna (seumur hidup, hanya log dengan `wins_completed_count > 0`), urut `log_date`. Satu log memuat paling banyak 1 win per pilar, sehingga win ke-3n suatu pilar jatuh tepat di satu tanggal (`reached_on`). Karena hari lampau terkunci (semua mutasi wins hanya untuk hari ini/kemarin, §7.4), progres lama tidak pernah turun; yang bisa mengurangi hanya pengguna membatalkan centang win pada hari itu sendiri. Bentuk final di §7.5.

**`cope_options`** (tepat 3 elemen)
```json
[{ "id": "cope_1", "title": "string", "brief_cope_category": "self_distraction",
   "tool_type": "timer", "duration_seconds": 600, "guidance": "string" }]
```

### 5.2 Migrasi SQL (`backend/migrations/000001_init_schema.up.sql`)

> Prasyarat: role `app_migrator` (owner skema) dan `app_runtime` (LOGIN, tanpa ownership) dibuat oleh `deploy/postgres/init/01-roles.sh` menggunakan password dari env. Integration test (Testcontainers) harus menjalankan script yang sama.

```sql
-- 1. Users
CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    timezone      VARCHAR(64)  NOT NULL DEFAULT 'Asia/Jakarta',
    ai_consent_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Refresh Tokens (Rotation & Reuse Detection)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,          -- hex SHA-256 dari token opak
    family_id   UUID        NOT NULL,
    revoked_at  TIMESTAMPTZ,                          -- NULL = aktif
    replaced_by UUID REFERENCES refresh_tokens(id),   -- untuk grace period rotasi
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens (user_id);

-- 3. Daily Logs
CREATE TABLE daily_logs (
    id                   UUID PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_date             DATE        NOT NULL,
    raw_answers          JSONB       NOT NULL CHECK (jsonb_typeof(raw_answers) = 'object'),
    brain_dump           TEXT        NOT NULL DEFAULT '' CHECK (char_length(brain_dump) <= 2000),
    fun_cope_input       TEXT        NOT NULL DEFAULT '' CHECK (char_length(fun_cope_input) <= 200),
    scores               JSONB       NOT NULL CHECK (jsonb_typeof(scores) = 'object'),
    calibration_tier     VARCHAR(16) NOT NULL CHECK (calibration_tier IN ('gentle','balanced','standard')),
    diagnostic_summary   TEXT        NOT NULL,
    safety_flag          BOOLEAN     NOT NULL DEFAULT FALSE,
    cope_options         JSONB       NOT NULL CHECK (jsonb_typeof(cope_options) = 'array'),
    positive_cope_chosen VARCHAR(150),
    wins_data            JSONB       NOT NULL CHECK (jsonb_typeof(wins_data) = 'object'),
    wins_completed_count SMALLINT    NOT NULL DEFAULT 0 CHECK (wins_completed_count BETWEEN 0 AND 3),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_log_date UNIQUE (user_id, log_date)
);

-- Index-Only Scan untuk heatmap 365 hari
CREATE INDEX idx_daily_logs_heatmap
    ON daily_logs (user_id, log_date DESC)
    INCLUDE (wins_completed_count, positive_cope_chosen);

-- Partial index untuk statistik kumulatif (hanya hari "aktif")
CREATE INDEX idx_daily_logs_active_milestones
    ON daily_logs (user_id, log_date)
    WHERE wins_completed_count > 0 OR positive_cope_chosen IS NOT NULL;

-- Trigger updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_logs_updated_at
    BEFORE UPDATE ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. AI Audit Logs (append-only time-series)
CREATE TABLE ai_audit_logs (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL,
    endpoint    VARCHAR(64) NOT NULL,
    latency_ms  INT         NOT NULL,
    is_fallback BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_audit_created_brin ON ai_audit_logs USING BRIN (created_at);

-- 5. Row-Level Security (defense-in-depth)
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs FORCE  ROW LEVEL SECURITY;

CREATE POLICY daily_logs_isolation_policy ON daily_logs
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

-- 6. Least-privilege grants
GRANT SELECT, INSERT, UPDATE         ON users, daily_logs TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens    TO app_runtime;
GRANT INSERT                         ON ai_audit_logs     TO app_runtime;
```

File `000001_init_schema.down.sql` menghapus objek di atas dalam urutan terbalik.

### 5.3 Aturan Wajib Penggunaan RLS dengan `pgxpool`
Karena koneksi di-*pool*, `app.current_user_id` **harus** di-set per transaksi, bukan per sesi:

```go
// database.WithUserTx(ctx, pool, userID, func(q *sqlc.Queries) error { ... })
// BEGIN;
// SELECT set_config('app.current_user_id', $1, true);   -- true = LOCAL, hilang saat COMMIT/ROLLBACK
// ... query ...
// COMMIT;
```

Semua akses `daily_logs` **wajib** lewat `WithUserTx`. Query `daily_logs` di luar helper ini akan mengembalikan 0 baris (bukan bocor) — perilaku ini harus diuji di integration test.

---

## 6. Struktur Folder Monorepo

```text
├── deploy/
│   ├── nginx/nginx.conf               # SPA (/) + LB API (/api/v1/) + security headers SPA + X-Real-IP
│   ├── postgres/init/01-roles.sh      # Membuat app_migrator & app_runtime dari env
│   └── zap/zap-rules.tsv              # Ruleset OWASP ZAP API Scan
├── backend/
│   ├── cmd/api/main.go                # Entry point, wiring, graceful shutdown
│   ├── cmd/seed/main.go               # Akun demo + 30 hari check-in (SEED_DEMO_PASSWORD)
│   ├── api/openapi.yaml               # Kontrak API (sumber untuk ZAP & FE); diperbarui tiap modul
│   ├── internal/
│   │   ├── config/                    # Env loader & validator
│   │   ├── database/                  # pgxpool, WithTx, WithUserTx, sqlc generated (sqlc/)
│   │   ├── cache/                     # Redis client, Lua sliding-window limiter, idempotency store
│   │   ├── middleware/                # RequestID, RealIP, SecurityHeaders, RateLimit, Auth, CSRF, Recoverer
│   │   ├── shared/                    # JSON envelope, AppError + kode error, UUIDv7, validasi tanggal
│   │   └── features/
│   │       ├── auth/                  # route, handler, service, repository, dto, *_test
│   │       ├── checkin/               # + scorer.go, safety.go, fallback.go
│   │       ├── wins/                  # + swap.go
│   │       ├── habits/
│   │       └── profile/               # + progress.go (Milestone Path), insights.go (Pattern Discovery)
│   ├── pkg/ai/                        # AiProvider, MockAiProvider, GeminiProvider, breaker, schema
│   ├── migrations/                    # 000001_init_schema, 000002_user_habits (.up/.down.sql)
│   ├── queries/                       # *.sql untuk sqlc
│   ├── sqlc.yaml
│   └── Dockerfile                     # Multi-stage → distroless, non-root
├── frontend/
│   ├── src/
│   │   ├── api/                       # fetch wrapper: credentials, X-CSRF-Token, single-flight refresh
│   │   ├── features/                  # auth/, checkin/, cope/, wins/, profile/, theme/ (atmosphere), today/
│   │   └── components/                # BreathingPacer, CountdownTimer, HeatmapGrid, SafetyBanner
│   ├── tests/e2e/                     # Playwright
│   └── Dockerfile                     # Build Vite → static asset untuk NGINX
├── .github/workflows/ci.yml
├── .env.example
└── docker-compose.yml                 # nginx + api-1 + api-2 + migrate (one-shot) + postgres + redis
```

### 6.1 Environment Variables (`.env.example`)

| Variabel | Contoh | Keterangan |
| :--- | :--- | :--- |
| `APP_ENV` | `development` | `development` / `production` |
| `HTTP_ADDR` | `:8080` | |
| `DATABASE_URL` | `postgres://app_runtime:...@postgres:5432/app` | Role runtime |
| `MIGRATE_DATABASE_URL` | `postgres://app_migrator:...@postgres:5432/app` | Hanya untuk service `migrate` |
| `REDIS_URL` | `redis://redis:6379/0` | |
| `JWT_SECRET` | 32+ byte acak | Sama di semua instans API |
| `COOKIE_SECURE` | `true` | `false` hanya untuk dev non-localhost |
| `TRUSTED_PROXY_CIDRS` | `172.16.0.0/12` | Sumber yang boleh mengirim `X-Real-IP` |
| `AI_PROVIDER` | `mock` | `mock` / `gemini` |
| `GEMINI_API_KEY` | — | Wajib jika `AI_PROVIDER=gemini` |
| `GEMINI_MODEL` | — | Nama model Gemini yang dipakai |
| `AI_DAILY_LIMIT` | `30` | Kuota panggilan AI per user per hari lokal; `0` = tanpa batas. Lewat batas → template + `ai_note: "daily_limit"` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | — | Superuser container Postgres (hanya untuk init) |
| `APP_MIGRATOR_PASSWORD`, `APP_RUNTIME_PASSWORD` | — | Dipakai `01-roles.sh` untuk role `app_migrator` & `app_runtime` |
| `SEED_DEMO_PASSWORD` | — | Password akun demo dari `cmd/seed` (hanya untuk demo lokal) |

---

## 7. REST API Contract (`/api/v1`)

**Envelope sukses:** `{ "success": true, "data": { ... }, "meta": { "request_id": "..." } }`
**Envelope error:** `{ "success": false, "error": { "code": "STRING_CODE", "message": "...", "details": {} }, "meta": { "request_id": "..." } }`

Format tanggal path `{date}` = `YYYY-MM-DD`. Untuk mutasi, `{date}` hanya boleh **hari ini atau kemarin** menurut `users.timezone`.

### 7.0 Aturan Umum

**Kode error**

| HTTP | `code` | Kapan |
| :--- | :--- | :--- |
| 400 | `VALIDATION_ERROR` | Body/param tidak valid (detail per field di `details`) |
| 401 | `UNAUTHENTICATED` | Access token tidak ada/kedaluwarsa |
| 401 | `INVALID_CREDENTIALS` | Login gagal (pesan generik) |
| 403 | `CSRF_INVALID` | Header `X-CSRF-Token` tidak ada/tidak cocok |
| 404 | `NOT_FOUND` | Log tanggal tsb belum ada |
| 409 | `EMAIL_TAKEN` | Registrasi email terpakai |
| 409 | `CHECKIN_LOCKED` | Re-check-in padahal sudah ada win selesai |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Key sama sedang diproses |
| 409 | `CONCURRENT_MODIFICATION` | Versi berubah saat recalibrate |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Key sama, body berbeda |
| 422 | `MIN_LEVEL_REACHED` | Recalibrate di level 3 |
| 422 | `DATE_OUT_OF_RANGE` | Tanggal bukan hari ini/kemarin |
| 429 | `RATE_LIMITED` | + header `Retry-After` |
| 500 | `INTERNAL` | |

**Idempotency-Key** (wajib pada `POST /checkin`, `POST /checkin/{date}/reflect`, `POST /wins/{date}/slice-task`, `POST /wins/{date}/recalibrate`, `POST /wins/{date}/swap`)
- Format UUID. Kunci Redis: `idem:{user_id}:{route}:{key}`.
- Request pertama: `SET NX` status `processing` (TTL 30s) + hash SHA-256 body.
- Selesai: simpan status HTTP + body response (TTL 24 jam). Request ulang dengan key & body sama → response yang sama di-*replay*.
- Key sama + body beda → `422 IDEMPOTENCY_KEY_REUSED`. Masih `processing` → `409 IDEMPOTENCY_IN_PROGRESS`.
- Response 5xx tidak disimpan (key dihapus agar bisa dicoba ulang).

**Rate limit:** endpoint bertanda 🤖 dihitung ke kuota AI 10 req/menit/user dan ke kuota AI harian per user (`AI_DAILY_LIMIT`, default 30; kunci Redis `rl:aiday:<user>:<tanggal lokal>`, *fail-open* bila Redis error). Saat kuota harian habis, server memakai fallback deterministik dan response membawa `ai_note: "daily_limit"`; bila AI gagal atau ditolak validator, `ai_note: "unavailable"`. Field `ai_note` opsional ada di respons kelima endpoint 🤖 (`POST /checkin`, `/checkin/{date}/reflect`, `/wins/{date}/slice-task`, `/recalibrate`, `/swap`) dan hanya muncul saat template menggantikan AI.

### 7.1 Health
- `GET /api/v1/health` → `200 { "status": "ok" }` (liveness, tanpa dependensi).
- `GET /api/v1/health/ready` → `200` jika Postgres & Redis bisa di-ping, selain itu `503`.

### 7.2 Auth (`/api/v1/auth`)

Cookie yang di-set:

| Cookie | HttpOnly | Path | Max-Age |
| :--- | :--- | :--- | :--- |
| `access_token` (JWT HS256, claim `sub`, `exp`, `iat`, `jti`) | ✅ | `/api/v1` | 15 menit |
| `refresh_token` (32 byte acak, base64url) | ✅ | `/api/v1/auth` | 7 hari |
| `csrf_token` (32 byte acak) | ❌ (dibaca JS) | `/` | 7 hari |

Semua: `Secure`, `SameSite=Strict`.

- `POST /auth/register` — Body `{ "email", "password" (min 10), "full_name", "timezone"?, "ai_consent": true }` → `201 { "user": { "id", "email", "full_name" } }` + Set-Cookie.
- `POST /auth/login` — Body `{ "email", "password" }` → `200 { "user": {...} }` + Set-Cookie. Rate limit 5/menit per IP+email.
- `GET /auth/me` — → `200 { "user": {...} }` atau `401`.
- `POST /auth/refresh` — Cookie `refresh_token`, header `X-CSRF-Token` → `200 { "refreshed": true }` + cookie baru.
  - Token valid & aktif → cabut (`revoked_at`), terbitkan token baru di `family_id` yang sama, isi `replaced_by`.
  - Token sudah dicabut **≤ 10 detik** lalu dan punya `replaced_by` → anggap request paralel: `401` tanpa mencabut family (frontend akan memakai cookie baru dari request pemenang).
  - Token dicabut **> 10 detik** lalu → *reuse terdeteksi*: cabut seluruh family, clear cookie, `401`.
- `POST /auth/logout` — header `X-CSRF-Token` → `200 { "logged_out": true }`, cabut family refresh token aktif, clear cookie.

### 7.3 Check-In & Positive Cope (`/api/v1/checkin`)

**`POST /checkin`** 🤖 — Header `X-CSRF-Token`, `Idempotency-Key`

Request:
```json
{
  "log_date": "2026-11-26",
  "answers": {
    "cbi_1": 4, "cbi_2": 3, "cbi_3": 4,
    "olbi_ex_1": 4, "olbi_ex_2": 3,
    "olbi_dis_1": 2, "olbi_dis_2": 2,
    "who5_1": 2, "who5_2": 1
  },
  "brain_dump": "Tugas numpuk dan badan rasanya remuk.",
  "fun_cope_input": "Main gitar 10 menit sambil dengerin lagu"
}
```
Validasi: tepat 9 kunci di atas (kunci lain ditolak), tiap nilai integer 1–4, batas panjang teks sesuai §5.2.

Perilaku UPSERT: `INSERT ... ON CONFLICT (user_id, log_date) DO UPDATE ... WHERE daily_logs.wins_completed_count = 0 RETURNING *`. Jika tidak ada baris yang kembali (sudah ada win selesai) → `409 CHECKIN_LOCKED`. Re-check-in mereset `positive_cope_chosen` dan `wins_data`.

Response `200`:
```json
{
  "id": "0193…",
  "log_date": "2026-11-26",
  "scores": { "physical_exhaustion": 89, "work_exhaustion": 83, "disengagement": 33, "soul_wellbeing": 17 },
  "calibration_tier": "gentle",
  "diagnostic_summary": "Kelelahan fisik dan kerjamu sedang tinggi, tapi rasa keterlibatanmu masih terjaga. Hari ini cukup ambil langkah kecil.",
  "safety_flag": false,
  "cope_options": [
    { "id": "cope_1", "title": "Main Gitar Tanpa Target 10 Menit", "brief_cope_category": "self_distraction",
      "tool_type": "timer", "duration_seconds": 600, "guidance": "Mainkan akor favorit tanpa merekam atau menilai diri." },
    { "id": "cope_2", "title": "Pernapasan 4-7-8", "brief_cope_category": "acceptance",
      "tool_type": "breathing", "duration_seconds": 180, "guidance": "Tarik 4 detik, tahan 7 detik, hembuskan 8 detik." },
    { "id": "cope_3", "title": "Unfiltered Brain Dump", "brief_cope_category": "venting",
      "tool_type": "brain_dump", "duration_seconds": 300, "guidance": "Tulis semua beban pikiran tanpa disunting." }
  ],
  "positive_cope_chosen": null,
  "wins_data": {
    "physical": { "title": "Take a 10-minute walk and get some fresh air",
                  "why_this": "Your physical exhaustion is at 89 today. ...",
                  "steps": ["Put on your shoes and head outside", "Walk at an easy pace with your phone in your pocket"],
                  "duration_seconds": 600, "level": 0, "completed": false },
    "work": { "title": "Pick 1 task and break it into a 5-minute step",
              "why_this": "Work exhaustion is at 75, so focus is thin. ...",
              "steps": ["Type the one task on your mind into the slicer below", "Work on the tiny step it gives you until the timer rings"],
              "duration_seconds": 300, "level": 0, "completed": false, "main_task": null, "micro_step": null },
    "soul": { "title": "Put screens away 20 minutes before bed tonight",
              "why_this": "Your well-being score is 25 today. ...",
              "steps": ["Turn on Do Not Disturb before you get ready for bed", "Leave your phone somewhere you can't reach from bed"],
              "duration_seconds": 1200, "level": 0, "completed": false }
  },
  "wins_completed_count": 0
}
```
Respons `POST /checkin` bisa membawa `ai_note` (§7.0). `wins_data.work` juga memuat `steps_done` setelah Task Slicer bertahap dipakai (§7.4).

**`GET /checkin/{date}`** — `200` objek `daily_log` (bentuk sama dengan response di atas) atau `404 NOT_FOUND`. `GET /checkin/today` boleh dipakai sebagai alias (tanggal dihitung dari `users.timezone`).

**`PATCH /checkin/{date}/cope`** — Header `X-CSRF-Token`, Body `{ "cope_option_id": "cope_2" }` → `200 { "positive_cope_chosen": "Pernapasan 4-7-8" }`. Server memvalidasi ID ada di `cope_options` lalu menyimpan **judul**-nya (dipakai heatmap). Boleh diganti selama hari yang sama.

**`POST /checkin/{date}/reflect`** 🤖 — Header `X-CSRF-Token`, `Idempotency-Key`. Refleksi singkat atas brain dump di ruang Brain-Dump (FR-05).

Request: `{ "text": "1–2000 karakter", "consent": true }`. `consent` yang tidak ada / bukan `true` → `400 VALIDATION_ERROR` (AI tidak dipanggil). `{date}` hari ini atau kemarin (`422 DATE_OUT_OF_RANGE`), dan log tanggal itu harus ada (`404 NOT_FOUND`) karena `calibration_tier`-nya menentukan nada.

Response `200`:
```json
{ "reflection": "It sounds like work pressure is taking up a lot of room right now. ...",
  "themes": ["Work pressure", "Running low on rest"],
  "safety_flag": false }
```
Aturan: `reflection` ≤ 280 karakter, `themes` ≤ 3 item (masing-masing ≤ 40 karakter), `ai_note` (`daily_limit` / `unavailable`) hanya ada bila template menggantikan AI. Urutan: validasi → log harus ada → `DetectCrisis(text)`; bila terpicu, **AI tidak dipanggil** dan response berisi template empatik + `safety_flag: true` (UI menampilkan `SafetyBanner`) → kuota harian → `AiProvider.Reflect` + validator → fallback deterministik bila gagal. Teks tidak disimpan, tidak di-log, dan tidak ada di response (NFR-06); `ai_audit_logs` mencatat `endpoint = 'POST /checkin/{date}/reflect'`, latency, dan `is_fallback` saja.

### 7.4 3 Daily Wins (`/api/v1/wins`)

**`POST /wins/{date}/slice-task`** 🤖 — Header `X-CSRF-Token`, `Idempotency-Key`, Body `{ "main_task": "string (≤300)", "next_step"?: false }` → `200 { "main_task": "...", "micro_step": "...", "duration_seconds": 300, "steps_done": 0, "ai_note"?: "daily_limit|unavailable" }`. Disimpan ke `wins_data.work`. `duration_seconds` ∈ [300, 600]. Dengan `next_step: true` (setelah langkah sekarang selesai), server **tidak** memakai teks dari klien: ia membaca `main_task` & `micro_step` tersimpan, meminta langkah berikutnya, dan menyimpan `steps_done + 1`; tanpa `micro_step` tersimpan → `400 VALIDATION_ERROR`. Fallback memakai template "next step" per tier.

**`POST /wins/{date}/recalibrate`** 🤖 — Header `X-CSRF-Token`, `Idempotency-Key`, Body `{ "pillar": "physical|work|soul" }` → `200 { "pillar": "work", "new_title": "...", "level": 1, "duration_seconds"?: 300, "ai_note"?: "daily_limit|unavailable" }`. Alur §8.3. Untuk pilar `work` yang sudah punya `micro_step`, yang diperkecil adalah `micro_step` (dan `duration_seconds`, dibatasi 300/180/60 detik untuk level 1/2/3; hanya ada di respons untuk kasus ini). Recalibrate mereset `completed` pilar tsb menjadi `false`.

**`POST /wins/{date}/swap`** 🤖 — Header `X-CSRF-Token`, `Idempotency-Key`, Body `{ "pillar": "physical|soul", "activity": "string (1–120)" }` → `200 { "pillar": "physical", "win": { ...WinItem, "habit": "yoga in my room", "swapped": true }, "ai_note"?: "daily_limit|unavailable" }`. Alur sama dengan §8.3: baca tanpa lock, panggil `AiProvider.PlanWin` di luar transaksi, lalu tulis dengan `FOR UPDATE`. Win yang sudah `completed` ditolak `400`. `user_habits` tidak diubah. Bila AI gagal, win dibangun dari template deterministik (`ai.HabitWin`).

**`PATCH /wins/{date}/toggle`** — Header `X-CSRF-Token`, Body `{ "pillar": "physical|work|soul", "completed": true }` → `200 { "pillar": "physical", "completed": true, "wins_completed_count": 1 }`. Dalam transaksi `FOR UPDATE`; `wins_completed_count` dihitung ulang dari `wins_data`.

### 7.5 Profile Heatmap (`/api/v1/profile`)

**`GET /profile/heatmap`** → `200`:
```json
{
  "range": { "from": "2025-11-27", "to": "2026-11-26" },
  "milestones": { "total_active_days": 17, "total_complete_days": 12, "total_recovery_days": 5, "total_daily_wins": 41, "total_checkpoints": 3 },
  "days": [ { "date": "2026-11-26", "level": "complete", "wins_count": 3, "cope_chosen": "Pernapasan 4-7-8" } ],
  "pillar_progress": {
    "physical": { "completed_total": 7,
                  "checkpoints": [ { "number": 1, "reached_on": "2026-11-08" }, { "number": 2, "reached_on": "2026-11-20" } ],
                  "next_checkpoint_at": 9, "last_completed_on": "2026-11-26" },
    "work":     { "completed_total": 4, "checkpoints": [ { "number": 1, "reached_on": "2026-11-15" } ],
                  "next_checkpoint_at": 6, "last_completed_on": "2026-11-25" },
    "soul":     { "completed_total": 0, "checkpoints": [], "next_checkpoint_at": 3, "last_completed_on": null }
  }
}
```
- `days` hanya berisi tanggal yang memiliki log dalam 365 hari terakhir (per `users.timezone`); level dihitung di SQL/service sesuai §2.3.
- `milestones` dihitung seumur hidup (bukan hanya 365 hari).
- Query heatmap hanya menyentuh kolom `user_id, log_date, wins_completed_count, positive_cope_chosen` agar memenuhi syarat *Index-Only Scan* (verifikasi dengan `EXPLAIN (ANALYZE, BUFFERS)` di integration test; *Heap Fetches* bisa > 0 sampai autovacuum memperbarui visibility map — itu normal).
- `pillar_progress` (seumur hidup) dibaca dengan **query terpisah** `GetPillarCompletions` (membaca `wins_data`) di transaksi `WithUserTx` yang sama, sehingga query heatmap tetap *Index-Only Scan*. Per pilar: `completed_total`; `checkpoints` = array `{ number, reached_on }` (satu per 3 win, `reached_on` = tanggal win ke-3n selesai, urut tanggal); `next_checkpoint_at` = `(floor(completed_total / 3) + 1) * 3`; `last_completed_on` = tanggal win terakhir pilar itu atau `null`. `milestones.total_checkpoints` = jumlah checkpoint ketiga pilar. RLS berlaku: data pengguna lain tidak pernah terlihat.
- Hari lampau terkunci (mutasi hanya hari ini/kemarin), jadi `pillar_progress` dan `milestones` lama tidak pernah turun; yang bisa mengurangi hanya pengguna membatalkan centang win pada hari itu sendiri.

**`GET /profile/insights`** (Pattern Discovery, FR-12; bukan endpoint AI) → `200`:
```json
{
  "window_days": 90, "days_analyzed": 30, "min_days": 7,
  "insights": [
    { "id": "weekday-peak", "kind": "weekday_peak",
      "headline": "Your physical exhaustion tends to peak on Mondays",
      "detail": "Across your last 30 check-ins, Mondays averaged 78 against 52 on other days. ...",
      "sample_size": 4 }
  ]
}
```
- Membaca check-in 90 hari terakhir (per `users.timezone`) lewat `WithUserTx`. `days_analyzed < min_days` (7) → `insights: []`.
- Maksimal 3 insight, urutan tetap: `cope_next_day` (cope yang diikuti Work Win selesai keesokan harinya ≥ 20 poin persen lebih sering daripada hari lain, minimal 3 pasangan hari), `weekday_peak` (≥ 14 hari, hari dengan kelelahan fisik ≥ 10 poin di atas hari lain), `exhaustion_trend` (≥ 14 hari, rata-rata kelelahan naik/turun ≥ 10 poin), `recovery_days` (≥ 3 hari recovery). Masing-masing punya ambang bukti minimal dan `sample_size`.

### 7.6 Habits (`/api/v1/habits`)

**`GET /habits`** → `200 { "physical": { "activity": "morning run", "struggle": "too sleepy" } | null, "work": … | null, "soul": … | null }`.

**`PUT /habits`** — Header `X-CSRF-Token`, Body berbentuk sama → `200` habit yang tersimpan. Mengganti ketiga pilar sekaligus; `null` atau `activity` kosong menghapus habit pilar itu. Spasi di-*trim*; `activity` > 120 atau `struggle` > 200 karakter → `400 VALIDATION_ERROR`. Bukan endpoint AI.

---

## 8. Spesifikasi Lapisan AI (`pkg/ai`)

### 8.1 Interface
```go
type AiProvider interface {
    GenerateCheckin(ctx context.Context, in CheckinInput) (CheckinOutput, error)   // summary + 3 cope + 3 wins
    SliceTask(ctx context.Context, in SliceTaskInput) (SliceTaskOutput, error)
    Recalibrate(ctx context.Context, in RecalibrateInput) (RecalibrateOutput, error)
    PlanWin(ctx context.Context, in PlanWinInput) (WinPlan, error)                 // 1 win dari 1 kegiatan (swap)
    Reflect(ctx context.Context, in ReflectInput) (ReflectOutput, error)           // refleksi brain dump (FR-05)
}
```
`ReflectInput` hanya berisi `calibration_tier` dan teks brain dump (terpotong 2.000 karakter, dibungkus `<user_brain_dump>` yang di-escape). Validator `ValidateReflectOutput` menolak: `reflection` kosong / > 280, `themes` > 3 atau > 40 karakter, kata diagnosis (mis. *depression*, *disorder*, *ADHD*), saran medis (mis. *medication*, *pills*, *melatonin*), teks non-Inggris (aksara non-Latin atau ≥ 2 kata umum bahasa Indonesia), dan kutipan ulang teks user (satu kalimat utuh ≥ 4 kata, atau 8 kata berurutan, tanpa membedakan huruf besar & tanda baca). Fallback `ai.ReflectTemplate` disusun dari kalimat tetap per tier + label tema tetap yang dipilih dari kata kunci, jadi tidak pernah menyalin teks.
`CheckinInput` membawa `Habits` (map pilar → `{activity, struggle}`); bila ada, AI wajib membangun win pilar itu dari habit tersebut.
- `MockAiProvider`: output deterministik berdasarkan `calibration_tier` + hash input; dipakai di semua test & demo default.
- `GeminiProvider`: structured output dengan JSON schema; dibungkus `gobreaker` (buka setelah 5 kegagalan beruntun, half-open setelah 30s) dan timeout 8s.

### 8.2 Prompt Guard & Validasi Output
- Teks pengguna dibungkus delimiter XML, mis. `<user_brain_dump>…</user_brain_dump>`; karakter `<` dan `>` di dalam input di-escape. System prompt menyatakan isi tag adalah data, bukan instruksi.
- Input ke LLM hanya: skor, tier, `fun_cope_input`, `brain_dump` (terpotong 2.000 karakter), `main_task`, dan habit (`<user_habit pillar="..."><habit_activity>…</habit_activity><habit_struggle>…</habit_struggle></user_habit>`, di-escape sama seperti teks lain). Tidak ada email/nama.
- Output divalidasi ketat di Go: tepat 3 cope option, enum kategori & tool sesuai §2.2, durasi dalam rentang, panjang judul ≤ 80, guidance ≤ 240. Setiap win wajib punya `title` ≤ 80, `why_this` tidak kosong ≤ 240, tepat 2 `steps` (≤ 120), dan `duration_seconds` 60–3600 (§5.1). Gagal validasi = error → fallback.
- **Fallback deterministik** (`checkin/fallback.go`): template per `calibration_tier` & pilar; win diambil dari `ai.PlanWins` sehingga `why_this` tetap menyebut skor hari itu. Pilar yang punya habit memakai `ai.HabitWin`, jadi fallback tetap memakai kegiatan pilihan pengguna. Setiap pemakaian fallback mencatat `is_fallback = true` di `ai_audit_logs`. Response ke pengguna tetap `200`.

### 8.3 Alur Recalibrate (menghindari lock selama panggilan LLM)
1. `WithUserTx`: baca `wins_data` (tanpa lock) → ambil `title` & `level` pilar. Jika `level = 3` → `422 MIN_LEVEL_REACHED`.
2. Panggil `AiProvider.Recalibrate` **di luar transaksi** (bisa beberapa detik).
3. `WithUserTx`: `SELECT wins_data ... FOR UPDATE`; jika `level` pilar sudah bukan nilai di langkah 1 → `409 CONCURRENT_MODIFICATION`. Jika sama → tulis `title` baru, `level + 1`, `completed = false`, hitung ulang `wins_completed_count`, `COMMIT`.

Dengan pola ini, dua klik paralel menghasilkan tepat satu kenaikan level (diuji dengan `go test -race`).

### 8.4 Deteksi Krisis (`checkin/safety.go`)
Daftar frasa (lowercase, normalisasi spasi) mis. "bunuh diri", "ingin mati", "mengakhiri hidup", "menyakiti diri", "self harm", "kill myself". Jika cocok → `safety_flag = true`; LLM tetap dipanggil, tetapi `diagnostic_summary` diganti template empatik yang mengarahkan ke bantuan profesional. Pada `POST /checkin/{date}/reflect`, deteksi berjalan sebelum AI dan **LLM tidak dipanggil sama sekali**: response berisi `CrisisReflection` + `safety_flag: true`. Banner UI menampilkan layanan bantuan (nomor hotline **wajib diverifikasi ulang sebelum demo**, mis. layanan SEJIWA 119 ext. 8 dan nomor darurat 112).

---

## 9. Rencana Pengerjaan Per Modul

| Modul | Lingkup | Definition of Done |
| :--- | :--- | :--- |
| **1 — Infra & Core Backend** | Monorepo, `docker-compose.yml` (nginx, api-1, api-2, migrate, postgres, redis), `01-roles.sh`, migrasi 000001 + `sqlc`, `pgxpool` + `WithTx`/`WithUserTx`, Redis Lua limiter, middleware (RequestID, RealIP, SecurityHeaders, RateLimit, Recoverer), UUIDv7, envelope & AppError, `/health` & `/health/ready`, kerangka `openapi.yaml`, `.env.example`. | `docker compose up` sehat; `curl localhost/api/v1/health/ready` = 200 dan request tersebar ke 2 instans; integration test limiter & test RLS (query tanpa `WithUserTx` = 0 baris) lulus. |
| **2 — Auth & Security** | `features/auth`, Argon2id, JWT + cookie, refresh rotation + reuse detection + grace period, CSRF middleware, Auth middleware, `/auth/me`, login rate limit. | Unit + Testcontainers test: rotasi, reuse → family dicabut, refresh paralel tidak logout, request tanpa `X-CSRF-Token` = 403. |
| **3 — Check-In & AI** | `features/checkin` + `pkg/ai`: `scorer.go` (table-driven test), tier, safety, Mock & Gemini provider + breaker + fallback, idempotency store, UPSERT + `CHECKIN_LOCKED`, `GET` & `PATCH cope`. | Test scorer mencakup Preset A/B & contoh §7.3; replay idempotency; fallback saat provider error; `safety_flag` terpicu. |
| **4 — Wins & Profile** | `features/wins` (slice-task, recalibrate §8.3, toggle, swap) + `features/habits` (GET/PUT, RLS) + `features/profile` (heatmap, milestones). | Concurrency test `-race` untuk recalibrate & toggle paralel; `EXPLAIN` heatmap memakai `idx_daily_logs_heatmap`. |
| **5 — Frontend** | Halaman `/login`, `/register`, `/welcome`, `/checkin` (+ Preset A/B, panduan, reading per pilar, kesimpulan, langkah habit), `/cope` (skor, Breathing Pacer, Countdown Timer, Guided Brain-Dump, SafetyBanner), `/wins` (3 kartu, label habit, swap hari ini, Task Slicer, Focus Timer, "Masih Terlalu Berat"), `/profile` (HeatmapGrid, kartu Your habits). API wrapper dengan single-flight refresh. Vite dev proxy `/api` → backend. | `npm run build` lulus; Vitest untuk HeatmapGrid, timer, api wrapper. |
| **6 — E2E, Security & CI** | Playwright full flow, `ci.yml` (lint, gosec via golangci-lint, govulncheck, `go test -race`, Testcontainers, Vitest, Playwright, Trivy, ZAP API scan dari `openapi.yaml`). | Workflow hijau di GitHub Actions. |
| **7–11 — Fase 2** | Sisa §9.3: auto-advance + chips (7), refleksi brain-dump (8), Milestone Path (9), Adaptive Atmosphere (10), sinkronisasi kontrak API + PRD + CI (11). Detail per modul di `progress.md`. | Tiap modul: test terkait + E2E lulus, §9.3 ✅; Modul 11: `openapi.yaml` cocok dengan handler, ZAP 0 FAIL, CI PR hijau. |

### 9.1 Jadwal & Prioritas Potong (5 hari kerja)
| Tanggal | Target |
| :--- | :--- |
| 26 Nov | Modul 1 |
| 27 Nov | Modul 2 |
| 28 Nov | Modul 3 |
| 29 Nov | Modul 4 |
| 30 Nov | Modul 5 |
| 1 Des | Modul 6 |
| 2–7 Des | Buffer, bug fix, video demo, submisi |

Jika terlambat, potong dalam urutan ini (paling aman dipotong lebih dulu): OWASP ZAP → Trivy → BRIN/partial index → `GeminiProvider` (demo pakai mock) → Playwright (cukup 1 skenario happy path).

### 9.2 Aturan Git Commit & Push Per Modul
- Setiap kali **1 modul selesai** dan seluruh test + `openapi.yaml` + `progress.md` telah diperbarui, lakukan `git commit` dan `git push` ke remote `origin` (`https://github.com/AldiRachmatdiantoo/kindling.git`).
- **Hanya satu contributor (pemilik repo):** seluruh commit wajib memakai identitas git pemilik repo (`user.name` & `user.email` lokal/global) dan **dilarang keras** menambahkan trailer `Co-Authored-By`, `Signed-off-by` pihak lain, atau atribusi contributor lain.

### 9.3 Peta Status Fitur

Status: ✅ sudah ada di app · 🟡 sebagian · ⬜ rencana (belum dibangun). Per v1.3 (Modul 11) semua baris ✅; tidak ada item 🟡/⬜ tersisa. Fase 2 (`progress.md`): 7 auto-advance + quick-pick chips, 8 refleksi AI brain-dump, 9 Milestone Path, 10 Adaptive Atmosphere, 11 sinkronisasi akhir (kontrak API, PRD, CI).

| Fitur | Status | Yang sudah ada | Yang belum / rencana |
| :--- | :---: | :--- | :--- |
| Check-in percakapan (FR-02) | ✅ | Panduan, 1 pertanyaan per layar, reading per pilar, kesimpulan | — |
| Habit per pilar (FR-10) & swap hari ini (FR-11) | ✅ | Langkah check-in, kartu profil, label di kartu win, `POST /wins/{date}/swap` | — |
| Cope Room interaktif (FR-05) | ✅ | Pilih 1 dari 3 kartu; ruang Breathing (4-7-8/box/slow), Activity Timer, Brain-Dump. Setelah dilipat: "Read it back to me" / "Keep it private" dengan penjelasan pengiriman ke Google Gemini; `POST /checkin/{date}/reflect` (izin eksplisit `consent: true`, deteksi krisis tanpa AI, teks tidak disimpan/di-log, fallback tanpa AI yang tidak menyalin teks); kartu refleksi + tema, `SafetyBanner`, pesan `ai_note`, coba lagi / lanjut tanpa refleksi | — |
| Auto-advance check-in (FR-02) | ✅ | Pilih jawaban langsung lanjut setelah ±400 ms; panah hanya memindah pilihan; Back tetap ada; Next hanya saat kembali ke pertanyaan yang sudah dijawab; reading per pilar tetap jalan | — |
| Quick-pick chips (FR-02, FR-10, FR-11) | ✅ | 4–5 *chip* per input untuk "fun thing", activity habit tiap pilar, dan swap hari ini; mengisi input dan tetap bisa diedit | — |
| Milestone Path per pilar (FR-08) | ✅ | `pillar_progress` + `milestones.total_checkpoints` di `GET /profile/heatmap` (query terpisah dari `wins_data`, tanpa tabel baru, heatmap tetap *Index-Only Scan*). Komponen `MilestonePath` di `/profile`: tab per pilar, jalur vertikal berkelok dengan node besar per win, peti apresiasi tiap 3 win di tengah jalur, maskot pilar di langkah terakhir (catatan deterministik + tanggal, tanpa hadiah/poin), penanda "Today/Yesterday you got here" atau "Last time you got here · <tanggal>", *empty state*, keyboard, nama aksesibel per pilar, `prefers-reduced-motion`. Kartu statistik: Total wins, Checkpoints reached, Active days, Recovery days | — |
| Pattern Discovery (FR-12) | ✅ | `GET /profile/insights` (90 hari, ≥ 7 hari data, ≤ 3 insight deterministik dengan `sample_size`); kartu di `/profile` dengan hitung mundur hari bila data belum cukup | — |
| Task Slicer bertahap (FR-06) | ✅ | "Slice the next step" / "Win here for today" setelah langkah selesai; `next_step` + `steps_done` di `POST /wins/{date}/slice-task`, server membaca langkah tersimpan | — |
| Adaptive Atmosphere (FR-13) | ✅ | `calibration_tier` check-in hari ini (dari `TodayStatus`, tanpa request baru) → `data-atmosphere="gentle|balanced|standard"` di `<html>`; tanpa check-in hari ini / toggle mati = tanpa atribut (palet default). Hanya keluarga aksen (primary, fill aksi, tint, tinta di atasnya), warna halaman, dan tempo animasi (`--k-pace`) yang bergeser; warna sinyal, tinta, dan permukaan tetap. **`gentle`**: amber hangat di light (`#8f5a17`, fill `#e0b072`), slate teduh di dark (`#5d6c87`, fill `#9aabc3`), animasi ×1.6 lebih lambat. **`balanced`**: palet default (periwinkle), tanpa override. **`standard`**: teal di light (`#0f766e`, fill `#5cc2b3`), emerald di dark (`#0f7a5a`, teks `#4fd1aa`), animasi ×0.85. 126 pasangan teks/latar & komponen lolos AA (`contrast-check.py`). Pergantian = cross-fade warna 320 ms (instan saat `prefers-reduced-motion`); `theme-init.js` mengecat tier hari ini sebelum paint pertama, jadi reload tidak berkedip. Toggle "Match colors to my day" di `/profile` (default on, localStorage) | — |

**Data Milestone Path (final).** Dihitung dari `daily_logs.wins_data` yang sudah ada, tanpa tabel baru. Rancangan awal memakai `checkpoints` berupa angka; bentuk final memakai array `{ number, reached_on }` (jumlahnya tetap `floor(completed_total / 3)`) agar tiap peti bisa menampilkan tanggalnya. Contoh lengkap di §7.5.

---

## 10. Lampiran A — Bank Pertanyaan Check-In (draft, perlu review)

Skala untuk semua butir: **1 = Tidak sama sekali, 2 = Sedikit, 3 = Cukup, 4 = Sangat**. Butir adalah parafrase adaptif, bukan terjemahan resmi instrumen asli.

| Kunci | Dimensi | Pernyataan |
| :--- | :--- | :--- |
| `cbi_1` | Physical | Hari ini badanku terasa lelah atau pegal. |
| `cbi_2` | Physical | Aku merasa terkuras secara fisik bahkan sebelum hari dimulai. |
| `cbi_3` | Physical | Aku merasa tidak punya sisa tenaga untuk hal lain di luar kewajiban. |
| `olbi_ex_1` | Work Exhaustion | Setelah bekerja/belajar, aku butuh waktu lama untuk pulih. |
| `olbi_ex_2` | Work Exhaustion | Saat bekerja/belajar, aku sering merasa terkuras secara emosional. |
| `olbi_dis_1` | Disengagement | Aku mengerjakan tugas secara otomatis, tanpa merasa terlibat. |
| `olbi_dis_2` | Disengagement | Pekerjaan/studiku terasa makin kurang bermakna buatku. |
| `who5_1` | Soul | Hari ini aku merasa cukup ceria dan bersemangat. |
| `who5_2` | Soul | Hari ini aku merasa tenang dan rileks. |

## 11. Lampiran B — Nilai Demo Preset

| Kunci | Preset A: High Exhaustion | Preset B: High Disengagement |
| :--- | :---: | :---: |
| `cbi_1..3` | 4, 4, 4 | 2, 2, 1 |
| `olbi_ex_1..2` | 4, 4 | 2, 2 |
| `olbi_dis_1..2` | 2, 1 | 4, 4 |
| `who5_1..2` | 2, 1 | 2, 2 |
| `brain_dump` | "Deadline numpuk, kurang tidur tiga hari, badan rasanya remuk." | "Aku tetap ngerjain semuanya, tapi rasanya kosong dan nggak ada artinya." |
| `fun_cope_input` | "Rebahan sambil dengerin lagu favorit" | "Main game santai atau gambar asal-asalan" |
| **Skor hasil** | physical 100, work 100, disengagement 17, soul 17 → `gentle` | physical 22, work 33, disengagement 100, soul 33 → `balanced` |

---

## 12. Di Luar Lingkup (v1)
Notifikasi/pengingat, mode offline, hapus akun & ekspor data (dicatat sebagai *nice-to-have* terkait UU PDP), multi-bahasa, OAuth sosial, aplikasi mobile native.

## 13. Catatan Revisi v1.1
Perubahan dari draft awal (detail alasan ada di `progress.md` → Log Keputusan):
1. Contoh `soul_wellbeing` 25 → **17** agar konsisten dengan rumus; rumus skor dan tier kini tertulis eksplisit.
2. Level heatmap `rest` ditambahkan ke kontrak API (sebelumnya hilang); aturan prioritas level ditulis.
3. Cookie `csrf_token` **tidak boleh** HttpOnly (double-submit butuh dibaca JS).
4. RLS: tambah `FORCE`, `WITH CHECK`, grant `app_runtime`, dan aturan `set_config(..., true)` per transaksi untuk `pgxpool`.
5. `pgcrypto` dihapus (UUIDv7 dibuat di Go). Tambah trigger `updated_at`, kolom `timezone`, `ai_consent_at`, `calibration_tier`, `safety_flag`, `revoked_at`, `replaced_by`.
6. Recalibrate tidak lagi menahan row lock selama panggilan LLM; toggle juga transaksional; recalibrate memakai `Idempotency-Key`.
7. Kebijakan re-check-in, validasi tanggal (hari ini/kemarin), batas panjang teks, envelope error, `/auth/me`, `/health/ready` ditambahkan.
8. Grace period refresh token paralel; login rate limit; trusted proxy untuk IP.
9. Kategori Brief-COPE dibatasi ke subskala asli ("Emotional Regulation" bukan subskala Brief-COPE); "4-7-8" tidak lagi disebut "Physiological Sigh" (dua teknik berbeda).
10. Lally (2010): "rata-rata 66 hari" → "median 66 hari".
11. FR-09 Safety & Privacy, NFR-06, `openapi.yaml`, migrator one-shot, env vars, jadwal & daftar potong ditambahkan.

## 14. Catatan Revisi v1.2 (27 Nov 2026)
1. §1.1: tabel data pendukung (WHO, SKI 2023, Gallup, Lally) dengan sumber dan tahun. Klaim tanpa sumber (">80% berhenti karena *streak*") tidak dipakai; efek *what-the-hell* diatribusikan ke Polivy & Herman, bukan Lally.
2. Nama produk tetap **Kindling**; **Ember** sebagai maskot.
3. Filosofi: larangan *streak* dan *win rate*; habit ditentukan pengguna, langkahnya dari AI.
4. FR-02 diperbarui (check-in percakapan, halaman *welcome*); FR-05 merinci ruang interaktif; FR-06 memakai habit.
5. Baru: FR-10 Standing Habits, FR-11 Swap for Today, tabel `user_habits` (migrasi 000002, RLS), field `habit`/`swapped` di `wins_data`, `POST /wins/{date}/swap`, `GET/PUT /habits`, `AiProvider.PlanWin`, kuota AI harian.
6. §9.3 Peta Status Fitur: Cope Room refleksi AI, auto-advance, quick-pick chips, Milestone Path (`pillar_progress`), dan Adaptive Atmosphere dicatat sebagai rencana, bukan acceptance criteria v1.
7. Fase 2 Modul 7 (27 Nov 2026): auto-advance check-in dan quick-pick chips selesai (FR-02, §9.3 ✅).
8. Fase 2 Modul 9 (27 Nov 2026): Milestone Path selesai (FR-08, §1.2, §5.1, §7.5, §9.3 ✅). `pillar_progress.<pilar>.checkpoints` menjadi array `{ number, reached_on }`, ditambah `milestones.total_checkpoints`. Kartu statistik `/profile` kini Total wins, Checkpoints reached, Active days, Recovery days (kartu "3/3 days" dilepas; `total_complete_days` tetap ada di API). Penanda posisi menambah varian "Today you got here" untuk win hari ini.
9. Fase 2 Modul 10 (28 Nov 2026): Adaptive Atmosphere selesai (§9.3 ✅). Atribut `<html>` bernama `data-atmosphere` (sebelumnya prototipe `data-mood` yang hanya mewarnai halaman); `balanced` kini persis palet default. Sekalian diperbaiki temuan lama: `ink-soft` di atas fill aksi default 4.25:1 → `#242951` (4.67:1).

## 15. Catatan Revisi v1.3 (28 Nov 2026, Fase 2 Modul 11)
Sinkronisasi dokumen dengan kode setelah Modul 7–10. Modul ini tidak menambah fitur; semua yang ditulis di bawah sudah ada di kode.
1. Fase 2 Modul 8 (belum tercatat di §14): refleksi brain-dump `POST /checkin/{date}/reflect` dengan izin eksplisit (FR-05, NFR-06, §7.0, §7.3, §8.1, §8.4, §9.3 ✅).
2. FR untuk fitur yang sudah ada tetapi belum punya nomor: **FR-12 Pattern Discovery** (`GET /profile/insights`, dibangun pasca-Modul 6) dan **FR-13 Adaptive Atmosphere** (Modul 10). §9.3 menambah baris Pattern Discovery dan Task Slicer bertahap (keduanya ✅).
3. FR-06: wins terbuka setelah 1 *positive cope* atau "Not today? Skip recovery"; detail kartu bisa dibuka/tutup; Task Slicer bertahap (`next_step`, `steps_done`). §4 diperbarui ("Lanjut ke Wins" → "Not today? Skip recovery"; isi `/profile`).
4. §7: `ai_note` (`daily_limit` / `unavailable`) dirinci untuk kelima endpoint 🤖; `POST /wins/{date}/slice-task` menerima `next_step` dan mengembalikan `steps_done`; respons recalibrate memuat `duration_seconds` (Work yang sudah di-slice, batas 300/180/60) dan `ai_note`; §7.5 menambah `GET /profile/insights`.
5. §6: folder `features/habits`, `cmd/seed`, migrasi 000002, `profile/progress.go` & `insights.go`, frontend `theme/` & `today/`. §6.1: `AI_DAILY_LIMIT`, variabel Postgres/role, `SEED_DEMO_PASSWORD`. §9 menambah baris Fase 2.
6. `backend/api/openapi.yaml` v0.7.0: `/profile/insights` (`InsightsData`, `Insight`), `next_step`/`steps_done` di slice-task, `ai_note` di respons check-in (`CheckinData`), slice-task, recalibrate, swap, dan reflect; `WinItem`/`WorkWinItem` kini memuat `why_this`, `steps`, `duration_seconds`, `steps_done`, `habit`. Spesifikasi lolos `openapi-spec-validator`; ZAP API scan lokal 0 FAIL.
7. Milestone Path (pasca-Fase 2): tampilan diganti dari baris titik horizontal per pilar menjadi tab per pilar + jalur vertikal berkelok (node besar, peti di tengah jalur, maskot di langkah terakhir, langkah mendatang bergaris putus); jalur panjang kini menampilkan 2 checkpoint terakhir (sebelumnya 3) agar tidak terlalu tinggi. Data API tidak berubah (FR-08, §9.3).
8. Perayaan 3/3 (pasca-Fase 2): setelah kru maskot, layar memudar ke ketiga Milestone Path yang masing-masing bertambah satu langkah (garis tergambar, node terisi, peti terbuka bila tercapai), dengan teks "Your path grew 3 steps". Totalnya diambil dari `GET /profile/heatmap` yang sudah ada; API tidak berubah (FR-08).
9. Perayaan win (pasca-Fase 2): tap, Enter, dan Space baru menutup perayaan setelah animasinya selesai (1 win ±1,5 dtk; 3/3 setelah langkah pilar terakhir terisi), dan petunjuk "Tap anywhere to keep going" baru muncul saat itu. Escape tetap menutup kapan saja (FR-08).
10. Tata letak desktop, langkah 1 (pasca-Fase 2): mulai lebar ≥1024 px (Tailwind `lg`), bar atas diganti sidebar kiri tetap selebar 240 px: logo, menu vertikal berlabel lengkap (Check-In/Today, Positive Cope, 3 Daily Wins, Profile & Heatmap), lalu nama akun, toggle tema, dan Sign out di bawah. Di bawah 1024 px tetap seperti sebelumnya (bar atas + pil di 768–1023 px, tab bar bawah di HP). Langkah berikutnya: Wins sebagai daftar + panel detail, lalu Profile/Cope yang memakai lebar layar.
11. Win Physical & Soul sebagai roadmap (pasca-Fase 2): kartu win terlalu rumit untuk pengguna ADHD, jadi habit (mis. "gym") kini dipecah AI menjadi 3–5 langkah berurutan menuju aktivitas itu sendiri, dengan `floor_step`: langkah yang sudah dihitung sebagai "hadir" hari ini ("Today's win counts from here"); langkah setelahnya bonus. `completed` diturunkan dari `steps_done >= floor_step`. "Too big? Make it smaller" memecah langkah saat ini menjadi 2 (AI, dengan template cadangan; maksimal 8 langkah; floor ikut bergeser bila langkah yang dipecah ada di floor atau sebelumnya, sehingga tujuannya tetap sama). "Stop for today" tidak menghapus apa pun: langkah yang sudah selesai sebelum floor tampil sebagai "Started" di riwayat hari itu, tidak dihitung di Milestone. Endpoint baru: `PATCH /wins/{date}/progress {pillar, steps_done}` dan `POST /wins/{date}/steps/split {pillar, step}` (Idempotency-Key, AI rate limit). Work tetap 2 langkah + Task Slicer. "Still too heavy" pada roadmap mengembalikannya ke win biasa dengan toggle. Halaman Wins menjadi daftar 3 baris (maskot, judul, satu baris status) + panel detail: berdampingan dari `lg`, layar penuh di HP dengan tombol kembali. `openapi.yaml` v0.8.0.
