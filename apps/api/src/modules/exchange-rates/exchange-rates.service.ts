import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function getExchangeRateById(tenantId: string, id: string) {
  const row = await prisma.exchangeRate.findFirst({
    where: { id, tenantId },
  });
  if (!row) throw AppError.notFound('Exchange rate record not found', 'EXCHANGE_RATE_NOT_FOUND');
  return {
    ...row,
    rate: row.rate.toString(),
  };
}

export async function listExchangeRates(
  tenantId: string,
  options?: {
    baseCurrency?: string;
    targetCurrency?: string;
    page?: number;
    limit?: number;
  },
) {
  const page = Number(options?.page) > 0 ? Number(options?.page) : 1;
  const limit = options?.limit !== undefined ? Number(options?.limit) : 50;

  const where: any = {
    tenantId,
    ...(options?.baseCurrency && options.baseCurrency !== 'ALL' ? { baseCurrency: options.baseCurrency } : {}),
    ...(options?.targetCurrency && options.targetCurrency !== 'ALL' ? { targetCurrency: options.targetCurrency } : {}),
  };

  const total = await prisma.exchangeRate.count({ where });

  const rows = await prisma.exchangeRate.findMany({
    where,
    orderBy: { effectiveAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const items = rows.map((r) => ({
    ...r,
    rate: r.rate.toString(),
  }));

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getLatestExchangeRate(tenantId: string, baseCurrency: string, targetCurrency: string) {
  const row = await prisma.exchangeRate.findFirst({
    where: { tenantId, baseCurrency, targetCurrency },
    orderBy: { effectiveAt: 'desc' },
  });
  if (!row) return null;
  return {
    ...row,
    rate: row.rate.toString(),
  };
}

export async function createExchangeRate(
  tenantId: string,
  actor: ActorInfo,
  input: { baseCurrency: string; targetCurrency: string; rate: string },
) {
  return prisma.$transaction(async (tx) => {
    const rateRecord = await tx.exchangeRate.create({
      data: {
        tenantId,
        baseCurrency: input.baseCurrency,
        targetCurrency: input.targetCurrency,
        rate: input.rate,
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'exchange_rate.updated',
        module: 'settings',
        recordType: 'ExchangeRate',
        recordId: rateRecord.id,
        newValues: input,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      ...rateRecord,
      rate: rateRecord.rate.toString(),
    };
  });
}

