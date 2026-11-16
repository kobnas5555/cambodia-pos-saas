import {
  DEFAULT_USD_TO_KHR_RATE,
  slugifyBusinessName,
  type CreateTenantInput,
  type UpdateTenantInput,
} from '@cambodia-pos/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/AppError';
import { signAccessToken } from '../../common/utils/jwt';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import { ensurePermissionsExist, getAuthenticatedProfile } from '../auth/auth.service';

export interface ActorInfo {
  userId: string;
  employeeId?: string | null;
  ipAddress?: string | null;
}

async function resolveAdditionalTenantSlug(
  tx: Prisma.TransactionClient,
  businessName: string,
  explicitSlug?: string,
) {
  if (explicitSlug) {
    const taken = await tx.tenant.findUnique({ where: { slug: explicitSlug } });
    if (taken) {
      throw AppError.conflict('Workspace slug is already in use', 'SLUG_TAKEN');
    }
    return explicitSlug;
  }

  const base = slugifyBusinessName(businessName);
  const existing = await tx.tenant.findUnique({ where: { slug: base } });
  if (!existing) return base;

  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${base}-${i}`;
    const conflict = await tx.tenant.findUnique({ where: { slug: candidate } });
    if (!conflict) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export async function getCurrentTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      exchangeRates: {
        where: { baseCurrency: 'USD', targetCurrency: 'KHR' },
        orderBy: { effectiveAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          branches: true,
          employees: true,
          tenantUsers: true,
        },
      },
    },
  });

  if (!tenant) {
    throw AppError.notFound('Business workspace not found', 'TENANT_NOT_FOUND');
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    businessType: tenant.businessType,
    email: tenant.email,
    phone: tenant.phone,
    address: tenant.address,
    logoUrl: tenant.logoUrl,
    defaultCurrency: tenant.defaultCurrency,
    defaultLanguage: tenant.defaultLanguage,
    timezone: tenant.timezone,
    status: tenant.status,
    exchangeRateUsdToKhr: tenant.exchangeRates[0]?.rate?.toString() ?? DEFAULT_USD_TO_KHR_RATE,
    counts: tenant._count,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export async function updateCurrentTenant(
  tenantId: string,
  actor: ActorInfo,
  input: UpdateTenantInput,
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) {
    throw AppError.notFound('Business workspace not found', 'TENANT_NOT_FOUND');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency } : {}),
        ...(input.defaultLanguage !== undefined ? { defaultLanguage: input.defaultLanguage } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'tenant.updated',
        module: 'tenants',
        recordType: 'Tenant',
        recordId: tenantId,
        oldValues: {
          name: existing.name,
          businessType: existing.businessType,
          defaultCurrency: existing.defaultCurrency,
          defaultLanguage: existing.defaultLanguage,
          timezone: existing.timezone,
        },
        newValues: input,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return tenant;
  });

  return getCurrentTenant(updated.id);
}

export async function createAdditionalTenant(
  userId: string,
  sessionId: string,
  input: CreateTenantInput,
  ipAddress?: string | null,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw AppError.unauthorized();
  }

  const createdTenantId = await prisma.$transaction(async (tx) => {
    const slug = await resolveAdditionalTenantSlug(tx, input.businessName, input.businessSlug);
    const permissions = await ensurePermissionsExist(tx);

    const tenant = await tx.tenant.create({
      data: {
        name: input.businessName,
        slug,
        businessType: input.businessType,
        email: input.email ?? user.email,
        phone: input.phone ?? user.phone,
        address: input.address ?? null,
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
        phone: input.phone ?? user.phone,
        address: input.address ?? null,
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
        name: user.name,
        phone: user.phone,
        email: user.email,
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

    await tx.userSession.update({
      where: { id: sessionId },
      data: { tenantId: tenant.id },
    });

    await recordActivity(
      {
        tenantId: tenant.id,
        userId: user.id,
        employeeId: employee.id,
        action: 'tenant.created',
        module: 'tenants',
        recordType: 'Tenant',
        recordId: tenant.id,
        newValues: { name: tenant.name, slug: tenant.slug },
        ipAddress,
      },
      tx,
    );

    return tenant.id;
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    sessionId,
    tenantId: createdTenantId,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  const profile = await getAuthenticatedProfile(user.id, createdTenantId);
  return {
    ...profile,
    accessToken,
  };
}

