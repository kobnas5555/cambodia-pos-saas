import {
  DEFAULT_USD_TO_KHR_RATE,
  PERMISSION_DEFINITIONS,
  slugifyBusinessName,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshTokenInput,
  type RegisterBusinessInput,
  type ResetPasswordInput,
} from '@cambodia-pos/shared';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/AppError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../common/utils/jwt';
import { hashPassword, verifyPassword } from '../../common/utils/password';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/utils/tokens';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';

export interface RequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function ensurePermissionsExist(tx: Prisma.TransactionClient) {
  const existing = await tx.permission.findMany({ select: { id: true, code: true } });
  const existingCodes = new Set(existing.map((p) => p.code));
  const missing = PERMISSION_DEFINITIONS.filter((p) => !existingCodes.has(p.code));

  if (missing.length > 0) {
    await tx.permission.createMany({
      data: missing.map((p) => ({
        code: p.code,
        module: p.module,
        description: p.description,
      })),
      skipDuplicates: true,
    });
  }

  return tx.permission.findMany({ select: { id: true, code: true } });
}

async function resolveUniqueTenantSlug(
  tx: Prisma.TransactionClient,
  businessName: string,
  explicitSlug?: string,
): Promise<string> {
  if (explicitSlug) {
    const taken = await tx.tenant.findUnique({ where: { slug: explicitSlug } });
    if (taken) {
      throw AppError.conflict('Workspace slug is already in use', 'SLUG_TAKEN');
    }
    return explicitSlug;
  }

  const base = slugifyBusinessName(businessName);
  const existing = await tx.tenant.findUnique({ where: { slug: base } });
  if (!existing) {
    return base;
  }

  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${base}-${i}`;
    const conflict = await tx.tenant.findUnique({ where: { slug: candidate } });
    if (!conflict) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}

async function buildUserWorkspaceContext(userId: string, preferredTenantId?: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  const memberships = await prisma.tenantUser.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      tenant: { status: 'ACTIVE' },
    },
    include: {
      tenant: {
        include: {
          branches: {
            where: { status: 'ACTIVE' },
            orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          },
          exchangeRates: {
            where: { baseCurrency: 'USD', targetCurrency: 'KHR' },
            orderBy: { effectiveAt: 'desc' },
            take: 1,
          },
        },
      },
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: { select: { code: true } },
                },
              },
            },
          },
        },
      },
      employees: {
        where: { status: 'ACTIVE' },
        take: 1,
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const tenants = memberships.map((m) => {
    const permissionSet = new Set<string>();
    const roles = m.userRoles.map((ur) => {
      for (const rp of ur.role.rolePermissions) {
        permissionSet.add(rp.permission.code);
      }
      return { id: ur.role.id, name: ur.role.name };
    });

    return {
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      businessType: m.tenant.businessType,
      email: m.tenant.email,
      phone: m.tenant.phone,
      address: m.tenant.address,
      logoUrl: m.tenant.logoUrl,
      defaultCurrency: m.tenant.defaultCurrency,
      defaultLanguage: m.tenant.defaultLanguage,
      timezone: m.tenant.timezone,
      status: m.tenant.status,
      exchangeRateUsdToKhr: m.tenant.exchangeRates[0]?.rate?.toString() ?? DEFAULT_USD_TO_KHR_RATE,
      roles,
      permissions: Array.from(permissionSet),
      employee: m.employees[0] ?? null,
      branches: m.tenant.branches,
    };
  });

  const activeTenant =
    (preferredTenantId ? tenants.find((t) => t.id === preferredTenantId) : undefined) ??
    tenants[0] ??
    null;

  return { user, activeTenant, tenants };
}

export async function registerBusiness(input: RegisterBusinessInput, meta: RequestMetadata) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  const created = await prisma.$transaction(async (tx) => {
    const slug = await resolveUniqueTenantSlug(tx, input.businessName, input.businessSlug);
    const permissions = await ensurePermissionsExist(tx);

    const user = await tx.user.create({
      data: {
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        lastLoginAt: new Date(),
        status: 'ACTIVE',
      },
    });

    const tenant = await tx.tenant.create({
      data: {
        name: input.businessName,
        slug,
        businessType: input.businessType,
        email: input.email,
        phone: input.phone,
        address: input.branchAddress ?? null,
        defaultCurrency: input.defaultCurrency,
        defaultLanguage: input.defaultLanguage,
        timezone: 'Asia/Phnom_Penh',
        status: 'ACTIVE',
      },
    });

    const mainBranch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: input.mainBranchName,
        branchCode: input.mainBranchCode,
        phone: input.phone,
        address: input.branchAddress ?? null,
        isMain: true,
        status: 'ACTIVE',
      },
    });

    const tenantUser = await tx.tenantUser.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        status: 'ACTIVE',
      },
    });

    const ownerRole = await tx.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Business Owner',
        description: 'Full access to all business modules and settings',
        isSystem: true,
      },
    });

    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: ownerRole.id,
          permissionId: p.id,
        })),
      });
    }

    await tx.userRole.create({
      data: {
        tenantUserId: tenantUser.id,
        roleId: ownerRole.id,
      },
    });

    const employee = await tx.employee.create({
      data: {
        tenantId: tenant.id,
        tenantUserId: tenantUser.id,
        employeeCode: 'EMP-001',
        name: input.ownerName,
        phone: input.phone,
        email: input.email,
        position: 'Business Owner',
        hireDate: new Date(),
        status: 'ACTIVE',
      },
    });

    await tx.employeeBranchAccess.create({
      data: {
        employeeId: employee.id,
        branchId: mainBranch.id,
      },
    });

    await tx.exchangeRate.create({
      data: {
        tenantId: tenant.id,
        baseCurrency: 'USD',
        targetCurrency: 'KHR',
        rate: DEFAULT_USD_TO_KHR_RATE,
      },
    });

    const session = await tx.userSession.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        refreshTokenHash: 'pending',
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    const refreshToken = signRefreshToken({ sub: user.id, sessionId: session.id });
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      sessionId: session.id,
      tenantId: tenant.id,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    await tx.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashOpaqueToken(refreshToken) },
    });

    await recordActivity(
      {
        tenantId: tenant.id,
        userId: user.id,
        employeeId: employee.id,
        action: 'tenant.registered',
        module: 'auth',
        recordType: 'Tenant',
        recordId: tenant.id,
        newValues: {
          businessName: tenant.name,
          slug: tenant.slug,
          mainBranchCode: mainBranch.branchCode,
        },
        ipAddress: meta.ipAddress,
      },
      tx,
    );

    return {
      userId: user.id,
      tenantId: tenant.id,
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  });

  const context = await buildUserWorkspaceContext(created.userId, created.tenantId);

  return {
    ...context,
    tokens: {
      accessToken: created.accessToken,
      refreshToken: created.refreshToken,
      sessionId: created.sessionId,
    },
  };
}

export async function loginUser(input: LoginInput, meta: RequestMetadata) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('Your account has been deactivated', 'USER_INACTIVE');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const context = await buildUserWorkspaceContext(user.id);
  if (!user.isPlatformAdmin && context.tenants.length === 0) {
    throw AppError.forbidden(
      'Your account or workspace access has been deactivated',
      'USER_INACTIVE',
    );
  }

  let targetTenant = context.activeTenant;

  if (input.tenantSlug) {
    const matched = context.tenants.find((t) => t.slug === input.tenantSlug);
    if (!matched) {
      throw AppError.forbidden('You do not belong to that business workspace', 'TENANT_ACCESS_DENIED');
    }
    targetTenant = matched;
  }

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      tenantId: targetTenant?.id ?? null,
      refreshTokenHash: 'pending',
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  const refreshToken = signRefreshToken({ sub: user.id, sessionId: session.id });
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    sessionId: session.id,
    tenantId: targetTenant?.id ?? null,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  await prisma.$transaction([
    prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashOpaqueToken(refreshToken) },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  if (targetTenant?.id) {
    await recordActivity({
      tenantId: targetTenant.id,
      userId: user.id,
      action: 'user.login',
      module: 'auth',
      recordType: 'User',
      recordId: user.id,
      newValues: { email: user.email },
      ipAddress: meta.ipAddress,
    });
  }

  return {
    user: context.user,
    activeTenant: targetTenant,
    tenants: context.tenants,
    tokens: {
      accessToken,
      refreshToken,
      sessionId: session.id,
    },
  };
}

export async function refreshAccessToken(input: RefreshTokenInput) {
  let payload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const session = await prisma.userSession.findUnique({
    where: { id: payload.sessionId },
    include: {
      user: {
        select: { id: true, email: true, status: true, isPlatformAdmin: true },
      },
    },
  });

  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date() ||
    session.refreshTokenHash !== hashOpaqueToken(input.refreshToken)
  ) {
    throw AppError.unauthorized('Refresh session is no longer valid', 'SESSION_REVOKED');
  }

  if (session.user.status !== 'ACTIVE') {
    throw AppError.forbidden('User account is inactive', 'USER_INACTIVE');
  }

  const newRefreshToken = signRefreshToken({ sub: session.user.id, sessionId: session.id });
  const newAccessToken = signAccessToken({
    sub: session.user.id,
    email: session.user.email,
    sessionId: session.id,
    tenantId: session.tenantId,
    isPlatformAdmin: session.user.isPlatformAdmin,
  });

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashOpaqueToken(newRefreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    sessionId: session.id,
  };
}

export async function logoutSession(sessionId: string) {
  await prisma.userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listUserSessions(userId: string, currentSessionId: string) {
  const sessions = await prisma.userSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tenantId: true,
      ipAddress: true,
      userAgent: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return sessions.map((s) => ({
    ...s,
    isCurrent: s.id === currentSessionId,
  }));
}

export async function revokeUserSession(userId: string, targetSessionId: string) {
  const session = await prisma.userSession.findUnique({
    where: { id: targetSessionId },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!session || session.userId !== userId) {
    throw AppError.notFound('Session not found', 'SESSION_NOT_FOUND');
  }

  if (!session.revokedAt) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.status !== 'ACTIVE') {
    return {
      message: 'If an account exists for that email, a password reset token has been generated.',
    };
  }

  const rawToken = generateOpaqueToken(24);
  const tokenHash = hashOpaqueToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  return {
    message: 'If an account exists for that email, a password reset token has been generated.',
    ...(env.NODE_ENV !== 'production' ? { devResetToken: rawToken } : {}),
  };
}

export async function resetUserPassword(input: ResetPasswordInput) {
  const tokenHash = hashOpaqueToken(input.token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt !== null || record.expiresAt <= new Date()) {
    throw AppError.badRequest('Invalid or expired password reset token', 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.userSession.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  const memberships = await prisma.tenantUser.findMany({
    where: { userId: record.userId, status: 'ACTIVE' },
    select: { tenantId: true },
  });
  for (const m of memberships) {
    await recordActivity({
      tenantId: m.tenantId,
      userId: record.userId,
      action: 'user.password_reset',
      module: 'auth',
      recordType: 'User',
      recordId: record.userId,
    });
  }
}

export async function getAuthenticatedProfile(userId: string, activeTenantId?: string | null) {
  return buildUserWorkspaceContext(userId, activeTenantId);
}

export async function switchActiveTenant(
  userId: string,
  sessionId: string,
  tenantId: string,
) {
  const membership = await prisma.tenantUser.findUnique({
    where: {
      tenantId_userId: { tenantId, userId },
    },
    include: {
      tenant: { select: { id: true, status: true } },
      user: { select: { id: true, email: true, isPlatformAdmin: true } },
    },
  });

  if (!membership || membership.status !== 'ACTIVE' || membership.tenant.status !== 'ACTIVE') {
    throw AppError.forbidden('You do not have access to the requested business workspace', 'TENANT_ACCESS_DENIED');
  }

  await prisma.userSession.update({
    where: { id: sessionId },
    data: { tenantId },
  });

  const accessToken = signAccessToken({
    sub: membership.user.id,
    email: membership.user.email,
    sessionId,
    tenantId,
    isPlatformAdmin: membership.user.isPlatformAdmin,
  });

  const context = await buildUserWorkspaceContext(userId, tenantId);

  return {
    ...context,
    accessToken,
  };
}

