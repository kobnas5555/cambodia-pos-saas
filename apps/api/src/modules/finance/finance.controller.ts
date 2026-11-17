import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as financeService from './finance.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

const strQuery = (val: unknown): string | undefined =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;

export * from '../expense-types/expense-types.controller';
export * from '../expenses/expenses.controller';
export * from '../incomes/incomes.controller';

export const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const dir = strQuery(req.query.direction);
  const data = await financeService.listFinancialTransactions(req.tenant!.tenantId, {
    branchId: strQuery(req.query.branchId),
    direction: dir === 'INFLOW' || dir === 'OUTFLOW' ? dir : undefined,
    type: strQuery(req.query.type),
    paymentMethod: strQuery(req.query.paymentMethod),
    search: strQuery(req.query.search),
    dateFrom: strQuery(req.query.dateFrom),
    dateTo: strQuery(req.query.dateTo),
  });
  res.json({ success: true, data });
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.getFinanceSummary(req.tenant!.tenantId, {
    branchId: strQuery(req.query.branchId),
    dateFrom: strQuery(req.query.dateFrom),
    dateTo: strQuery(req.query.dateTo),
  });
  res.json({ success: true, data });
});

