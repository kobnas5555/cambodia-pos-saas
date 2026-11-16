export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  sessionId: string;
  tokenTenantId: string | null;
  isPlatformAdmin: boolean;
}

export interface ActiveTenantContext {
  tenantId: string;
  tenantUserId: string;
  employeeId: string | null;
  permissions: Set<string>;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUserContext;
      tenant?: ActiveTenantContext;
    }
  }
}

export {};

