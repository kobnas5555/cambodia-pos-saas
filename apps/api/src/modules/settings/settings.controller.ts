import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as settingsService from './settings.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const data = await settingsService.getSystemSettings(req.tenant!.tenantId, branchId);
  res.json({ success: true, data });
});

export const putSettings = asyncHandler(async (req: Request, res: Response) => {
  const data = await settingsService.upsertSystemSettings(req.tenant!.tenantId, actor(req), req.body);
  res.json({ success: true, data });
});

export const postExchangeRate = asyncHandler(async (req: Request, res: Response) => {
  const data = await settingsService.createExchangeRate(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const getUserPreferences = asyncHandler(async (req: Request, res: Response) => {
  const data = await settingsService.getUserPreferences(req.tenant!.tenantId, req.auth!.userId);
  res.json({ success: true, data });
});

export const putUserPreferences = asyncHandler(async (req: Request, res: Response) => {
  const data = await settingsService.updateUserPreferences(
    req.tenant!.tenantId,
    req.auth!.userId,
    actor(req),
    req.body,
  );
  res.json({ success: true, data });
});

