import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(255),
  password: z.string().min(1, 'Enter your password').max(128),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(1, 'Tell us your name').max(120, 'Keep it under 120 characters'),
  email: z.string().trim().email('Enter a valid email address').max(255),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(128, 'Keep it under 128 characters'),
  timezone: z.string().trim().min(1).max(64).default('Asia/Jakarta'),
  ai_consent: z.literal(true, {
    errorMap: () => ({
      message: 'Please agree to AI processing of your text to create an account.',
    }),
  }),
});

const likertItem = z
  .number()
  .int()
  .min(1, 'Pick a number from 1 to 4')
  .max(4, 'Pick a number from 1 to 4');

export const checkinSchema = z.object({
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'That date format looks off'),
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
  brain_dump: z.string().max(2000, 'Keep your brain dump under 2,000 characters'),
  fun_cope_input: z.string().max(200, 'Keep your answer under 200 characters'),
});

export const sliceTaskSchema = z.object({
  main_task: z
    .string()
    .trim()
    .min(1, 'Type the one task you want to break down')
    .max(300, 'Keep the task under 300 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type CheckinFormValues = z.infer<typeof checkinSchema>;
export type SliceTaskFormValues = z.infer<typeof sliceTaskSchema>;
