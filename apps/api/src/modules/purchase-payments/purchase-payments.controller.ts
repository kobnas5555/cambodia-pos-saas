import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as purchasePaymentsService from './purchase-payments.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchasePaymentsService.listPurchasePayments(
    req.tenant!.tenantId,
    req.query as any,
  );
  res.json({
    success: true,
    data: (result as any).items ?? result,
    pagination: (result as any).total !== undefined
      ? {
          total: (result as any).total,
          page: (result as any).page,
          limit: (result as any).limit,
          totalPages: (result as any).totalPages,
        }
      : undefined,
  });
});

export const getPaymentDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchasePaymentsService.getPurchasePaymentById(
    req.tenant!.tenantId,
    req.params.paymentId,
  );
  res.json({ success: true, data });
});

export const postPayment = asyncHandler(async (req: Request, res: Response) => {
  const purchaseId = req.params.purchaseId || req.body.purchaseId;
  const data = await purchasePaymentsService.recordPurchasePayment(
    req.tenant!.tenantId,
    purchaseId,
    actor(req),
    req.body,
  );
  res.status(201).json({ success: true, data });
});

