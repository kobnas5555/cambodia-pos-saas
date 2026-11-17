import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as inventoryService from './inventory.service';

export const getBalances = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.listStockBalances(req.tenant!.tenantId, req.query as any);
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

export const getBalanceDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.getStockBalanceById(
    req.tenant!.tenantId,
    req.params.balanceId,
  );
  res.json({ success: true, data });
});

export const getMovements = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.listStockMovements(req.tenant!.tenantId, req.query as any);
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

export const getMovementDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.getStockMovementById(
    req.tenant!.tenantId,
    req.params.movementId,
  );
  res.json({ success: true, data });
});

export const getAdjustments = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.listStockAdjustments(req.tenant!.tenantId, req.query as any);
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

export const getAdjustmentDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.getAdjustmentById(
    req.tenant!.tenantId,
    req.params.adjustmentId,
  );
  res.json({ success: true, data });
});

export const postAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.createStockAdjustment(
    req.tenant!.tenantId,
    { userId: req.auth!.userId, employeeId: req.tenant!.employeeId, ipAddress: req.ip || null },
    req.body,
  );
  res.status(201).json({ success: true, data });
});

