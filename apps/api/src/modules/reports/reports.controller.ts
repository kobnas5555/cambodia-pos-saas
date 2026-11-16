import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as reportsService from './reports.service';

const strQuery = (val: unknown): string | undefined =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;

function extractFilters(req: Request): reportsService.ReportFilters {
  return {
    branchId: strQuery(req.query.branchId),
    dateFrom: strQuery(req.query.dateFrom),
    dateTo: strQuery(req.query.dateTo),
    search: strQuery(req.query.search),
    status: strQuery(req.query.status),
    expenseTypeId: strQuery(req.query.expenseTypeId),
    paymentMethod: strQuery(req.query.paymentMethod),
    employeeId: strQuery(req.query.employeeId),
    lowStockOnly: req.query.lowStockOnly === 'true',
  };
}

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getDashboardOverview(
    req.tenant!.tenantId,
    strQuery(req.query.branchId),
  );
  res.json({ success: true, data });
});

export const sales = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getSalesReport(req.tenant!.tenantId, extractFilters(req));
  res.json({ success: true, data });
});

export const products = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getProductPerformanceReport(
    req.tenant!.tenantId,
    extractFilters(req),
  );
  res.json({ success: true, data });
});

export const inventory = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getInventoryReport(
    req.tenant!.tenantId,
    extractFilters(req),
  );
  res.json({ success: true, data });
});

export const purchases = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getPurchaseReport(
    req.tenant!.tenantId,
    extractFilters(req),
  );
  res.json({ success: true, data });
});

export const expenses = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getExpenseReport(req.tenant!.tenantId, extractFilters(req));
  res.json({ success: true, data });
});

export const incomes = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getIncomeReport(req.tenant!.tenantId, extractFilters(req));
  res.json({ success: true, data });
});

export const profit = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getProfitEstimationReport(
    req.tenant!.tenantId,
    extractFilters(req),
  );
  res.json({ success: true, data });
});

export const shifts = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getCashierShiftReport(
    req.tenant!.tenantId,
    extractFilters(req),
  );
  res.json({ success: true, data });
});

export const employees = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getEmployeeReport(
    req.tenant!.tenantId,
    extractFilters(req),
  );
  res.json({ success: true, data });
});

export const hourlyHeatmap = asyncHandler(async (req: Request, res: Response) => {
  const filters = extractFilters(req);
  const data = await reportsService.getHourlyHeatmap(
    req.tenant!.tenantId,
    filters.branchId,
    filters.dateFrom,
    filters.dateTo,
  );
  res.json({ success: true, data });
});

export const productAffinity = asyncHandler(async (req: Request, res: Response) => {
  const filters = extractFilters(req);
  const data = await reportsService.getProductAffinity(req.tenant!.tenantId, filters.branchId);
  res.json({ success: true, data });
});

export const customerRetention = asyncHandler(async (req: Request, res: Response) => {
  const filters = extractFilters(req);
  const data = await reportsService.getCustomerRetention(req.tenant!.tenantId, filters.branchId);
  res.json({ success: true, data });
});

export const profitAndLoss = asyncHandler(async (req: Request, res: Response) => {
  const filters = extractFilters(req);
  const data = await reportsService.getProfitAndLoss(
    req.tenant!.tenantId,
    filters.branchId,
    filters.dateFrom,
    filters.dateTo,
  );
  res.json({ success: true, data });
});

export const balanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const filters = extractFilters(req);
  const data = await reportsService.getBalanceSheet(req.tenant!.tenantId, filters.branchId);
  res.json({ success: true, data });
});

export const taxSummary = asyncHandler(async (req: Request, res: Response) => {
  const filters = extractFilters(req);
  const data = await reportsService.getTaxSummary(
    req.tenant!.tenantId,
    filters.branchId,
    filters.dateFrom,
    filters.dateTo,
  );
  res.json({ success: true, data });
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const type = String(req.query.type ?? 'sales');
  const filters = extractFilters(req);
  const file = await reportsService.exportReportData(req.tenant!.tenantId, type, filters);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.content);
});
