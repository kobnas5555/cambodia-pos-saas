import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as salesService from './sales.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.listOrders(req.tenant!.tenantId, {
    branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });
  res.json({ success: true, data });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.getOrderById(req.tenant!.tenantId, req.params.orderId);
  res.json({ success: true, data });
});

export const postOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.createOrder(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.listPayments(req.tenant!.tenantId, {
    branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    paymentMethod: typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined,
    currencyCode: typeof req.query.currencyCode === 'string' ? req.query.currencyCode : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });
  res.json({ success: true, data });
});

export const getSaleReturns = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.listSaleReturns(req.tenant!.tenantId, {
    branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    refundMethod: typeof req.query.refundMethod === 'string' ? req.query.refundMethod : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });
  res.json({ success: true, data });
});

export const getSaleReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.getSaleReturnById(req.tenant!.tenantId, req.params.returnId);
  res.json({ success: true, data });
});

export const postSaleReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesService.createSaleReturn(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

