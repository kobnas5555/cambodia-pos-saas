import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as paymentsService from './payments.service';

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    ...req.query,
    ...(req.params.orderId ? { orderId: req.params.orderId } : {}),
  };
  const data = await paymentsService.listPayments(req.tenant!.tenantId, query as any);
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

