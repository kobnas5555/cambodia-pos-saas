import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as unitsService from './units.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getUnits = asyncHandler(async (req: Request, res: Response) => {
  const data = await unitsService.listUnits(req.tenant!.tenantId);
  res.json({ success: true, data });
});

export const postUnit = asyncHandler(async (req: Request, res: Response) => {
  const data = await unitsService.createUnit(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchUnit = asyncHandler(async (req: Request, res: Response) => {
  const data = await unitsService.updateUnit(
    req.tenant!.tenantId,
    req.params.unitId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

