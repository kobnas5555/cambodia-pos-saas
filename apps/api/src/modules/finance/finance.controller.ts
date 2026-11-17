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

export const getExpenseTypes = asyncHandler(async (req: Request, res: Response) => {
  const result = await financeService.listExpenseTypes(req.tenant!.tenantId, req.query as any);
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

export const getExpenseTypeDetail = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.getExpenseTypeById(req.tenant!.tenantId, req.params.expenseTypeId);
  res.json({ success: true, data });
});

export const postExpenseType = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.createExpenseType(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const patchExpenseType = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.updateExpenseType(
    req.tenant!.tenantId,
    actor(req),
    req.params.expenseTypeId,
    req.body,
  );
  res.json({ success: true, data });
});

export const getExpenses = asyncHandler(async (req: Request, res: Response) => {
  const result = await financeService.listExpenses(req.tenant!.tenantId, {
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
  const data = await financeService.getExpenseById(req.tenant!.tenantId, req.params.expenseId);
  res.json({ success: true, data });
});

export const postExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.createExpense(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

export const getIncomes = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.listIncomes(req.tenant!.tenantId, {
    branchId: strQuery(req.query.branchId),
    search: strQuery(req.query.search),
    dateFrom: strQuery(req.query.dateFrom),
    dateTo: strQuery(req.query.dateTo),
  });
  res.json({ success: true, data });
});

export const postIncome = asyncHandler(async (req: Request, res: Response) => {
  const data = await financeService.createIncome(req.tenant!.tenantId, actor(req), req.body);
  res.status(201).json({ success: true, data });
});

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

