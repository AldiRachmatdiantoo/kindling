# review-workflow.md — Kindling: Workflow Perbaikan Pasca-Review (Per Modul / Per Sesi)

**Sumber Audit:** Review live browser (`http://localhost`, desktop `1280x800` & mobile `390x844`) + audit kode frontend & integrasi backend pada commit `7601717`.
**Tujuan:** Menyelesaikan seluruh temuan bug, aksesibilitas, UX, dan performa secara bertahap dan terverifikasi tanpa regresi.

---

## Checklist Modul Perbaikan

| # | Modul | Fokus Utama | Status |
| :-: | :--- | :--- | :-: |
| R1 | Keamanan CSP, Auth Resilience & Isolasi State | 0 CSP error, logout aman, isolasi storage per `userId`, validasi form & timezone | ☑ |
| R2 | Visual Layout, Scrollbar Gutter & Vertical Fit | Hilangkan gap tepi kanan ~15px, kliping bubble Ember, fit `1280x800`, fokus nav mobile | ☑ |
| R3 | Aksesibilitas, Interaksi Modal, Check-In, Wins & Heatmap | Keyboard trap check-in, focus trap & cleanup modal, toggle paralel Wins, roving tabIndex Heatmap | ☑ |
| R4 | Refactoring, Optimasi Bundle & Performa | Hapus `motion` & duplikat Radix, `React.lazy`, pecah `WinsPage.tsx`, cleanup dead code | ☑ |

Ganti `☐` menjadi `☑` setelah seluruh kriteria verifikasi modul terpenuhi.

---

## Aturan Sesi Terisolasi
1. Kerjakan **hanya 1 modul (`R1`–`R4`)** per sesi chat baru agar perubahan tetap fokus dan mudah direview.
2. Sebelum menutup sesi:
   - Jalankan `cd frontend && npm run build && npm run test` (pastikan semua Vitest lulus).
   - Rebuild container (`docker compose up -d --build nginx`) dan verifikasi visual/interaksi di `http://localhost` (desktop `1280x800` & mobile `390x844`) bila menyentuh UI/CSP.
   - Pastikan Playwright E2E (`npm run test:e2e`) tetap hijau jika ada perubahan alur utama.
   - Centang checklist di file ini dan isi baris *Catatan Handoff* di bawah.
3. Setelah semua verifikasi lulus, lakukan `git commit` dan `git push` ke `origin main` (tanpa `Co-Authored-By` atau contributor tambahan).
4. **WAJIB — Prompt Handoff di Akhir Respons:** Setiap kali sebuah modul selesai, **SELALU tampilkan prompt siap pakai secara lengkap (verbatim, siap copy-paste)** untuk modul berikutnya di bagian paling akhir respons agar pengguna bisa langsung menyalinnya ke sesi baru tanpa perlu membuka file ini lagi. Jangan pernah melewati langkah ini.

---

## Prompt Siap Pakai (Copy-Paste Sesuai Sesi)

### Sesi 1 — Modul R1: Keamanan CSP, Auth Resilience & Isolasi State
> Baca `review-workflow.md`. Kerjakan **hanya Modul R1**.
>
> Ruang lingkup perbaikan:
> 1. **Perbaiki CSP console errors pada build Nginx**:
>    - Pindahkan inline `<script>` inisialisasi tema dari `frontend/index.html` (baris 6–16) ke file skrip statis eksternal (mis. `frontend/public/theme-init.js` yang dimuat via `<script src="/theme-init.js"></script>` sebelum stylesheet/app) sehingga tidak lagi melanggar `script-src 'self'` dan tetap mencegah flash tema sebelum first paint.
>    - Cek konfigurasi CSP di Nginx (`frontend/nginx.conf` atau `deploy/nginx/`) terkait error `data:font/woff2;base64,...` yang diblokir CSP; izinkan `font-src 'self' data:` (atau pastikan font di-bundle sebagai file `.woff2` statis) agar 0 CSP error di console browser.
> 2. **Tangani error pada `logout()`**:
>    - Di `frontend/src/features/auth/AuthContext.tsx` (baris 61–67), tangkap (`catch`) error dari `authApi.logout()` agar tidak melempar unhandled rejection ke `AppShell.tsx` (baris 78–81), sehingga user tetap ter-reset (`setUser(null)`) dan ter-redirect ke `/login` walau request logout gagal/offline.
> 3. **Isolasi `localStorage` & `sessionStorage` per akun (`userId`)**:
>    - Scope key `kindling:recovery-skipped:...` di `frontend/src/features/today/recovery.ts` dengan `userId` (konsisten dengan `checkinDefer.ts`, `WelcomeTour.tsx`, `FeatureTip.tsx`).
>    - Scope `persistKey` timer di `frontend/src/features/wins/WinsPage.tsx` dan `frontend/src/features/cope/CopePage.tsx` dengan `user.id`, serta bersihkan key timer milik user di `sessionStorage` saat logout.
> 4. **Validasi form, error timezone backend, dan copy `SessionUnreachable`**:
>    - Di `frontend/src/features/auth/RegisterPage.tsx`, tampilkan pesan error field dari `err.details` backend (termasuk `err.details.timezone` saat IANA timezone tidak valid) tepat di bawah input masing-masing.
>    - Tambahkan `aria-invalid` dan `aria-describedby` pada input yang memiliki `fieldErrors` di `LoginPage.tsx` dan `RegisterPage.tsx`.
>    - Di `frontend/src/features/auth/RouteGuards.tsx` (baris 31), ubah copy `SessionUnreachable` agar netral (tidak mengklaim `"You're still signed in."` untuk pengunjung yang belum punya sesi).
>
> Verifikasi: jalankan `cd frontend && npm run build && npm run test`, rebuild `docker compose up -d --build nginx`, lalu cek `http://localhost/login` di browser untuk memastikan **0 CSP error** di console. Perbarui checklist & *Catatan Handoff* di `review-workflow.md`, lalu commit & push ke `origin main`. **WAJIB di akhir respons:** tampilkan prompt lengkap siap copy-paste untuk **Sesi 2 — Modul R2** dari `review-workflow.md` agar saya bisa langsung melanjutkan ke sesi berikutnya.

---

### Sesi 2 — Modul R2: Visual Layout, Scrollbar Gutter, Kliping Bubble & Vertical Fit
> Baca `review-workflow.md`. Modul R1 sudah selesai. Kerjakan **hanya Modul R2**.
>
> Ruang lingkup perbaikan:
> 1. **Hilangkan celah ~15px di tepi kanan (scrollbar gutter)**:
>    - Periksa penyebab `scrollbar-gutter: stable` di `frontend/src/index.css` yang membuat elemen sticky/fixed (header scalloped di `AppShell.tsx`, banner atas `/login`, overlay `FocusRoom`, dan `TaskMorphOverlay`) berhenti sebelum area scrollbar dan menyisakan strip ~15px di kanan pada `1280x800` dan `390x844`. Pastikan seluruh header, banner, dan full-screen overlay membentang penuh edge-to-edge tanpa celah.
> 2. **Perbaiki fokus outline mobile bottom nav**:
>    - Di `frontend/src/components/AppShell.tsx` (baris 97, 114) dan `frontend/src/index.css` (baris 171–173), pastikan `<nav>` mobile (latar `bg-surface` putih di light mode) tidak mewarisi `.k-on-primary :focus-visible` (`outline-color: #ffffff`), melainkan memakai warna kontras tinggi (`var(--color-primary)` / `--color-ink`).
> 3. **Perbaiki kliping floating Ember bubble (`How does this work?`)**:
>    - Di `frontend/src/components/MascotBubble.tsx` / `FeatureTip.tsx` (saat dibuka di `/cope` dan `/profile`), pastikan posisi bubble memberi jarak aman di atas fixed bottom navigation bar (desktop & mobile) sehingga kepala/kaki maskot Ember tidak terpotong atau bertumpuk dengan nav.
> 4. **Perbaiki vertical fit pada desktop `1280x800`**:
>    - Di `frontend/src/features/checkin/CheckinPage.tsx`: rapikan spacing/padding vertikal agar pada pertanyaan `1 of 9` seluruh opsi (`1`–`4`) dan tombol `Next` tidak tertutup fixed bottom nav; perbaiki juga sinkronisasi lebar progress bar pada `Last step` setelah klik `Preset A` (teks `100%` harus sesuai dengan fill bar `100%`).
>    - Di `frontend/src/components/FocusRoom.tsx` & `focus-room.css` (khusus mode *Your time* / vinyl record): sesuaikan ukuran vinyl & spacing agar tombol `Start` dan `Reset` muat di dalam viewport tinggi `800px` tanpa harus scroll.
> 5. **Rapikan overlap Welcome Tour di `/wins` kosong**:
>    - Pastikan saat `WelcomeTour` terbuka di halaman `/wins` yang belum terisi, maskot Ember empty-state di belakang backdrop tidak bertumpuk canggung dengan maskot Ember di dialog tour (mis. sembunyikan/redupkan layer belakang atau tingkatkan opacity backdrop).
>
> Verifikasi: jalankan `cd frontend && npm run build && npm run test`, rebuild `docker compose up -d --build nginx`, lalu cek visual di browser pada viewport `1280x800` dan `390x844` (light & dark mode). Perbarui checklist & *Catatan Handoff* di `review-workflow.md`, lalu commit & push ke `origin main`. **WAJIB di akhir respons:** tampilkan prompt lengkap siap copy-paste untuk **Sesi 3 — Modul R3** dari `review-workflow.md` agar saya bisa langsung melanjutkan ke sesi berikutnya.

---

### Sesi 3 — Modul R3: Aksesibilitas & Interaksi Modal, Check-In, Wins & Heatmap
> Baca `review-workflow.md`. Modul R1–R2 sudah selesai. Kerjakan **hanya Modul R3**.
>
> Ruang lingkup perbaikan:
> 1. **Perbaiki keyboard navigation trap di Check-In**:
>    - Di `frontend/src/features/checkin/CheckinPage.tsx` (baris 355–369), pisahkan pemilihan opsi dengan kemunculan `<MascotDialog>` sehingga pengguna keyboard yang menekan `ArrowUp`/`ArrowDown` pada radio group bisa menavigasi semua opsi dengan leluasa tanpa langsung dicegat modal pada opsi pertama (mis. buka dialog saat klik pointer atau tombol konfirmasi/`Next`, atau gunakan pola button-group yang jelas).
> 2. **Focus trap, re-entrancy guard, cleanup timer & scroll lock pada overlay**:
>    - Di `frontend/src/components/FocusRoom.tsx`, `frontend/src/components/TaskMorphOverlay.tsx`, dan `frontend/src/components/CelebrationOverlay.tsx`:
>      - Tambahkan `Tab` / `Shift+Tab` focus trapping (seperti pola di `MascotDialog.tsx`).
>      - Tambahkan `role="dialog" aria-modal="true"` dan tombol dismiss yang fokusabel pada `CelebrationOverlay.tsx`.
>      - Tambahkan guard `closingRef` pada `FocusRoom.close` & `TaskMorphOverlay.close`, serta bersihkan semua `setTimeout` (termasuk fold timer 900ms di `BrainDumpRoom`) saat unmount.
>      - Kunci scroll body saat overlay terbuka (`TaskMorphOverlay`, `MascotDialog`, `CelebrationOverlay`).
> 3. **Perbaiki state & UX di `WinsPage.tsx`**:
>    - Ubah `togglingPillar` dari `Pillar | null` menjadi `Set<Pillar>` agar toggle cepat di beberapa kartu pilar sekaligus tidak saling menimpa status loading.
>    - Reset `finishedStep` (`setFinishedStep(null)`) di dalam `handleSliceTask` dan `handleRecalibrate`.
>    - Sembunyikan atau nonaktifkan tombol `Still too heavy` pada kartu win yang sudah selesai (`completed === true`).
> 4. **Perbaiki aksesibilitas `HeatmapGrid`, `DayHistory`, `SafetyBanner`, `CountdownTimer` & `CopePage`**:
>    - `frontend/src/components/HeatmapGrid.tsx`: terapkan *roving `tabIndex`* (hanya 1 sel `tabIndex={0}`, sisanya `-1`) dengan navigasi tombol panah agar tidak menciptakan 365 tab stops, perbaiki struktur ARIA grid, dan perbaiki pluralisasi `"${cell.wins_count} win"` → `wins` bila `!== 1`.
>    - `frontend/src/features/profile/DayHistory.tsx` & `ProfilePage.tsx`: samakan parsing tanggal dengan `T12:00:00Z` + `timeZone: 'UTC'` (seperti `TodayOverview.tsx`), tambahkan `key={openDate}` pada `DayDetail` agar `openerRef` tidak basi, dan ganti comparator sort dengan `b.date.localeCompare(a.date)`.
>    - `frontend/src/components/SafetyBanner.tsx`: ubah hotline krisis `119 ext. 8` & `112` menjadi `<a href="tel:119">` / `<a href="tel:112">`.
>    - `frontend/src/components/CountdownTimer.tsx`: bungkus pesan selesai dengan `role="status" aria-live="polite"`.
>    - `frontend/src/features/cope/CopePage.tsx`: tambahkan optional chaining pada `window.matchMedia?.(...)` (baris 99) dan fallback ikon `TOOL_ICON[option.tool_type] ?? Timer` (baris 311).
>
> Verifikasi: tambahkan/perbarui unit test Vitest untuk perilaku baru (`CheckinPage`, `WinsPage`, `FocusRoom`, `HeatmapGrid`, `DayHistory`), jalankan `cd frontend && npm run build && npm run test`, lalu verifikasi Playwright E2E (`npm run test:e2e`) terhadap `docker compose`. Perbarui checklist & *Catatan Handoff* di `review-workflow.md`, lalu commit & push ke `origin main`. **WAJIB di akhir respons:** tampilkan prompt lengkap siap copy-paste untuk **Sesi 4 — Modul R4** dari `review-workflow.md` agar saya bisa langsung melanjutkan ke sesi berikutnya.

---

### Sesi 4 — Modul R4: Refactoring, Optimasi Bundle & Performa Frontend
> Baca `review-workflow.md`. Modul R1–R3 sudah selesai. Kerjakan **hanya Modul R4**.
>
> Ruang lingkup perbaikan:
> 1. **Kurangi ukuran bundle & bersihkan dependency**:
>    - Ganti animasi `motion` pada `frontend/src/components/watermelon-ui/popover.tsx` dengan CSS keyframes / state Radix (`data-[state=open]` / `data-[state=closed]`), lalu hapus dependency `motion` dari `frontend/package.json`.
>    - Hapus dependency duplikat `@radix-ui/react-slot` dan import `Slot` langsung dari `radix-ui`.
> 2. **Route-level code splitting & memoize Context**:
>    - Di `frontend/src/App.tsx`, gunakan `React.lazy` + `<Suspense fallback={<PageLoading />}>` untuk halaman-halaman route (`LoginPage`, `RegisterPage`, `CheckinPage`, `CopePage`, `WinsPage`, `ProfilePage`).
>    - Bungkus object `value` pada `AuthContext.tsx`, `TodayStatus.tsx`, dan `popover.tsx` dengan `useMemo` untuk menghindari re-render tidak perlu.
> 3. **Dekomposisi `WinsPage.tsx` (870 baris)**:
>    - Ekstrak `WinCard`, `WorkTaskSlicer`, dan `RecoveryLockedView` ke komponen terpisah di `frontend/src/features/wins/` agar mengetik di input task slicer tidak me-render ulang seluruh kartu pilar dan overlay.
> 4. **Cleanup kode & kesiapan production**:
>    - Pindahkan helper pola napas dari `frontend/src/components/BreathingPacer.tsx` ke utility kecil (mis. `breathingPatterns.ts`) dan hapus komponen JSX `BreathingPacer` yang sudah tidak terpakai di produksi (sesuaikan `CountdownTimer.test.tsx`).
>    - Konsolidasikan helper `formatLongDate` yang duplikat antara `TodayOverview.tsx` dan `DayHistory.tsx` ke `frontend/src/utils/date.ts`.
>    - Di `frontend/src/api/client.ts` (baris 193–199), buat sleep retry `429` menghormati `options.signal` (`AbortSignal`) agar tidak melanjutkan retry setelah komponen unmount.
>    - Di `frontend/src/features/checkin/CheckinPage.tsx` (baris 272–289), gate tombol `Demo: Preset A / Preset B` di belakang env flag (mis. `import.meta.env.VITE_ENABLE_DEMO_PRESETS !== 'false'` agar tetap jalan untuk demo/E2E default namun mudah dimatikan untuk production).
>
> Verifikasi: jalankan `cd frontend && npm run build && npm run test`, catat perbandingan ukuran bundle hasil `vite build` sebelum vs sesudah, rebuild `docker compose up -d --build nginx`, dan jalankan `npm run test:e2e`. Perbarui checklist & *Catatan Handoff* di `review-workflow.md`, lalu commit & push ke `origin main`.

---

## Catatan Handoff (diisi tiap akhir sesi)

| Modul | Selesai | Tertunda / Catatan | Hasil Verifikasi |
| :-: | :--- | :--- | :--- |
| R1 | 2026-11-26 | Tidak ada tertunda. Inline theme-init dipindah ke `frontend/public/theme-init.js`, CSP Nginx ditambah `font-src 'self' data:`, `logout()` aman saat error & membersihkan `sessionStorage` timer per `userId`, `recovery.ts` + `WinsPage` + `CopePage` di-scope ke `userId`, `RegisterPage`/`LoginPage` render `err.details` + `aria-invalid`/`aria-describedby`, copy `SessionUnreachable` dinetralkan. | `npm run build` OK; Vitest 11/11 files (38/38 tests) lulus; `docker compose up -d --build nginx` OK; browser live `http://localhost/login` & `/register` terverifikasi 0 CSP error, `/theme-init.js` 200, error timezone tampil di bawah input dengan ARIA. |
| R2 | 2026-11-26 | Tidak ada tertunda. Menghapus `scrollbar-gutter: stable` dari `index.css` agar header/banner/overlay penuh edge-to-edge; menambahkan kelas `.k-nav-surface` pada `<nav>` mobile (`AppShell.tsx` + `index.css`) dengan outline `--color-primary` (light) & `--color-ink` (dark); mengatur `collisionPadding={{ top: 84, right: 12, bottom: 92, left: 12 }}` di `FeatureTip.tsx`; merapikan spacing vertikal & sinkronisasi progress bar `Preset A` di `CheckinPage.tsx`; menyesuaikan ukuran vinyl & spacing mode timer di `focus-room.css`; menaikkan opacity + blur backdrop `MascotDialog.tsx` dan menyembunyikan Ember empty-state `CheckinPending.tsx` saat `WelcomeTour` aktif. | `npm run build` OK; Vitest 11/11 files (38/38 tests) lulus; `docker compose up -d --build nginx` OK; verifikasi visual browser `http://localhost` pada `1280x800` & `390x844` (light & dark mode): 0 gap kanan, focus ring nav mobile kontras tinggi, bubble Ember `/cope` & `/profile` bebas kliping, pertanyaan `1 of 9` + `Preset A` 100% + `FocusRoom` vinyl fit di `800px`, `WelcomeTour` di `/wins` kosong bebas overlap. |
| R3 | 2026-11-26 | Tidak ada tertunda. Memisahkan pemilihan radio dari `<MascotDialog>` di `CheckinPage.tsx` (navigasi `ArrowUp`/`ArrowDown` bebas, modal terbuka pada klik pointer atau tombol `Next`); menambahkan focus trap `Tab`/`Shift+Tab`, `closingRef` guard, cleanup semua `setTimeout` (termasuk fold timer `BrainDumpRoom`), dan body scroll lock pada `FocusRoom`, `TaskMorphOverlay`, `CelebrationOverlay` (+ `role="dialog" aria-modal="true"` & tombol dismiss fokusabel), dan `MascotDialog`; mengubah `togglingPillar` ke `Set<Pillar>`, reset `finishedStep` di `handleSliceTask` & `handleRecalibrate`, dan menyembunyikan `Still too heavy` pada win selesai di `WinsPage.tsx`; menerapkan roving `tabIndex` + navigasi panah + ARIA grid 7-row + pluralisasi `win`/`wins` di `HeatmapGrid.tsx`; menyamakan parsing tanggal `T12:00:00Z` UTC + `localeCompare` + `key={openDate}` di `DayHistory.tsx`/`ProfilePage.tsx`; mengubah hotline `SafetyBanner.tsx` menjadi `<a href="tel:...">`; membungkus pesan selesai `CountdownTimer.tsx` dengan `role="status" aria-live="polite"`; menambahkan optional chaining `matchMedia?.` & fallback ikon `Timer` di `CopePage.tsx`. | `npm run build` OK (`index-C2HkZTxW.js` 714.72 kB / gzip 222.83 kB); Vitest 13/13 files (48/48 tests) lulus; `docker compose up -d --build nginx` OK; Playwright E2E 3/3 passed (19.4s). |
| R4 | 2026-11-26 | Tidak ada tertunda. Mengganti animasi `motion` pada `popover.tsx` dengan CSS keyframes (`k-popover-in`/`k-popover-out` via `data-state="open"`/`"closed"` di `index.css`), menghapus `useReducedMotion` dari `FeatureTip.tsx`, mengimpor `Slot` langsung dari `radix-ui` di `button.tsx`, dan menghapus `motion` serta `@radix-ui/react-slot` dari `package.json`; menerapkan `React.lazy` + `<Suspense fallback={<PageLoading />}>` di `App.tsx` untuk seluruh halaman route dan membungkus context `value` dengan `useMemo` di `AuthContext.tsx`, `TodayStatus.tsx`, dan `popover.tsx`; memecah `WinsPage.tsx` menjadi `WinCard.tsx`, `WorkTaskSlicer.tsx` (state input terisolasi), `RecoveryLockedView.tsx`, dan `constants.ts`; memindahkan helper napas ke `breathingPatterns.ts` & menghapus `BreathingPacer.tsx` (disesuaikan di `FocusRoom.tsx` & `CountdownTimer.test.tsx`); mengonsolidasikan `formatLongDate` ke `utils/date.ts`; menambahkan `sleepWithSignal` untuk menghormati `AbortSignal` saat retry `429` di `client.ts` (+ unit test); dan meng-gate tombol `Demo: Preset A / Preset B` dengan `import.meta.env.VITE_ENABLE_DEMO_PRESETS !== 'false'` di `CheckinPage.tsx` (+ `"vite/client"` di `tsconfig.app.json`). | `vite build` OK: entry JS turun dari `714.72 kB` (gzip `222.83 kB`, 2193 modul) → `336.74 kB` (gzip `107.36 kB`, 1769 modul, **-52.9% raw / -51.8% gzip**), total JS seluruh chunk `567.57 kB` (gzip `182.19 kB`, **-20.6% raw**), entry CSS `63.40 kB` → `47.64 kB` (warning >500 kB hilang); Vitest 13/13 files (48/48 tests) lulus; `docker compose up -d --build nginx` OK; Playwright E2E 3/3 passed (19.2s). |
