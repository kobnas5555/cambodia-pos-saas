import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as purchasingService from './purchasing.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchasingService.listPurchases(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: result.items ?? result,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchasingService.listPurchasePayments(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: result.items ?? result,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchasingService.listPurchaseItems(req.tenant!.tenantId, {
    ...req.query,
    purchaseId: req.params.purchaseId || req.query.purchaseId,
  } as any);
  res.json({
    success: true,
    data: result.items ?? result,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasingService.getPurchaseById(req.tenant!.tenantId, req.params.purchaseId);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasingService.createPurchase(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const receive = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasingService.receivePurchase(
    req.tenant!.tenantId,
    req.params.purchaseId,
    actor(req),
  );
  res.json({ success: true, data });
});

export const addPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasingService.recordPurchasePayment(
    req.tenant!.tenantId,
    req.params.purchaseId,
    actor(req),
    req.body,
  );
  res.status(201).json({ success: true, data });
});

