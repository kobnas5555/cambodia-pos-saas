import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface RecordActivityParams {
  tenantId?: string | null;
  userId: string;
  employeeId?: string | null;
  action: string;
  module: string;
  recordType: string;
  recordId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
}

export async function recordActivity(
  params: RecordActivityParams,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  return client.activityLog.create({
    data: {
      tenantId: params.tenantId ?? null,
      userId: params.userId,
      employeeId: params.employeeId ?? null,
      action: params.action,
      module: params.module,
      recordType: params.recordType,
      recordId: params.recordId ?? null,
      oldValues: params.oldValues !== undefined ? (params.oldValues as Prisma.InputJsonValue) : undefined,
      newValues: params.newValues !== undefined ? (params.newValues as Prisma.InputJsonValue) : undefined,
      ipAddress: params.ipAddress ?? null,
    },
  });
}

export interface ListActivityLogsFilter {
  module?: string;
  action?: string;
  recordType?: string;
  userId?: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number | string;
  limit?: number | string;
}

export async function listTenantActivityLogs(
  tenantId: string,
  filter?: ListActivityLogsFilter,
) {
  const limit = Math.min(Math.max(Number(filter?.limit) || 50, 1), 100);
  const page = Math.max(Number(filter?.page) || 1, 1);
  const skip = (page - 1) * limit;

  const where: Prisma.ActivityLogWhereInput = {
    tenantId,
    ...(filter?.module ? { module: filter.module } : {}),
    ...(filter?.action ? { action: filter.action } : {}),
    ...(filter?.recordType ? { recordType: filter.recordType } : {}),
    ...(filter?.userId ? { userId: filter.userId } : {}),
    ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
  };

  if (filter?.startDate || filter?.endDate) {
    where.createdAt = {
      ...(filter.startDate ? { gte: new Date(filter.startDate) } : {}),
      ...(filter.endDate ? { lte: new Date(filter.endDate) } : {}),
    };
  }

  if (filter?.search) {
    const s = filter.search.trim();
    if (s) {
      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { recordType: { contains: s, mode: 'insensitive' } },
        { ipAddress: { contains: s, mode: 'insensitive' } },
        { user: { name: { contains: s, mode: 'insensitive' } } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
      ];
    }
  }

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        employee: {
          select: { id: true, name: true, employeeCode: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getActivityLogStats(tenantId: string) {
  const allLogs = await prisma.activityLog.findMany({
    where: { tenantId },
    select: {
      id: true,
      action: true,
      module: true,
      userId: true,
      recordType: true,
      createdAt: true,
      oldValues: true,
      newValues: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalLogs = allLogs.length;
  const uniqueUsers = new Set(allLogs.map((l) => l.userId)).size;

  const statusTransitions = allLogs.filter(
    (l) =>
      l.action.includes('status_changed') ||
      l.action.includes('.closed') ||
      l.action.includes('.archived') ||
      l.action.includes('.returned') ||
      l.action.includes('.received') ||
      (l.oldValues && typeof l.oldValues === 'object' && 'status' in (l.oldValues as Record<string, unknown>)),
  ).length;

  const moduleCounts: Record<string, number> = {};
  for (const log of allLogs) {
    moduleCounts[log.module] = (moduleCounts[log.module] || 0) + 1;
  }

  const topModules = Object.entries(moduleCounts)
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalLogs,
    uniqueUsers,
    statusTransitions,
    topModules,
  };
}
