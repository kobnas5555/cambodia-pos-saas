import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as ordersService from './orders.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const result = await ordersService.listOrders(req.tenant!.tenantId, req.query as any);
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

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.getOrderById(req.tenant!.tenantId, req.params.orderId);
  res.json({ success: true, data });
});

export const postOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.createOrder(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

