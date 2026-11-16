import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as service from './platform.service';

export const getOverview = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getPlatformOverview();
  res.json({ success: true, data });
});

export const getTenants = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await service.getPlatformTenants({ search, status });
  res.json({ success: true, data });
});

export const patchTenantStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = {
    userId: req.auth!.userId,
    ipAddress: req.ip,
  };
  const data = await service.updateTenantStatus(req.params.tenantId, req.body.status, actor);
  res.json({ success: true, data });
});

export const getPlans = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getPlatformPlans();
  res.json({ success: true, data });
});

export const postPlan = asyncHandler(async (req: Request, res: Response) => {
  const actor = {
    userId: req.auth!.userId,
    ipAddress: req.ip,
  };
  const data = await service.upsertPlatformPlan(req.body.id ?? null, req.body, actor);
  res.json({ success: true, data });
});

export const getSubscriptions = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getPlatformSubscriptions();
  res.json({ success: true, data });
});

export const patchSubscription = asyncHandler(async (req: Request, res: Response) => {
  const actor = {
    userId: req.auth!.userId,
    ipAddress: req.ip,
  };
  const data = await service.updatePlatformSubscription(req.params.subscriptionId, req.body, actor);
  res.json({ success: true, data });
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const role = typeof req.query.role === 'string' ? req.query.role : undefined;
  const data = await service.getPlatformUsers({ search, role });
  res.json({ success: true, data });
});

export const patchUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = {
    userId: req.auth!.userId,
    ipAddress: req.ip,
  };
  const data = await service.updatePlatformUser(req.params.userId, req.body, actor);
  res.json({ success: true, data });
});

export const getMonitoring = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getSystemMonitoring();
  res.json({ success: true, data });
});

export const getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const module = typeof req.query.module === 'string' ? req.query.module : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = await service.getPlatformActivityLogs({ module, search, limit });
  res.json({ success: true, data });
});

