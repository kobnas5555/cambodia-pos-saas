import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ current: null as any }));

vi.mock('../src/db/prisma', async () => {
  const { createInMemoryPrisma: buildPrisma } = await import('./helpers/inMemoryPrisma');
  mockPrisma.current = buildPrisma();
  return { prisma: mockPrisma.current };
});

import { createApp } from '../src/app';

describe('Version 2 — Business Expansion Integration Suite', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma.current.reset();
  });

  async function registerTenant(email: string, businessName: string) {
    const res = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Vireak Meas',
      email,
      phone: '+85512345678',
      password: 'Password123!',
      businessName,
      businessType: 'RETAIL',
      defaultCurrency: 'USD',
      defaultLanguage: 'km',
      mainBranchName: 'HQ Store',
      mainBranchCode: 'HQ-01',
    });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      tenantId: res.body.data.activeTenant.id as string,
      branchId: res.body.data.activeTenant.branches[0].id as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createCategoryAndUnit(token: string, tenantId: string) {
    const cat = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Beverages' });
    expect(cat.status).toBe(201);

    const unit = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Can', abbreviation: 'can' });
    expect(unit.status).toBe(201);

    return { categoryId: cat.body.data.id, unitId: unit.body.data.id };
  }

  // ==========================================================================
  // 1. Branch Stock Transfers (Inter-Branch Transit & Stock Updates)
  // ==========================================================================
  it('V2-Transfers: executes full stock transfer lifecycle with transit reservations and branch stock increases', async () => {
    const { token, tenantId, branchId: hqBranchId } = await registerTenant(
      'owner.transfers@shop.com',
      'Transfer Retail Group',
    );

    // 1. Create a 2nd Branch
    const branch2Res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Toul Kork Branch',
        branchCode: 'TK-02',
        isMain: false,
      });
    expect(branch2Res.status).toBe(201);
    const branch2Id = branch2Res.body.data.id;

    // 2. Create Product with initial stock of 50 at HQ
    const { categoryId, unitId } = await createCategoryAndUnit(token, tenantId);
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Angkor Beer Can',
        sku: 'BEER-01',
        costPrice: '0.80',
        sellingPrice: '1.25',
        categoryId,
        unitId,
        trackInventory: true,
        openingStock: '50',
        branchId: hqBranchId,
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id;

    // 3. Initiate Stock Transfer of 20 units from HQ to Branch 2
    const transferRes = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        fromBranchId: hqBranchId,
        toBranchId: branch2Id,
        notes: 'Stock replenishment for weekend sale',
        items: [{ productId, quantity: '20' }],
      });
    expect(transferRes.status).toBe(201);
    expect(transferRes.body.data.status).toBe('PENDING');
    const transferId = transferRes.body.data.id;

    // 4. Dispatch Transfer (Send) -> Status IN_TRANSIT, HQ Stock decreases by 20 (50 -> 30)
    const sendRes = await request(app)
      .post(`/api/v1/transfers/${transferId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.data.status).toBe('IN_TRANSIT');

    // Verify HQ stock is now 30
    const hqStock = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${hqBranchId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    const hqItem = hqStock.body.data.find((b: any) => b.productId === productId);
    expect(Number(hqItem.quantity)).toBe(30);

    // 5. Receive Transfer at Branch 2 -> Status COMPLETED, Branch 2 Stock increases by 20 (0 -> 20)
    const receiveRes = await request(app)
      .post(`/api/v1/transfers/${transferId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.status).toBe('COMPLETED');

    const b2Stock = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branch2Id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    const b2Item = b2Stock.body.data.find((b: any) => b.productId === productId);
    expect(Number(b2Item.quantity)).toBe(20);

    // 6. List Transfers
    const listRes = await request(app)
      .get('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
  });

  // ==========================================================================
  // 2. Advanced Analytics (Hourly Heatmap, Basket Affinity, Customer Retention)
  // ==========================================================================
  it('V2-Analytics: computes hourly sales density, market basket affinities, and customer retention metrics', async () => {
    const { token, tenantId, branchId } = await registerTenant(
      'owner.analytics@shop.com',
      'Analytics Retail',
    );
    const { categoryId, unitId } = await createCategoryAndUnit(token, tenantId);

    // Create 2 products
    const p1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Arabica Coffee',
        sku: 'COF-01',
        costPrice: '2.50',
        sellingPrice: '4.50',
        categoryId,
        unitId,
        trackInventory: true,
        openingStock: '100',
        branchId,
      });

    const p2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Croissant Butter',
        sku: 'BAK-01',
        costPrice: '0.80',
        sellingPrice: '1.80',
        categoryId,
        unitId,
        trackInventory: true,
        openingStock: '100',
        branchId,
      });

    // Create a customer
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Sokha Chan', phone: '+85511223344' });
    const customerId = custRes.body.data.id;

    // Place an order with both items
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        branchId,
        customerId,
        currencyCode: 'USD',
        items: [
          { productId: p1.body.data.id, quantity: '1', discountAmount: '0' },
          { productId: p2.body.data.id, quantity: '1', discountAmount: '0' },
        ],
        payments: [{ paymentMethod: 'CASH', amount: '6.30', currencyCode: 'USD' }],
      });
    expect(orderRes.status).toBe(201);

    // 1. Hourly Heatmap
    const heatmapRes = await request(app)
      .get('/api/v1/reports/analytics/hourly-heatmap')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(heatmapRes.status).toBe(200);
    expect(heatmapRes.body.data.hours.length).toBe(24);
    expect(heatmapRes.body.data.totalOrders).toBe(1);

    // 2. Product Affinity (Market Basket)
    const affinityRes = await request(app)
      .get('/api/v1/reports/analytics/product-affinity')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(affinityRes.status).toBe(200);
    expect(affinityRes.body.data.topAffinityPairs.length).toBe(1);
    expect(affinityRes.body.data.topAffinityPairs[0].count).toBe(1);

    // 3. Customer Retention
    const retentionRes = await request(app)
      .get('/api/v1/reports/analytics/customer-retention')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(retentionRes.status).toBe(200);
    expect(retentionRes.body.data.totalTrackedCustomers).toBe(1);
  });

  // ==========================================================================
  // 3. Advanced Financial Reports (P&L, Balance Sheet, Tax Summary, Exports)
  // ==========================================================================
  it('V2-Financials: generates structured P&L, balance sheet statement, VAT tax summary, and CSV export', async () => {
    const { token, tenantId, branchId } = await registerTenant(
      'owner.finance@shop.com',
      'Finance Retail',
    );
    const { categoryId, unitId } = await createCategoryAndUnit(token, tenantId);

    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Smart Watch',
        sku: 'TECH-01',
        costPrice: '50.00',
        sellingPrice: '80.00',
        categoryId,
        unitId,
        trackInventory: true,
        openingStock: '20',
        branchId,
      });

    // Make an order ($80, COGS $50, tax $8)
    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        branchId,
        currencyCode: 'USD',
        taxAmount: '8.00',
        items: [{ productId: prod.body.data.id, quantity: '1', discountAmount: '0' }],
        payments: [{ paymentMethod: 'CASH', amount: '88.00', currencyCode: 'USD' }],
      });

    // Record an Expense ($10)
    const expType = await request(app)
      .post('/api/v1/finance/expense-types')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({ name: 'Store Supplies' });

    await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        branchId,
        expenseTypeId: expType.body.data.id,
        amount: '10.00',
        currencyCode: 'USD',
      });

    // 1. Profit & Loss Statement (P&L)
    const pnlRes = await request(app)
      .get('/api/v1/reports/financial/pnl')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(pnlRes.status).toBe(200);
    expect(pnlRes.body.data.grossRevenue).toBe('88.00');
    expect(pnlRes.body.data.costOfGoodsSold).toBe('50.00');
    expect(pnlRes.body.data.operatingExpenses).toBe('10.00');
    expect(Number(pnlRes.body.data.netProfit)).toBeGreaterThan(0);

    // 2. Balance Sheet
    const balanceRes = await request(app)
      .get('/api/v1/reports/financial/balance-sheet')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(balanceRes.status).toBe(200);
    expect(Number(balanceRes.body.data.assets.totalCurrentAssets)).toBeGreaterThan(0);

    // 3. Tax & VAT Summary
    const taxRes = await request(app)
      .get('/api/v1/reports/financial/tax-summary')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(taxRes.status).toBe(200);
    expect(taxRes.body.data.salesTax.outputVat).toBe('8.00');

    // 4. Report CSV Export
    const exportRes = await request(app)
      .get('/api/v1/reports/export?type=pnl')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.text).toContain('Gross Revenue');
  });

  // ==========================================================================
  // 4. Subscription Plans & Tenant Billing
  // ==========================================================================
  it('V2-Subscription: provides tiered plans, tracks resource quotas, and manages plan upgrades', async () => {
    const { token, tenantId } = await registerTenant(
      'owner.billing@shop.com',
      'SaaS Subscriber',
    );

    // 1. Get Plan Catalog
    const plansRes = await request(app).get('/api/v1/billing/plans');
    expect(plansRes.status).toBe(200);
    expect(plansRes.body.data.length).toBe(4);
    const growthPlan = plansRes.body.data.find((p: any) => p.tier === 'GROWTH');
    expect(growthPlan).toBeDefined();

    // 2. Get Current Tenant Subscription
    const subRes = await request(app)
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(subRes.status).toBe(200);
    expect(subRes.body.data.subscription.status).toBe('ACTIVE');
    expect(subRes.body.data.usage.branches).toBeDefined();

    // 3. Upgrade to Growth Plan
    const upgradeRes = await request(app)
      .post('/api/v1/billing/subscription/change')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        planTier: 'GROWTH',
        billingCycle: 'YEARLY',
        paymentMethod: 'BAKONG_KHQR',
      });
    expect(upgradeRes.status).toBe(200);
    expect(upgradeRes.body.data.subscription.plan.tier).toBe('GROWTH');
    expect(upgradeRes.body.data.subscription.invoices.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // 5. Automated Payment Integrations (Bakong KHQR & Webhooks)
  // ==========================================================================
  it('V2-Payments: generates Bakong KHQR dynamic payloads and processes automated webhook confirmations', async () => {
    const { token, tenantId, branchId } = await registerTenant(
      'owner.bakong@shop.com',
      'Bakong POS',
    );
    const { categoryId, unitId } = await createCategoryAndUnit(token, tenantId);

    // 1. Dynamic KHQR Generation
    const qrRes = await request(app)
      .post('/api/v1/payments/generate-khqr')
      .send({
        merchantName: 'Bakong Mart',
        bakongAccountId: 'mart@acleda',
        amount: '15.50',
        currency: 'USD',
        orderNumber: 'ORD-999',
      });
    expect(qrRes.status).toBe(200);
    expect(qrRes.body.data.khqrString).toContain('000201');
    expect(qrRes.body.data.deepLink).toContain('bakong://pay');

    // 2. Create an Order in PENDING status (without instant full payment)
    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        name: 'Bakong Item',
        sku: 'BKG-01',
        costPrice: '5.00',
        sellingPrice: '10.00',
        categoryId,
        unitId,
        trackInventory: true,
        openingStock: '10',
        branchId,
      });

    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId: prod.body.data.id, quantity: '1', discountAmount: '0' }],
        payments: [{ paymentMethod: 'OTHER', amount: '10.00', currencyCode: 'USD' }],
      });
    expect(orderRes.status).toBe(201);
    const orderNumber = orderRes.body.data.orderNumber;

    // 3. Receive Bakong Webhook
    const webhookRes = await request(app)
      .post('/api/v1/payments/webhooks/bakong')
      .send({
        transactionHash: '0x992384912839481239812938',
        externalReference: orderNumber,
        amount: '10.00',
        currency: 'USD',
        status: 'SUCCESS',
      });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.success).toBe(true);

    // 4. Verify Integrations Status
    const statusRes = await request(app)
      .get('/api/v1/payments/integrations')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.gateways.length).toBe(2);
    expect(statusRes.body.data.recentWebhookLogs.length).toBe(1);
  });
});
