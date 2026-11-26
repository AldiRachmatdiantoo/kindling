import type { ApiErrorEnvelope, ApiSuccessEnvelope } from './types';

const API_BASE = '/api/v1';

const CSRF_EXEMPT_PATHS = new Set(['/auth/login', '/auth/register']);
const REFRESH_SKIP_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }
  const cookies = document.cookie.split(';');
  for (const part of cookies) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key === name) {
      return decodeURIComponent(trimmed.slice(eqIndex + 1));
    }
  }
  return null;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

let activeRefreshPromise: Promise<boolean> | null = null;

async function refreshSessionSingleFlight(): Promise<boolean> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const headers = new Headers();
      const csrfToken = getCookie('csrf_token');
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }

      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotent?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
  _retried?: boolean;
}

const RATE_LIMITED_MESSAGE =
  'Kindling is getting a lot of requests right now. Give it a few seconds, then try again.';

async function parseErrorResponse(response: Response): Promise<ApiError> {
  if (response.status === 429) {
    // Shown to people as-is, so it uses Kindling's voice instead of the server's.
    return new ApiError(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGE);
  }
  try {
    const json = (await response.json()) as Partial<ApiErrorEnvelope>;
    if (json && json.error) {
      return new ApiError(
        response.status,
        json.error.code || 'INTERNAL',
        json.error.message || 'Something went wrong on our side. Please try again.',
        json.error.details,
        json.meta?.request_id,
      );
    }
  } catch {
    // Non-JSON response body
  }
  return new ApiError(
    response.status,
    response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL',
    response.statusText || "That request didn't go through. Please try again.",
  );
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const idempotencyKey =
    options.idempotencyKey ?? (options.idempotent ? generateIdempotencyKey() : undefined);

  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const isMutating = method !== 'GET';
  if (isMutating && !CSRF_EXEMPT_PATHS.has(path)) {
    const csrfToken = getCookie('csrf_token');
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 401 && !options._retried && !REFRESH_SKIP_PATHS.has(path)) {
    const refreshed = await refreshSessionSingleFlight();
    if (refreshed) {
      return apiRequest<T>(path, {
        ...options,
        idempotencyKey,
        _retried: true,
      });
    }
    unauthorizedHandler?.();
    throw await parseErrorResponse(response);
  }

  // Too many requests: when the server says the wait is short, wait it out and try a read
  // once more instead of failing the page. Respects AbortSignal so unmounted callers cancel cleanly.
  if (response.status === 429 && method === 'GET' && !options._retried) {
    const waitSecs = Number(response.headers.get('Retry-After') ?? '1');
    if (Number.isFinite(waitSecs) && waitSecs <= 3) {
      await sleepWithSignal(Math.max(0.5, waitSecs) * 1000, options.signal);
      return apiRequest<T>(path, { ...options, idempotencyKey, _retried: true });
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const envelope = (await response.json()) as ApiSuccessEnvelope<T>;
  return envelope.data;
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'),
    );
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function _resetRefreshPromiseForTests(): void {
  activeRefreshPromise = null;
}
