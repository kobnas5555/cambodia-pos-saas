import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as stockMovementsService from './stock-movements.service';

export const getMovements = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockMovementsService.listStockMovements(req.tenant!.tenantId, req.query as any);
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
  const data = await stockMovementsService.getStockMovementById(
    req.tenant!.tenantId,
    req.params.movementId,
  );
  res.json({ success: true, data });
});

