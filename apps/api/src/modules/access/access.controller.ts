import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as accessService from './access.service';

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.listPermissions(req.query as any);
  res.json({ success: true, data });
});

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.listRoles(req.tenant!.tenantId, req.query as any);
  res.json({ success: true, data });
});

export const postRole = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.createRole(
    req.tenant!.tenantId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.status(201).json({ success: true, data });
});

export const patchRole = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.updateRole(
    req.tenant!.tenantId,
    req.params.roleId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.json({ success: true, data });
});

export const removeRole = asyncHandler(async (req: Request, res: Response) => {
  await accessService.deleteRole(req.tenant!.tenantId, req.params.roleId, {
    userId: req.auth!.userId,
    employeeId: req.tenant!.employeeId,
    ipAddress: req.ip || null,
  });
  res.json({ success: true, message: 'Role deleted' });
});

export const getEmployees = asyncHandler(async (req: Request, res: Response) => {
  const result = await accessService.listEmployees(req.tenant!.tenantId, req.query as any);
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

export const postEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.createEmployee(
    req.tenant!.tenantId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.status(201).json({ success: true, data });
});

export const patchEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.updateEmployee(
    req.tenant!.tenantId,
    req.params.employeeId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.json({ success: true, data });
});

export const getInvitations = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.listInvitations(req.tenant!.tenantId);
  res.json({ success: true, data });
});

export const postInvitation = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.inviteEmployee(
    req.tenant!.tenantId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.status(201).json({ success: true, data });
});

export const postAcceptInvitation = asyncHandler(async (req: Request, res: Response) => {
  const data = await accessService.acceptInvitation(req.body);
  res.json({ success: true, data });
});

