import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as salesService from './sales.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const result = await salesService.listOrders(req.tenant!.tenantId, req.query as any);
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

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.getOrderById(req.tenant!.tenantId, req.params.orderId);
  res.json({ success: true, data });
});

export const getOrderItems = asyncHandler(async (req: Request, res: Response) => {
  const result = await salesService.listOrderItems(req.tenant!.tenantId, {
    ...req.query,
    orderId: req.params.orderId || req.query.orderId,
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

export const postOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.createOrder(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    ...req.query,
    ...(req.params.orderId ? { orderId: req.params.orderId } : {}),
  };
  const data = await salesService.listPayments(req.tenant!.tenantId, query as any);
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

export const getSaleReturns = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    ...req.query,
    ...(req.params.orderId ? { orderId: req.params.orderId } : {}),
  };
  const data = await salesService.listSaleReturns(req.tenant!.tenantId, query as any);
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
  const data = await salesService.getSaleReturnById(req.tenant!.tenantId, req.params.returnId);
  res.json({ success: true, data });
});

export const postSaleReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.createSaleReturn(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

