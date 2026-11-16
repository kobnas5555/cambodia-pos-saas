import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as purchasingService from './purchasing.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasingService.listPurchases(req.tenant!.tenantId, {
    branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    supplierId: typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    paymentStatus:
      typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });
  res.json({ success: true, data });
});

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasingService.listPurchasePayments(req.tenant!.tenantId, {
    branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    supplierId: typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined,
    paymentMethod: typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });
  res.json({ success: true, data });
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

