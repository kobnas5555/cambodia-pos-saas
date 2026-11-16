import type { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';

export async function resolveActorEmployeeId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  preferredEmployeeId?: string | null,
): Promise<string> {
  if (preferredEmployeeId) {
    return preferredEmployeeId;
  }

  const tenantUser = await tx.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: {
      employees: { where: { status: 'ACTIVE' }, take: 1 },
    },
  });

  if (tenantUser?.employees[0]) {
    return tenantUser.employees[0].id;
  }

  const fallback = await tx.employee.findFirst({
    where: { tenantId, status: 'ACTIVE' },
  });

  if (!fallback) {
    throw AppError.badRequest(
      'An active employee profile is required to perform this transaction',
      'EMPLOYEE_PROFILE_REQUIRED',
    );
  }

  return fallback.id;
}

export async function getTenantDefaultExchangeRate(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const latest = await tx.exchangeRate.findFirst({
    where: { tenantId, baseCurrency: 'USD', targetCurrency: 'KHR' },
    orderBy: { effectiveAt: 'desc' },
  });
  return latest?.rate?.toString() ?? '4100.000000';
}

