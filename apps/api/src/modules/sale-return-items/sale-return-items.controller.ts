import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as saleReturnItemsService from './sale-return-items.service';

export const getSaleReturnItems = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    ...req.query,
    ...(req.params.returnId ? { saleReturnId: req.params.returnId } : {}),
  };
  const data = await saleReturnItemsService.listSaleReturnItems(req.tenant!.tenantId, query as any);
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

