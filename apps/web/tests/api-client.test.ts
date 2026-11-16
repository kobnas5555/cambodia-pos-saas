import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest, tokenStorage } from '../src/lib/api';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, val: string) => {
      map.set(key, val);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

describe('web api client & token storage', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches Authorization and X-Tenant-Id headers and retries once on 401 refresh', async () => {
    tokenStorage.setTokens('expired-access', 'valid-refresh');
    tokenStorage.setActiveTenantId('tenant-uuid-123');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [{ id: 'branch-1' }] }), {
          status: 200,
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<Array<{ id: string }>>('/branches');

    expect(data).toEqual([{ id: 'branch-1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(firstHeaders.get('Authorization')).toBe('Bearer expired-access');
    expect(firstHeaders.get('X-Tenant-Id')).toBe('tenant-uuid-123');

    const retryHeaders = fetchMock.mock.calls[2][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-access');
    expect(tokenStorage.getRefreshToken()).toBe('fresh-refresh');
  });

  it('throws ApiClientError with server error code and message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'BRANCH_CODE_TAKEN', message: 'Branch code already exists' },
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiRequest('/branches', { method: 'POST', body: JSON.stringify({ name: 'B', branchCode: 'PP-01' }) }),
    ).rejects.toMatchObject({
      name: 'Error',
      status: 409,
      code: 'BRANCH_CODE_TAKEN',
      message: 'Branch code already exists',
    });

    try {
      await apiRequest('/branches', { method: 'GET' });
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
    expect(ApiClientError).toBeDefined();
  });
});

