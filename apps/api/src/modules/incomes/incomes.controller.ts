import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as incomesService from './incomes.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

const strQuery = (val: unknown): string | undefined =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;

export const getIncomes = asyncHandler(async (req: Request, res: Response) => {
  const result = await incomesService.listIncomes(req.tenant!.tenantId, {
    branchId: strQuery(req.query.branchId),
    search: strQuery(req.query.search),
    dateFrom: strQuery(req.query.dateFrom),
    dateTo: strQuery(req.query.dateTo),
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
  });
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

export const getIncomeDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await incomesService.getIncomeById(req.tenant!.tenantId, req.params.incomeId);
  res.json({ success: true, data });
});

export const postIncome = asyncHandler(async (req: Request, res: Response) => {
  const data = await incomesService.createIncome(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

