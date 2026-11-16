import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as tenantsService from './tenants.service';

export const getCurrent = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await tenantsService.getCurrentTenant(req.tenant!.tenantId);
  res.json({ success: true, data: tenant });
});

export const updateCurrent = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await tenantsService.updateCurrentTenant(
    req.tenant!.tenantId,
    {
      userId: req.auth!.userId,
      employeeId: req.tenant!.employeeId,
      ipAddress: req.ip || null,
    },
    req.body,
  );
  res.json({ success: true, data: tenant });
});

export const createTenant = asyncHandler(async (req: Request, res: Response) => {
  const result = await tenantsService.createAdditionalTenant(
    req.auth!.userId,
    req.auth!.sessionId,
    req.body,
    req.ip || null,
  );
  res.status(201).json({ success: true, data: result });
});

