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

export const getSettingRecords = asyncHandler(async (req: Request, res: Response) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const data = await settingsService.listSettingRecords(req.tenant!.tenantId, { branchId, search });
  res.json({ success: true, data });
});

export const getSettingRecord = asyncHandler(async (req: Request, res: Response) => {
  const idOrKey = req.params.id;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrKey);
  if (isUuid) {
    try {
      const data = await settingsService.getSettingRecordById(req.tenant!.tenantId, idOrKey);
      return res.json({ success: true, data });
    } catch {
      // Fallback to key lookup
    }
  }
  const data = await settingsService.getSettingRecordByKey(req.tenant!.tenantId, idOrKey, branchId);
  res.json({ success: true, data });
});


