import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as stockBalancesService from './stock-balances.service';

export const getBalances = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockBalancesService.listStockBalances(req.tenant!.tenantId, req.query as any);
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
  const data = await stockBalancesService.getStockBalanceById(
    req.tenant!.tenantId,
    req.params.balanceId,
  );
  res.json({ success: true, data });
});

