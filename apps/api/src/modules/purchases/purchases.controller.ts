import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as purchasesService from './purchases.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getPurchases = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchasesService.listPurchases(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: (result as any).items ?? result,
    pagination: {
      total: (result as any).total,
      page: (result as any).page,
      limit: (result as any).limit,
      totalPages: (result as any).totalPages,
    },
  });
});

export const getPurchase = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasesService.getPurchaseById(req.tenant!.tenantId, req.params.purchaseId);
  res.json({ success: true, data });
});

export const postPurchase = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasesService.createPurchase(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const postReceivePurchase = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasesService.receivePurchase(req.tenant!.tenantId, req.params.purchaseId, actor(req));
  res.json({ success: true, data });
});

