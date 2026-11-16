import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import * as controller from './reports.controller';

const router = Router();
router.use(authenticate, requireTenantContext);

router.get('/dashboard', requirePermission('reports.view'), controller.dashboard);
router.get('/sales', requirePermission('reports.view'), controller.sales);
router.get('/products', requirePermission('reports.view'), controller.products);
router.get('/inventory', requirePermission('reports.view'), controller.inventory);
router.get('/purchases', requirePermission('reports.view'), controller.purchases);
router.get('/expenses', requirePermission('reports.view'), controller.expenses);
router.get('/incomes', requirePermission('reports.view'), controller.incomes);
router.get('/profit', requirePermission('reports.view'), controller.profit);
router.get('/shifts', requirePermission('reports.view'), controller.shifts);
router.get('/employees', requirePermission('reports.view'), controller.employees);

// Version 2: Advanced Analytics & Financial Statements
router.get('/analytics/hourly-heatmap', requirePermission('reports.view'), controller.hourlyHeatmap);
router.get('/analytics/product-affinity', requirePermission('reports.view'), controller.productAffinity);
router.get('/analytics/customer-retention', requirePermission('reports.view'), controller.customerRetention);
router.get('/financial/pnl', requirePermission('reports.view'), controller.profitAndLoss);
router.get('/financial/balance-sheet', requirePermission('reports.view'), controller.balanceSheet);
router.get('/financial/tax-summary', requirePermission('reports.view'), controller.taxSummary);
router.get('/export', requirePermission('reports.view'), controller.exportReport);

export const reportsRouter = router;
