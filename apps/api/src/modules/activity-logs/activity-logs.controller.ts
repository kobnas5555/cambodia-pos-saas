import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { getActivityLogStats, listTenantActivityLogs } from './activity-logs.service';

export const getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const query = req.query as Record<string, string | undefined>;

  const result = await listTenantActivityLogs(tenantId, {
    module: query.module,
    action: query.action,
    recordType: query.recordType,
    userId: query.userId,
    employeeId: query.employeeId,
    startDate: query.startDate,
    endDate: query.endDate,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });

  res.json({
    success: true,
    data: result.items,
    meta: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const stats = await getActivityLogStats(tenantId);
  res.json({
    success: true,
    data: stats,
  });
});
