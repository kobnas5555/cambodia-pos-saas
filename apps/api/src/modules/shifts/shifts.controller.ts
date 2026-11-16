import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as shiftsService from './shifts.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const data = await shiftsService.listShifts(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data,
    pagination: {
      page: (data as any).page ?? 1,
      limit: (data as any).limit ?? 20,
      total: (data as any).total ?? data.length,
      totalPages: (data as any).totalPages ?? 1,
    },
  });
});

export const current = asyncHandler(async (req: Request, res: Response) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const data = await shiftsService.getCurrentShift(req.tenant!.tenantId, branchId);
  res.json({ success: true, data });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const data = await shiftsService.getShiftById(req.tenant!.tenantId, req.params.shiftId);
  res.json({ success: true, data });
});

export const open = asyncHandler(async (req: Request, res: Response) => {
  const data = await shiftsService.openShift(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  const data = await shiftsService.closeShift(
    req.tenant!.tenantId,
    req.params.shiftId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

