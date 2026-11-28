import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRefreshPromiseForTests,
  ApiError,
  apiRequest,
  setUnauthorizedHandler,
} from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest wrapper', () => {
  beforeEach(() => {
    _resetRefreshPromiseForTests();
    setUnauthorizedHandler(null);
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
  });

  it('sends credentials: include and attaches X-CSRF-Token & Idempotency-Key on mutating idempotent requests', async () => {
    document.cookie = 'csrf_token=csrf-abc-123; path=/';

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { ok: true },
        meta: { request_id: 'req-1' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<{ ok: boolean }>('/checkin', {
      method: 'POST',
      body: { log_date: '2026-11-26' },
      idempotent: true,
    });

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/checkin');
    expect(init.credentials).toBe('include');

    const headers = new Headers(init.headers);
    expect(headers.get('X-CSRF-Token')).toBe('csrf-abc-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('does not attach X-CSRF-Token on GET or /auth/login requests', async () => {
    document.cookie = 'csrf_token=csrf-xyz; path=/';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { user: { id: '1' } }, meta: { request_id: 'r1' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { user: { id: '1' } }, meta: { request_id: 'r2' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/auth/me', { method: 'GET' });
    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'pw' } });

    const getHeaders = new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);
    const loginHeaders = new Headers((fetchMock.mock.calls[1] as [string, RequestInit])[1].headers);
    expect(getHeaders.get('X-CSRF-Token')).toBeNull();
    expect(loginHeaders.get('X-CSRF-Token')).toBeNull();
  });

  it('coalesces concurrent 401 responses into a single /auth/refresh call and retries each request once with updated CSRF & same Idempotency-Key', async () => {
    document.cookie = 'csrf_token=old-csrf; path=/';

    let refreshCallCount = 0;
    const seenPostIdemKeys: string[] = [];
    const seenPostCsrf: string[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);

      if (url === '/api/v1/auth/refresh') {
        refreshCallCount += 1;
        expect(headers.get('X-CSRF-Token')).toBe('old-csrf');
        // Simulate server rotating csrf_token cookie
        await Promise.resolve();
        document.cookie = 'csrf_token=new-csrf; path=/';
        return jsonResponse({
          success: true,
          data: { refreshed: true },
          meta: { request_id: 'ref-1' },
        });
      }

      if (url === '/api/v1/wins/2026-11-26/recalibrate') {
        seenPostIdemKeys.push(headers.get('Idempotency-Key') || '');
        seenPostCsrf.push(headers.get('X-CSRF-Token') || '');
        if (seenPostIdemKeys.length === 1) {
          return jsonResponse(
            {
              success: false,
              error: { code: 'UNAUTHENTICATED', message: 'Expired' },
              meta: { request_id: 'e1' },
            },
            401,
          );
        }
        return jsonResponse({
          success: true,
          data: { pillar: 'work', new_title: 'Tiny step', level: 1 },
          meta: { request_id: 'ok-1' },
        });
      }

      if (url === '/api/v1/profile/heatmap') {
        const isFirst = refreshCallCount === 0;
        if (isFirst) {
          return jsonResponse(
            {
              success: false,
              error: { code: 'UNAUTHENTICATED', message: 'Expired' },
              meta: { request_id: 'e2' },
            },
            401,
          );
        }
        return jsonResponse({
          success: true,
          data: { days: [] },
          meta: { request_id: 'ok-2' },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const [recalResult, heatmapResult] = await Promise.all([
      apiRequest<{ level: number }>('/wins/2026-11-26/recalibrate', {
        method: 'POST',
        body: { pillar: 'work' },
        idempotent: true,
      }),
      apiRequest<{ days: unknown[] }>('/profile/heatmap', { method: 'GET' }),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(recalResult.level).toBe(1);
    expect(heatmapResult.days).toEqual([]);
    expect(seenPostIdemKeys).toHaveLength(2);
    expect(seenPostIdemKeys[0]).toBe(seenPostIdemKeys[1]);
    expect(seenPostCsrf).toEqual(['old-csrf', 'new-csrf']);
  });

  it('calls unauthorizedHandler and throws ApiError when refresh fails (no infinite retry)', async () => {
    document.cookie = 'csrf_token=stale-csrf; path=/';
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/auth/refresh') {
        return jsonResponse(
          { success: false, error: { code: 'UNAUTHENTICATED', message: 'Refresh expired' } },
          401,
        );
      }
      return jsonResponse(
        { success: false, error: { code: 'UNAUTHENTICATED', message: 'Access expired' } },
        401,
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/checkin/today')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + 1 refresh attempt
  });

  it('skips /auth/refresh for a guest with no csrf_token cookie, since the server would answer 403', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in first' } },
        401,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/v1/auth/me');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
  it('waits out a short 429 on a read and retries it once, without signing anyone out', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const busy = new Response(
      JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Slow down' } }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '1' } },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest<{ ok: boolean }>('/profile/heatmap')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does not wait on a long 429 and surfaces it as an ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'x' } }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '45' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/profile/heatmap')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the 429 retry sleep immediately when options.signal aborts', async () => {
    const controller = new AbortController();
    const busy = new Response(
      JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Slow down' } }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3' } },
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(busy);
    vi.stubGlobal('fetch', fetchMock);

    const pending = apiRequest('/profile/heatmap', { signal: controller.signal });
    // Yield a microtask so fetch resolves and the 429 sleep starts, then abort.
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
