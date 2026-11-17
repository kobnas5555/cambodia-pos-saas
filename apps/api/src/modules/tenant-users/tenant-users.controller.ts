import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as tenantUsersService from './tenant-users.service';

export const getTenantUsers = asyncHandler(async (req: Request, res: Response) => {
  const result = await tenantUsersService.listTenantUsers(req.tenant!.tenantId, req.query as any);
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

export const getTenantUserById = asyncHandler(async (req: Request, res: Response) => {
  const data = await tenantUsersService.getTenantUserById(req.tenant!.tenantId, req.params.id);
  res.json({ success: true, data });
});

export const getInvitations = asyncHandler(async (req: Request, res: Response) => {
  const data = await tenantUsersService.listInvitations(req.tenant!.tenantId);
  res.json({ success: true, data });
});

export const postInvitation = asyncHandler(async (req: Request, res: Response) => {
  const data = await tenantUsersService.inviteEmployee(
    req.tenant!.tenantId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.status(201).json({ success: true, data });
});

export const postAcceptInvitation = asyncHandler(async (req: Request, res: Response) => {
  const data = await tenantUsersService.acceptInvitation(req.body);
  res.json({ success: true, data });
});

