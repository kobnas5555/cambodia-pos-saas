import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as usersService from './users.service';

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.listUsers(req.tenant!.tenantId, req.query as any);
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

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.getUserById(req.tenant!.tenantId, req.params.userId);
  res.json({ success: true, data });
});

