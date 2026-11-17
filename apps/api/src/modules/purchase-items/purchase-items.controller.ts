import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as purchaseItemsService from './purchase-items.service';

export const getPurchaseItems = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchaseItemsService.listPurchaseItems(req.tenant!.tenantId, {
    ...req.query,
    purchaseId: req.params.purchaseId || req.query.purchaseId,
  } as any);
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

