import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as saleReturnsService from './sale-returns.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getSaleReturns = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    ...req.query,
    ...(req.params.orderId ? { orderId: req.params.orderId } : {}),
  };
  const data = await saleReturnsService.listSaleReturns(req.tenant!.tenantId, query as any);
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

export const getSaleReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = await saleReturnsService.getSaleReturnById(req.tenant!.tenantId, req.params.returnId);
  res.json({ success: true, data });
});

export const postSaleReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = await saleReturnsService.createSaleReturn(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

