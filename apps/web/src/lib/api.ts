const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const ACCESS_TOKEN_KEY = 'cambodia_pos_access_token';
const REFRESH_TOKEN_KEY = 'cambodia_pos_refresh_token';
const ACTIVE_TENANT_KEY = 'cambodia_pos_active_tenant_id';
const ACTIVE_BRANCH_KEY = 'cambodia_pos_active_branch_id';

export interface BranchSummary {
  id: string;
  tenantId: string;
  name: string;
  branchCode: string;
  phone: string | null;
  address: string | null;
  isMain: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface TenantWorkspace {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl?: string | null;
  defaultCurrency: 'USD' | 'KHR';
  defaultLanguage: 'en' | 'km';
  timezone: string;
  status: string;
  exchangeRateUsdToKhr: string;
  roles: Array<{ id: string; name: string }>;
  permissions: string[];
  employee: { id: string; employeeCode: string; name: string } | null;
  branches: BranchSummary[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  isPlatformAdmin: boolean;
  lastLoginAt: string | null;
}

export interface AuthPayload {
  user: AuthUser;
  activeTenant: TenantWorkspace | null;
  tenants: TenantWorkspace[];
  tokens?: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  };
  accessToken?: string;
}

export interface UserSessionInfo {
  id: string;
  tenantId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  module: string;
  recordType: string;
  recordId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  employee?: { id: string; name: string; employeeCode: string; position?: string | null } | null;
}

export interface ActivityLogStats {
  totalLogs: number;
  uniqueUsers: number;
  statusTransitions: number;
  topModules: { module: string; count: number }[];
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStorage = {
  getAccessToken: () =>
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null,
  getRefreshToken: () =>
    typeof window !== 'undefined' ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null,
  getActiveTenantId: () =>
    typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_TENANT_KEY) : null,
  getActiveBranchId: () =>
    typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_BRANCH_KEY) : null,
  setTokens: (accessToken: string, refreshToken?: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  },
  setActiveTenantId: (tenantId: string | null) => {
    if (typeof window === 'undefined') return;
    if (tenantId) window.localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    else window.localStorage.removeItem(ACTIVE_TENANT_KEY);
  },
  setActiveBranchId: (branchId: string | null) => {
    if (typeof window === 'undefined') return;
    if (branchId) window.localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
    else window.localStorage.removeItem(ACTIVE_BRANCH_KEY);
  },
  clear: () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(ACTIVE_TENANT_KEY);
    window.localStorage.removeItem(ACTIVE_BRANCH_KEY);
  },
};

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          tokenStorage.clear();
          return null;
        }
        const json = await res.json();
        const nextAccess = json?.data?.accessToken as string | undefined;
        const nextRefresh = json?.data?.refreshToken as string | undefined;
        if (!nextAccess) return null;
        tokenStorage.setTokens(nextAccess, nextRefresh);
        return nextAccess;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; retryOn401?: boolean } = {},
): Promise<T> {
  const { skipAuth = false, retryOn401 = true, headers: customHeaders, ...rest } = options;

  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = tokenStorage.getAccessToken();
    const tenantId = tokenStorage.getActiveTenantId();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (tenantId) headers.set('X-Tenant-Id', tenantId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
  });

  if (response.status === 401 && !skipAuth && retryOn401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retryOn401: false });
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    const err = payload?.error;
    throw new ApiClientError(
      response.status,
      err?.code || 'REQUEST_FAILED',
      err?.message || `Request failed with status ${response.status}`,
      err?.details,
    );
  }

  return payload.data as T;
}

export const api = {
  get: <T = any>(path: string, options?: { params?: Record<string, any> }) => {
    let url = path;
    if (options?.params) {
      const q = new URLSearchParams();
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
      });
      if (q.toString()) url += `?${q.toString()}`;
    }
    return apiRequest<T>(url, { method: 'GET' }).then((data) => ({ data }));
  },
  post: <T = any>(path: string, body?: any) =>
    apiRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }).then((data) => ({ data })),
  put: <T = any>(path: string, body?: any) =>
    apiRequest<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }).then((data) => ({ data })),
  delete: <T = any>(path: string) =>
    apiRequest<T>(path, { method: 'DELETE' }).then((data) => ({ data })),
};


