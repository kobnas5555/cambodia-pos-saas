import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as exchangeRatesService from './exchange-rates.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

export const getExchangeRates = asyncHandler(async (req: Request, res: Response) => {
  const result = await exchangeRatesService.listExchangeRates(req.tenant!.tenantId, req.query as any);
  res.json({
    success: true,
    data: result.items,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

export const postExchangeRate = asyncHandler(async (req: Request, res: Response) => {
  const data = await exchangeRatesService.createExchangeRate(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

