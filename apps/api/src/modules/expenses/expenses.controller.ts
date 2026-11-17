import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as expensesService from './expenses.service';

const actor = (req: Request) => ({
  userId: req.auth!.userId,
  employeeId: req.tenant!.employeeId,
  ipAddress: req.ip || null,
});

const strQuery = (val: unknown): string | undefined =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;

export const getExpenses = asyncHandler(async (req: Request, res: Response) => {
  const result = await expensesService.listExpenses(req.tenant!.tenantId, {
    branchId: strQuery(req.query.branchId),
    expenseTypeId: strQuery(req.query.expenseTypeId),
    paymentMethod: strQuery(req.query.paymentMethod),
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

export const getExpenseDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await expensesService.getExpenseById(req.tenant!.tenantId, req.params.expenseId);
  res.json({ success: true, data });
});

export const postExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = await expensesService.createExpense(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

