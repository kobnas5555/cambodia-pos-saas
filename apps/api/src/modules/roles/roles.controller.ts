import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as rolesService from './roles.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.listRoles(req.tenant!.tenantId, req.query as any);
  res.json({ success: true, data });
});

export const postRole = asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.createRole(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchRole = asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.updateRole(
    req.tenant!.tenantId,
    req.params.roleId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

export const removeRole = asyncHandler(async (req: Request, res: Response) => {
  await rolesService.deleteRole(req.tenant!.tenantId, req.params.roleId, actor(req));
  res.json({ success: true, message: 'Role deleted' });
});

