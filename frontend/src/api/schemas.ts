import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Masukkan alamat email yang valid').max(255),
  password: z.string().min(1, 'Kata sandi wajib diisi').max(128),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(1, 'Nama lengkap wajib diisi').max(120, 'Maksimal 120 karakter'),
  email: z.string().trim().email('Masukkan alamat email yang valid').max(255),
  password: z
    .string()
    .min(10, 'Kata sandi minimal 10 karakter')
    .max(128, 'Kata sandi maksimal 128 karakter'),
  timezone: z.string().trim().min(1).max(64).default('Asia/Jakarta'),
  ai_consent: z.literal(true, {
    errorMap: () => ({ message: 'Kamu perlu menyetujui pemrosesan teks oleh AI untuk mendaftar.' }),
  }),
});

const likertItem = z.number().int().min(1, 'Pilih skala 1–4').max(4, 'Pilih skala 1–4');

export const checkinSchema = z.object({
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid'),
  answers: z.object({
    cbi_1: likertItem,
    cbi_2: likertItem,
    cbi_3: likertItem,
    olbi_ex_1: likertItem,
    olbi_ex_2: likertItem,
    olbi_dis_1: likertItem,
    olbi_dis_2: likertItem,
    who5_1: likertItem,
    who5_2: likertItem,
  }),
  brain_dump: z.string().max(2000, 'Brain dump maksimal 2.000 karakter'),
  fun_cope_input: z.string().max(200, 'Jawaban maksimal 200 karakter'),
});

export const sliceTaskSchema = z.object({
  main_task: z
    .string()
    .trim()
    .min(1, 'Masukkan 1 tugas yang ingin dipecah')
    .max(300, 'Tugas maksimal 300 karakter'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type CheckinFormValues = z.infer<typeof checkinSchema>;
export type SliceTaskFormValues = z.infer<typeof sliceTaskSchema>;
