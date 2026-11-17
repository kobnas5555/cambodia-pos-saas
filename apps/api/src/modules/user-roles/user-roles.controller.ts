import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as userRolesService from './user-roles.service';

export const getUserRoles = asyncHandler(async (req: Request, res: Response) => {
  const result = await userRolesService.listUserRoles(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: result.items,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

