'use client';

import type {
  CreateTenantInput,
  LoginInput,
  RegisterBusinessInput,
} from '@cambodia-pos/shared';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  tokenStorage,
  type AuthPayload,
  type AuthUser,
  type BranchSummary,
  type TenantWorkspace,
} from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  activeTenant: TenantWorkspace | null;
  tenants: TenantWorkspace[];
  activeBranch: BranchSummary | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  registerBusiness: (input: RegisterBusinessInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  selectBranch: (branchId: string) => void;
  createAdditionalBusiness: (input: CreateTenantInput) => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function pickDefaultBranch(tenant: TenantWorkspace | null): BranchSummary | null {
  if (!tenant || tenant.branches.length === 0) return null;
  const savedBranchId = tokenStorage.getActiveBranchId();
  const saved = savedBranchId
    ? tenant.branches.find((b) => b.id === savedBranchId && b.status === 'ACTIVE')
    : undefined;
  return saved ?? tenant.branches.find((b) => b.isMain) ?? tenant.branches[0];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTenant, setActiveTenant] = useState<TenantWorkspace | null>(null);
  const [tenants, setTenants] = useState<TenantWorkspace[]>([]);
  const [activeBranch, setActiveBranch] = useState<BranchSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthState = useCallback((data: AuthPayload) => {
    setUser(data.user);
    setActiveTenant(data.activeTenant);
    setTenants(data.tenants);

    if (data.tokens) {
      tokenStorage.setTokens(data.tokens.accessToken, data.tokens.refreshToken);
    } else if (data.accessToken) {
      tokenStorage.setTokens(data.accessToken);
    }

    tokenStorage.setActiveTenantId(data.activeTenant?.id ?? null);
    const branch = pickDefaultBranch(data.activeTenant);
    setActiveBranch(branch);
    tokenStorage.setActiveBranchId(branch?.id ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      setUser(null);
      setActiveTenant(null);
      setTenants([]);
      setActiveBranch(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await apiRequest<AuthPayload>('/auth/me');
      applyAuthState(data);
    } catch {
      tokenStorage.clear();
      setUser(null);
      setActiveTenant(null);
      setTenants([]);
      setActiveBranch(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyAuthState]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const login = async (input: LoginInput) => {
    const data = await apiRequest<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    applyAuthState(data);
  };

  const registerBusiness = async (input: RegisterBusinessInput) => {
    const data = await apiRequest<AuthPayload>('/auth/register-business', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    applyAuthState(data);
  };

  const logout = async () => {
    try {
      if (tokenStorage.getAccessToken()) {
        await apiRequest('/auth/logout', { method: 'POST', retryOn401: false });
      }
    } catch {
      // Ignore logout network failures and clear local credentials
    } finally {
      tokenStorage.clear();
      setUser(null);
      setActiveTenant(null);
      setTenants([]);
      setActiveBranch(null);
    }
  };

  const switchTenant = async (tenantId: string) => {
    const data = await apiRequest<AuthPayload>('/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
    applyAuthState(data);
  };

  const selectBranch = (branchId: string) => {
    if (!activeTenant) return;
    const found = activeTenant.branches.find((b) => b.id === branchId);
    if (found) {
      setActiveBranch(found);
      tokenStorage.setActiveBranchId(found.id);
    }
  };

  const createAdditionalBusiness = async (input: CreateTenantInput) => {
    const data = await apiRequest<AuthPayload>('/tenants', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    applyAuthState(data);
  };

  const hasPermission = useCallback(
    (code: string) => Boolean(activeTenant?.permissions.includes(code)),
    [activeTenant],
  );

  const hasAnyPermission = useCallback(
    (codes: string[]) =>
      codes.length === 0 || codes.some((code) => Boolean(activeTenant?.permissions.includes(code))),
    [activeTenant],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        activeTenant,
        tenants,
        activeBranch,
        isLoading,
        login,
        registerBusiness,
        logout,
        refreshProfile,
        switchTenant,
        selectBranch,
        createAdditionalBusiness,
        hasPermission,
        hasAnyPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

