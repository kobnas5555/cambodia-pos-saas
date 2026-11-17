import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as employeesService from './employees.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getEmployees = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.listEmployees(req.tenant!.tenantId, req.query as any);
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
  const data = await employeesService.createEmployee(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = await employeesService.updateEmployee(
    req.tenant!.tenantId,
    req.params.employeeId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

