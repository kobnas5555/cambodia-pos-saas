import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as orderItemsService from './order-items.service';

export const getOrderItems = asyncHandler(async (req: Request, res: Response) => {
  const result = await orderItemsService.listOrderItems(req.tenant!.tenantId, {
    ...req.query,
    orderId: req.params.orderId || req.query.orderId,
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

