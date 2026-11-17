import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ current: null as any }));

vi.mock('../src/db/prisma', async () => {
  const { createInMemoryPrisma: buildPrisma } = await import('./helpers/inMemoryPrisma');
  mockPrisma.current = buildPrisma();
  return { prisma: mockPrisma.current };
});

import { createApp } from '../src/app';

describe('Full POS & Business Management API Flows (All Modules)', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma.current.reset();
  });

  async function registerOwner(email = 'owner@bayv.com.kh', businessName = 'BayV Accessories') {
    const res = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Sokha Chan',
      email,
      phone: '+85512345678',
      password: 'Password123',
      businessName,
      businessType: 'ELECTRONICS',
      defaultCurrency: 'USD',
      defaultLanguage: 'en',
      mainBranchName: 'Phnom Penh Main',
      mainBranchCode: 'PP-01',
    });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      tenantId: res.body.data.activeTenant.id as string,
      branchId: res.body.data.activeTenant.branches[0].id as string,
      userId: res.body.data.user.id as string,
    };
  }

  it('handles roles, employees, invitations, and enforces role permissions', async () => {
    const { token, branchId } = await registerOwner();

    // 1. Create custom Cashier role
    const roleRes = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cashier',
        description: 'POS counter staff',
        permissionCodes: ['products.view', 'sales.view', 'sales.create', 'shifts.view', 'shifts.manage'],
      });
    expect(roleRes.status).toBe(201);
    const cashierRoleId = roleRes.body.data.id;

    // 2. Create employee with login account + role + branch access
    const empRes = await request(app)
      .post('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: 'EMP-002',
        name: 'Bopha Mean',
        email: 'bopha@bayv.com.kh',
        phone: '+85512888999',
        position: 'Cashier',
        branchIds: [branchId],
        roleId: cashierRoleId,
        createUserAccount: true,
        password: 'Password123',
      });
    expect(empRes.status).toBe(201);

    // 3. Invite a staff member and accept invitation
    const inviteRes = await request(app)
      .post('/api/v1/access/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'dara@bayv.com.kh',
        roleId: cashierRoleId,
      });
    expect(inviteRes.status).toBe(201);
    const devInviteToken = inviteRes.body.data.devInviteToken;
    expect(devInviteToken).toBeTruthy();

    const acceptRes = await request(app)
      .post('/api/v1/auth/accept-invitation')
      .send({
        token: devInviteToken,
        name: 'Dara Staff',
        phone: '+85512777555',
        password: 'Password123',
      });
    expect(acceptRes.status).toBe(200);

    // 4. Cashier logs in -> can view POS orders, blocked from creating categories
    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'bopha@bayv.com.kh',
      password: 'Password123',
    });
    expect(cashierLogin.status).toBe(200);
    const cashierToken = cashierLogin.body.data.tokens.accessToken;

    const allowedOrders = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(allowedOrders.status).toBe(200);

    const forbiddenCategory = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Restricted Category' });
    expect(forbiddenCategory.status).toBe(403);
    expect(forbiddenCategory.body.error.code).toBe('PERMISSION_DENIED');

    // Cannot delete role while assigned to active members
    const delUsedRole = await request(app)
      .delete(`/api/v1/access/roles/${cashierRoleId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delUsedRole.status).toBe(400);
    expect(delUsedRole.body.error.code).toBe('ROLE_IN_USE');

    // 5. Invited user (dara) can log in and receive Cashier permissions
    const daraLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'dara@bayv.com.kh',
      password: 'Password123',
    });
    expect(daraLogin.status).toBe(200);
    expect(daraLogin.body.data.activeTenant.permissions).toContain('sales.create');

    // 6. Activate & Deactivate users:
    // Owner cannot deactivate their own employee record
    const listEmps = await request(app)
      .get('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(listEmps.status).toBe(200);
    const ownerEmp = listEmps.body.data.find((e: any) => e.email === 'owner@bayv.com.kh');
    const bophaEmp = listEmps.body.data.find((e: any) => e.email === 'bopha@bayv.com.kh');

    const selfDeactivate = await request(app)
      .patch(`/api/v1/access/employees/${ownerEmp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INACTIVE' });
    expect(selfDeactivate.status).toBe(400);
    expect(selfDeactivate.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');

    // Deactivating Bopha immediately revokes her active session and blocks new login
    const deactivateBopha = await request(app)
      .patch(`/api/v1/access/employees/${bophaEmp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INACTIVE' });
    expect(deactivateBopha.status).toBe(200);
    expect(deactivateBopha.body.data.status).toBe('INACTIVE');

    const bophaOldTokenRes = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(bophaOldTokenRes.status).toBe(401);
    expect(bophaOldTokenRes.body.error.code).toBe('SESSION_REVOKED');

    const bophaBlockedLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'bopha@bayv.com.kh',
      password: 'Password123',
    });
    expect(bophaBlockedLogin.status).toBe(403);
    expect(bophaBlockedLogin.body.error.code).toBe('USER_INACTIVE');

    // Reactivating Bopha restores login and API access
    const reactivateBopha = await request(app)
      .patch(`/api/v1/access/employees/${bophaEmp.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' });
    expect(reactivateBopha.status).toBe(200);
    expect(reactivateBopha.body.data.status).toBe('ACTIVE');

    const bophaRestoredLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'bopha@bayv.com.kh',
      password: 'Password123',
    });
    expect(bophaRestoredLogin.status).toBe(200);
    const restoredBophaToken = bophaRestoredLogin.body.data.tokens.accessToken;

    // 7. FR-03: Edit & delete custom roles, protect system role, reassign roles
    const listRolesRes = await request(app)
      .get('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`);
    expect(listRolesRes.status).toBe(200);
    const systemOwnerRole = listRolesRes.body.data.find((r: any) => r.isSystem);
    expect(systemOwnerRole).toBeTruthy();

    // System role cannot be modified or deleted
    const editSystemRole = await request(app)
      .patch(`/api/v1/access/roles/${systemOwnerRole.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked Owner', permissionCodes: ['sales.view'] });
    expect(editSystemRole.status).toBe(400);
    expect(editSystemRole.body.error.code).toBe('SYSTEM_ROLE_PROTECTED');

    // Edit custom role to rename & add products.create permission
    const editRoleRes = await request(app)
      .patch(`/api/v1/access/roles/${cashierRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Senior Cashier',
        description: 'Can also create catalog categories',
        permissionCodes: [
          'products.view',
          'products.create',
          'sales.view',
          'sales.create',
          'shifts.view',
          'shifts.manage',
        ],
      });
    expect(editRoleRes.status).toBe(200);
    expect(editRoleRes.body.data.name).toBe('Senior Cashier');
    expect(editRoleRes.body.data.permissions).toContain('products.create');

    // Cashier now immediately gains products.create access
    const allowedCatNow = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${restoredBophaToken}`)
      .send({ name: 'Counter Accessories' });
    expect(allowedCatNow.status).toBe(201);

    // Create a second custom role, reassign both employees to it, then delete Senior Cashier
    const auditorRoleRes = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Auditor',
        description: 'Read-only sales & reports',
        permissionCodes: ['sales.view', 'reports.view'],
      });
    expect(auditorRoleRes.status).toBe(201);
    const auditorRoleId = auditorRoleRes.body.data.id;

    const daraEmp = listEmps.body.data.find((e: any) => e.email === 'dara@bayv.com.kh');
    expect(daraEmp).toBeTruthy();

    for (const empId of [bophaEmp.id, daraEmp.id]) {
      const reassignRes = await request(app)
        .patch(`/api/v1/access/employees/${empId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleIds: [auditorRoleId], branchIds: [branchId] });
      expect(reassignRes.status).toBe(200);
    }

    // Bopha is now blocked from products.create again after role reassignment
    const blockedCatAfterReassign = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${restoredBophaToken}`)
      .send({ name: 'Should Be Blocked' });
    expect(blockedCatAfterReassign.status).toBe(403);
    expect(blockedCatAfterReassign.body.error.code).toBe('PERMISSION_DENIED');

    // Now Senior Cashier has 0 assigned members and can be deleted cleanly
    const delFreedRole = await request(app)
      .delete(`/api/v1/access/roles/${cashierRoleId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delFreedRole.status).toBe(200);
  });

  it('executes full catalog, customer, shift, split USD+KHR POS order, return, purchasing, and inventory workflows', async () => {
    const { token, branchId } = await registerOwner();

    // 1. Setup Catalog (Category, Unit, Supplier, Product with opening stock)
    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Phone Accessories' });
    expect(catRes.status).toBe(201);
    const categoryId = catRes.body.data.id;

    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Piece', abbreviation: 'pcs' });
    expect(unitRes.status).toBe(201);
    const unitId = unitRes.body.data.id;

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Phnom Penh Tech Wholesale', phone: '+85523111222' });
    expect(supRes.status).toBe(201);
    const supplierId = supRes.body.data.id;

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        unitId,
        sku: 'CAB-TYPEC',
        barcode: '885000123456',
        name: 'USB-C Fast Cable',
        costPrice: '3.00',
        sellingPrice: '10.00',
        lowStockAlert: '5',
        trackInventory: true,
        openingStock: '10',
        branchId,
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id;

    // Duplicate SKU rejected
    const dupSku = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        unitId,
        sku: 'CAB-TYPEC',
        name: 'Dup SKU',
        costPrice: '1.00',
        sellingPrice: '2.00',
      });
    expect(dupSku.status).toBe(409);

    // 2. Customer + Open Shift
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rithy Seng', phone: '+85512654321' });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.id;

    const shiftRes = await request(app)
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, openingCash: '100.00' });
    expect(shiftRes.status).toBe(201);
    const shiftId = shiftRes.body.data.id;

    // 3. Reject non-cash overpayment & insufficient payment
    const badOverpay = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '1' }],
        payments: [{ paymentMethod: 'ABA', amount: '15.00', currencyCode: 'USD' }],
      });
    expect(badOverpay.status).toBe(400);
    expect(badOverpay.body.error.code).toBe('OVERPAYMENT_NOT_SUPPORTED');

    const badUnderpay = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '2' }],
        payments: [{ paymentMethod: 'CASH', amount: '10.00', currencyCode: 'USD' }],
      });
    expect(badUnderpay.status).toBe(400);
    expect(badUnderpay.body.error.code).toBe('INSUFFICIENT_PAYMENT');

    // 4. Complete POS sale with split USD CASH + KHR ABA payment (total = $30, paid = $15 CASH + 82,000 KHR ($20) ABA => $35 paid, $5 change)
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        customerId,
        shiftId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '3' }],
        payments: [
          { paymentMethod: 'CASH', amount: '15.00', currencyCode: 'USD' },
          { paymentMethod: 'ABA', amount: '82000', currencyCode: 'KHR', referenceNumber: 'ABA-TXN-1001' },
        ],
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.totalAmount).toBe('30.00');
    expect(order.paidAmount).toBe('35.00');
    expect(order.changeAmount).toBe('5.00');
    expect(order.id).toBeDefined();
    expect(order.tenantId).toBeDefined();
    expect(order.branchId).toBe(branchId);
    expect(order.customerId).toBe(customerId);
    expect(order.cashierEmployeeId).toBeDefined();
    expect(order.shiftId).toBe(shiftId);
    expect(order.orderNumber).toBeDefined();
    expect(Number(order.subtotal)).toBe(30);
    expect(Number(order.discountAmount)).toBe(0);
    expect(Number(order.taxAmount)).toBe(0);
    expect(order.currencyCode).toBe('USD');
    expect(order.exchangeRate).toBeDefined();
    expect(order.status).toBe('COMPLETED');
    expect(order.completedAt).toBeDefined();
    expect(order.createdAt).toBeDefined();
    expect(order.updatedAt).toBeDefined();

    // Verify orders list endpoint with pagination and search
    const ordersListRes = await request(app)
      .get(`/api/v1/orders?branchId=${branchId}&status=COMPLETED&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(ordersListRes.status).toBe(200);
    expect(ordersListRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(ordersListRes.body.pagination).toBeDefined();
    expect(ordersListRes.body.pagination.page).toBe(1);
    expect(ordersListRes.body.pagination.limit).toBe(10);
    expect(ordersListRes.body.pagination.total).toBeGreaterThanOrEqual(1);

    // Verify single order detail endpoint includes shift and items
    const singleOrderRes = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singleOrderRes.status).toBe(200);
    expect(singleOrderRes.body.data.orderNumber).toBe(order.orderNumber);
    expect(singleOrderRes.body.data.shift).toBeDefined();
    expect(singleOrderRes.body.data.orderItems.length).toBe(1);
    expect(singleOrderRes.body.data.payments.length).toBe(2);

    const orderItemId = order.orderItems[0].id;

    // Verify order_items listing endpoint with pagination and search
    const orderItemsListRes = await request(app)
      .get(`/api/v1/orders/items?branchId=${branchId}&page=1&limit=10&search=${encodeURIComponent(order.orderItems[0].skuSnapshot)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderItemsListRes.status).toBe(200);
    expect(orderItemsListRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(orderItemsListRes.body.pagination).toBeDefined();
    expect(orderItemsListRes.body.pagination.page).toBe(1);
    expect(orderItemsListRes.body.pagination.limit).toBe(10);
    expect(orderItemsListRes.body.pagination.total).toBeGreaterThanOrEqual(1);

    const verifiedItem = orderItemsListRes.body.data.find((item: any) => item.id === orderItemId);
    expect(verifiedItem).toBeDefined();
    expect(verifiedItem.orderId).toBe(order.id);
    expect(verifiedItem.productId).toBe(productId);
    expect(verifiedItem.productNameSnapshot).toBeDefined();
    expect(verifiedItem.skuSnapshot).toBeDefined();
    expect(Number(verifiedItem.quantity)).toBeGreaterThan(0);
    expect(Number(verifiedItem.unitPrice)).toBeGreaterThan(0);
    expect(Number(verifiedItem.unitCostSnapshot)).toBeGreaterThanOrEqual(0);
    expect(Number(verifiedItem.discountAmount)).toBeGreaterThanOrEqual(0);
    expect(Number(verifiedItem.taxAmount)).toBeGreaterThanOrEqual(0);
    expect(Number(verifiedItem.lineTotal)).toBeGreaterThan(0);

    // Verify order-specific line items endpoint
    const orderSpecificItemsRes = await request(app)
      .get(`/api/v1/orders/${order.id}/items`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderSpecificItemsRes.status).toBe(200);
    expect(orderSpecificItemsRes.body.data.length).toBe(1);
    expect(orderSpecificItemsRes.body.data[0].id).toBe(orderItemId);

    // Net cash collected for shift = 15.00 cash - 5.00 change = 10.00 -> expectedCash = 110.00
    const curShift = await request(app)
      .get(`/api/v1/shifts/current?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(curShift.body.data.expectedCash).toBe('110.00');

    // Stock balance should drop from 10 to 7
    const balancesAfterSale = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(balancesAfterSale.body.data[0].quantity).toBe('7.0000');

    // 5. Partial Sales Return (return 1 unit, restock 1 unit -> stock = 8, cash refund $10 -> shift expectedCash = 100.00)
    const retRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Customer bought extra',
        refundMethod: 'CASH',
        items: [{ orderItemId, quantity: '1', restockQuantity: '1' }],
      });
    expect(retRes.status).toBe(201);
    expect(retRes.body.data.refundAmount).toBe('10.00');

    // Over-return (> remaining 2) rejected
    const overRet = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Too many',
        refundMethod: 'CASH',
        items: [{ orderItemId, quantity: '3', restockQuantity: '0' }],
      });
    expect(overRet.status).toBe(400);
    expect(overRet.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');

    // Customer profile & purchase history verification
    const customerListRes = await request(app)
      .get('/api/v1/customers?search=Rithy')
      .set('Authorization', `Bearer ${token}`);
    expect(customerListRes.status).toBe(200);
    expect(customerListRes.body.data.length).toBe(1);
    expect(customerListRes.body.data[0]._count.orders).toBe(1);
    expect(customerListRes.body.data[0].orders.length).toBe(1);

    const customerDetailRes = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(customerDetailRes.status).toBe(200);
    expect(customerDetailRes.body.data.name).toBe('Rithy Seng');
    expect(customerDetailRes.body.data.orders.length).toBe(1);
    expect(customerDetailRes.body.data.orders[0].orderNumber).toBe(order.orderNumber);

    const updateCustRes = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ address: 'Phnom Penh, Cambodia', notes: 'VIP Gold Member' });
    expect(updateCustRes.status).toBe(200);
    expect(updateCustRes.body.data.address).toBe('Phnom Penh, Cambodia');
    expect(updateCustRes.body.data.notes).toBe('VIP Gold Member');

    // 5b. Customer uniqueness, duplicate rejection, pagination, and archival safeguard
    // Duplicate customerCode within same tenant should be rejected
    const dupCustCodeRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Duplicate Code Person', customerCode: custRes.body.data.customerCode });
    expect(dupCustCodeRes.status).toBe(409);
    expect(dupCustCodeRes.body.error.code).toBe('CUSTOMER_CODE_TAKEN');

    // Create a secondary customer
    const secondCustRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Dara Chan',
        customerCode: 'CUST-0002',
        phone: '+85598765432',
        email: 'dara@example.com',
        address: 'Siem Reap, Cambodia',
        notes: 'Silver member',
      });
    expect(secondCustRes.status).toBe(201);
    const secondCustId = secondCustRes.body.data.id;

    // Trying to update second customer's code to first customer's code should be rejected
    const dupUpdateCustRes = await request(app)
      .patch(`/api/v1/customers/${secondCustId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ customerCode: custRes.body.data.customerCode });
    expect(dupUpdateCustRes.status).toBe(409);
    expect(dupUpdateCustRes.body.error.code).toBe('CUSTOMER_CODE_TAKEN');

    // Pagination and search on customers
    const pagedCustomers = await request(app)
      .get('/api/v1/customers?page=1&limit=1&status=ACTIVE')
      .set('Authorization', `Bearer ${token}`);
    expect(pagedCustomers.status).toBe(200);
    expect(pagedCustomers.body.data).toHaveLength(1);
    expect(pagedCustomers.body.pagination).toBeDefined();
    expect(pagedCustomers.body.pagination.page).toBe(1);
    expect(pagedCustomers.body.pagination.limit).toBe(1);
    expect(pagedCustomers.body.pagination.total).toBe(2);

    // Archival safeguard: customer with orders is soft-archived to INACTIVE
    const archiveCustRes = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archiveCustRes.status).toBe(200);
    expect(archiveCustRes.body.data.status).toBe('INACTIVE');

    // Second customer has no orders, can be deleted permanently
    const deleteCustRes = await request(app)
      .delete(`/api/v1/customers/${secondCustId}?mode=permanent`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteCustRes.status).toBe(200);

    // 6. Purchase workflow (create ORDERED -> receive -> record payment -> reject overpayment)
    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId,
        currencyCode: 'USD',
        receiveImmediately: false,
        items: [{ productId, quantity: '10', unitCost: '3.00' }],
        initialPayment: { amount: '10.00', currencyCode: 'USD', paymentMethod: 'ACLEDA' },
      });
    expect(purRes.status).toBe(201);
    const purchaseId = purRes.body.data.id;
    expect(purRes.body.data.status).toBe('ORDERED');

    const receiveRes = await request(app)
      .post(`/api/v1/purchases/${purchaseId}/receive`)
      .set('Authorization', `Bearer ${token}`);
    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.status).toBe('RECEIVED');

    const payPurRes = await request(app)
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '20.00', currencyCode: 'USD', paymentMethod: 'ABA' });
    expect(payPurRes.status).toBe(201);

    const overPayPur = await request(app)
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '1.00', currencyCode: 'USD', paymentMethod: 'CASH' });
    expect(overPayPur.status).toBe(400);
    expect(overPayPur.body.error.code).toBe('OVERPAYMENT');

    // Stock after return (8) + purchase (10) = 18
    // 7. Manual stock adjustment OUT 15 units -> stock becomes 3 (<= lowStockAlert 5)
    const adjRes = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Damaged batch write-off',
        items: [{ productId, direction: 'OUT', quantity: '15' }],
      });
    expect(adjRes.status).toBe(201);

    // Stock OUT exceeding remaining 3 rejected
    const badAdj = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Invalid write-off',
        items: [{ productId, direction: 'OUT', quantity: '10' }],
      });
    expect(badAdj.status).toBe(400);
    expect(badAdj.body.error.code).toBe('INSUFFICIENT_STOCK');

    const lowStockRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}&lowStockOnly=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(lowStockRes.status).toBe(200);
    expect(lowStockRes.body.data).toHaveLength(1);
    expect(lowStockRes.body.data[0].quantity).toBe('3.0000');
    expect(lowStockRes.body.data[0].isLowStock).toBe(true);

    const movementsRes = await request(app)
      .get(`/api/v1/inventory/movements?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(movementsRes.status).toBe(200);
    const movementTypes = movementsRes.body.data.map((m: any) => m.movementType);
    expect(movementTypes).toEqual(
      expect.arrayContaining(['opening_stock', 'sale_out', 'sale_return_in', 'purchase_in', 'adjustment_out']),
    );

    // 8. Close shift with cash discrepancy check (expected = 100.00, actual = 98.50 -> diff = -1.50)
    const closeRes = await request(app)
      .post(`/api/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualCash: '98.50' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.cashDifference).toBe('-1.50');
  });

  it('handles finance (expense types, expenses, incomes), reports, settings, exchange rates, and platform admin access', async () => {
    const { token, tenantId, branchId, userId } = await registerOwner();

    // 1. Finance: expense type + expense (KHR) + additional income (USD)
    const etRes = await request(app)
      .post('/api/v1/finance/expense-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Utilities', description: 'Electricity & Water' });
    expect(etRes.status).toBe(201);
    const expenseTypeId = etRes.body.data.id;

    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        expenseTypeId,
        description: 'EDC Electricity Bill',
        amount: '41000',
        currencyCode: 'KHR',
        paymentMethod: 'ABA',
      });
    expect(expRes.status).toBe(201);

    const incRes = await request(app)
      .post('/api/v1/finance/incomes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        description: 'Display Booth Rental',
        amount: '25.00',
        currencyCode: 'USD',
      });
    expect(incRes.status).toBe(201);

    const summaryRes = await request(app)
      .get(`/api/v1/finance/summary?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.additionalIncome).toBe('25.00');
    expect(summaryRes.body.data.totalExpenses).toBe('10.00');
    expect(summaryRes.body.data.netCashflow).toBe('15.00');

    // 2. Reports & Settings & Exchange Rates
    const dashRes = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.additionalIncome).toBe('25.00');
    expect(dashRes.body.data.totalSales).toBeDefined();
    expect(dashRes.body.data.revenue).toBeDefined();
    expect(dashRes.body.data.totalOrders).toBeDefined();
    expect(dashRes.body.data.totalExpenses).toBe('10.00');
    expect(dashRes.body.data.estimatedProfit).toBeDefined();
    expect(dashRes.body.data.lowStockCount).toBeDefined();
    expect(Array.isArray(dashRes.body.data.lowStockItems)).toBe(true);
    expect(Array.isArray(dashRes.body.data.recentTransactions)).toBe(true);
    expect(Array.isArray(dashRes.body.data.salesChart)).toBe(true);

    const [salesRep, prodRep, invRep, purRep] = await Promise.all([
      request(app).get('/api/v1/reports/sales').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/v1/reports/products').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/v1/reports/inventory').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/v1/reports/purchases').set('Authorization', `Bearer ${token}`),
    ]);
    expect(salesRep.status).toBe(200);
    expect(prodRep.status).toBe(200);
    expect(invRep.status).toBe(200);
    expect(purRep.status).toBe(200);

    const putSet = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { taxRatePercent: '10', receiptFooter: 'BayV Thank You!' } });
    expect(putSet.status).toBe(200);
    expect(putSet.body.data.settings.taxRatePercent).toBe('10');

    const rateRes = await request(app)
      .post('/api/v1/settings/exchange-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ baseCurrency: 'USD', targetCurrency: 'KHR', rate: '4050' });
    expect(rateRes.status).toBe(201);
    expect(rateRes.body.data.rate).toBe('4050');

    // 3. Platform Admin guard
    const nonAdminPlatform = await request(app)
      .get('/api/v1/platform/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(nonAdminPlatform.status).toBe(403);
    expect(nonAdminPlatform.body.error.code).toBe('PLATFORM_ADMIN_ONLY');

    // Promote user in DB to platform admin and re-login
    await mockPrisma.current.user.update({
      where: { id: userId },
      data: { isPlatformAdmin: true },
    });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@bayv.com.kh',
      password: 'Password123',
    });
    const adminToken = adminLogin.body.data.tokens.accessToken;

    const adminOverview = await request(app)
      .get('/api/v1/platform/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminOverview.status).toBe(200);
    expect(adminOverview.body.data.tenantCount).toBe(1);

    const suspendRes = await request(app)
      .patch(`/api/v1/platform/tenants/${tenantId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED' });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe('SUSPENDED');

    // 4. Platform: Subscription Plans
    const plansRes = await request(app)
      .get('/api/v1/platform/plans')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(plansRes.status).toBe(200);
    expect(Array.isArray(plansRes.body.data)).toBe(true);

    const createPlanRes = await request(app)
      .post('/api/v1/platform/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tier: 'CUSTOM_MEGA',
        name: 'Custom Mega Plan',
        description: 'For 50+ retail chains',
        monthlyPrice: 199,
        yearlyPrice: 1990,
        maxBranches: 50,
        maxEmployees: 200,
        maxProducts: 50000,
        features: ['pos', 'sales', 'inventory', 'transfers', 'analytics'],
      });
    expect(createPlanRes.status).toBe(200);
    expect(createPlanRes.body.data.tier).toBe('CUSTOM_MEGA');

    // 5. Platform: Subscriptions Ledger
    const subsRes = await request(app)
      .get('/api/v1/platform/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(subsRes.status).toBe(200);
    expect(Array.isArray(subsRes.body.data)).toBe(true);

    // 6. Platform: Users Directory & Admin Roles
    const usersRes = await request(app)
      .get('/api/v1/platform/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(usersRes.status).toBe(200);
    expect(Array.isArray(usersRes.body.data)).toBe(true);
    expect(usersRes.body.data.length).toBeGreaterThanOrEqual(1);

    // 7. Platform: System Monitoring & Telemetry
    const monRes = await request(app)
      .get('/api/v1/platform/monitoring')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(monRes.status).toBe(200);
    expect(monRes.body.data.system.status).toBe('OPERATIONAL');
    expect(monRes.body.data.database.status).toBe('CONNECTED');

    // 8. Platform: Activity Logs Audit Trail
    const logsRes = await request(app)
      .get('/api/v1/platform/activity-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logsRes.status).toBe(200);
    expect(Array.isArray(logsRes.body.data)).toBe(true);

    // 9. Strict Tenant Isolation Verification
    // Regular tenant owner cannot access another tenant's information or platform routes
    const regularOwner = await registerOwner('regular-tenant@bayv.com.kh', 'Regular Mart');
    const tenantOwnerAccess = await request(app)
      .get('/api/v1/platform/monitoring')
      .set('Authorization', `Bearer ${regularOwner.token}`);
    expect(tenantOwnerAccess.status).toBe(403);
    expect(tenantOwnerAccess.body.error.code).toBe('PLATFORM_ADMIN_ONLY');
  });

  it('FR-04: manages categories, units, suppliers, products, SKU/barcode uniqueness, search/filter, and archiving', async () => {
    const { token, branchId } = await registerOwner('catalog-owner@bayv.com.kh', 'Catalog Store');
    const { token: otherToken } = await registerOwner('other-catalog@bayv.com.kh', 'Other Store');

    // 1. Categories CRUD (parent + update + cross-tenant isolation)
    const cat1Res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Beverages', description: 'Cold & hot drinks' });
    expect(cat1Res.status).toBe(201);
    const bevCategoryId = cat1Res.body.data.id;

    const cat2Res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Snacks', parentId: bevCategoryId });
    expect(cat2Res.status).toBe(201);
    const snacksCategoryId = cat2Res.body.data.id;

    const patchCatRes = await request(app)
      .patch(`/api/v1/categories/${snacksCategoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Packaged Snacks', description: 'Chips & cookies' });
    expect(patchCatRes.status).toBe(200);
    expect(patchCatRes.body.data.name).toBe('Packaged Snacks');

    const otherCatRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Foreign Category' });
    expect(otherCatRes.status).toBe(201);
    const foreignCategoryId = otherCatRes.body.data.id;

    // 2. Units CRUD
    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bottle', abbreviation: 'btl' });
    expect(unitRes.status).toBe(201);
    const unitId = unitRes.body.data.id;

    const patchUnitRes = await request(app)
      .patch(`/api/v1/units/${unitId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Glass Bottle', abbreviation: 'btl' });
    expect(patchUnitRes.status).toBe(200);
    expect(patchUnitRes.body.data.name).toBe('Glass Bottle');

    // 3. Suppliers CRUD + search
    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mekong Beverage Distributor',
        contactPerson: 'Vanna Sok',
        phone: '+85512999888',
        email: 'vanna@mekong.kh',
      });
    expect(supRes.status).toBe(201);
    const supplierId = supRes.body.data.id;

    const patchSupRes = await request(app)
      .patch(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contactPerson: 'Vanna Sokha', address: 'St. 271, Phnom Penh' });
    expect(patchSupRes.status).toBe(200);
    expect(patchSupRes.body.data.contactPerson).toBe('Vanna Sokha');

    const supSearchRes = await request(app)
      .get('/api/v1/suppliers?search=Mekong')
      .set('Authorization', `Bearer ${token}`);
    expect(supSearchRes.status).toBe(200);
    expect(supSearchRes.body.data).toHaveLength(1);

    // 4. Create products with SKU, barcode, cost & selling/wholesale prices
    const prod1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: bevCategoryId,
        unitId,
        sku: 'DRK-WATER-500',
        barcode: '8851110005001',
        name: 'Mineral Water 500ml',
        costPrice: '0.20',
        sellingPrice: '0.50',
        wholesalePrice: '0.35',
        lowStockAlert: '10',
        openingStock: '24',
        branchId,
      });
    expect(prod1Res.status).toBe(201);
    const waterId = prod1Res.body.data.id;

    const prod2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: snacksCategoryId,
        unitId,
        sku: 'SNK-CHIPS-01',
        barcode: '8851110009002',
        name: 'Seaweed Chips',
        costPrice: '0.80',
        sellingPrice: '1.50',
      });
    expect(prod2Res.status).toBe(201);
    const chipsId = prod2Res.body.data.id;

    // Duplicate SKU & duplicate barcode rejected within tenant
    const dupBarcodeRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: bevCategoryId,
        unitId,
        sku: 'DRK-UNIQUE-99',
        barcode: '8851110005001',
        name: 'Duplicate Barcode Test',
        costPrice: '0.20',
        sellingPrice: '0.50',
      });
    expect(dupBarcodeRes.status).toBe(409);
    expect(dupBarcodeRes.body.error.code).toBe('BARCODE_TAKEN');

    const dupSkuRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: bevCategoryId,
        unitId,
        sku: 'DRK-WATER-500',
        barcode: '8859999999999',
        name: 'Duplicate SKU Test',
        costPrice: '0.20',
        sellingPrice: '0.50',
      });
    expect(dupSkuRes.status).toBe(409);
    expect(dupSkuRes.body.error.code).toBe('SKU_TAKEN');

    // Cross-tenant category rejected on update
    const badCatUpdate = await request(app)
      .patch(`/api/v1/products/${waterId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: foreignCategoryId });
    expect(badCatUpdate.status).toBe(404);
    expect(badCatUpdate.body.error.code).toBe('CATEGORY_NOT_FOUND');

    // Update product SKU, barcode, cost & selling price
    const updProdRes = await request(app)
      .patch(`/api/v1/products/${waterId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sku: 'DRK-WATER-550',
        barcode: '8851110005509',
        costPrice: '0.25',
        sellingPrice: '0.60',
        wholesalePrice: '0.40',
      });
    expect(updProdRes.status).toBe(200);
    expect(updProdRes.body.data.sku).toBe('DRK-WATER-550');

    // Duplicate SKU & barcode on update rejected in same tenant
    const dupSkuUpdate = await request(app)
      .patch(`/api/v1/products/${chipsId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'DRK-WATER-550' });
    expect(dupSkuUpdate.status).toBe(409);
    expect(dupSkuUpdate.body.error.code).toBe('SKU_TAKEN');

    const dupBarUpdate = await request(app)
      .patch(`/api/v1/products/${chipsId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ barcode: '8851110005509' });
    expect(dupBarUpdate.status).toBe(409);
    expect(dupBarUpdate.body.error.code).toBe('BARCODE_TAKEN');

    // Cross-tenant duplicate SKU/barcode allowed (strict tenant isolation)
    const foreignCatRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Foreign Cat' });
    const foreignUnitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Foreign Unit', abbreviation: 'fu' });
    const crossTenantProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        categoryId: foreignCatRes.body.data.id,
        unitId: foreignUnitRes.body.data.id,
        sku: 'DRK-WATER-550', // Same SKU in different tenant
        barcode: '8851110005509', // Same Barcode in different tenant
        name: 'Isolated Store Water',
        costPrice: '0.25',
        sellingPrice: '0.60',
      });
    expect(crossTenantProd.status).toBe(201);
    expect(crossTenantProd.body.data.sku).toBe('DRK-WATER-550');

    // Pagination query test
    const pagedProducts = await request(app)
      .get('/api/v1/products?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`);
    expect(pagedProducts.status).toBe(200);
    expect(pagedProducts.body.data).toHaveLength(1);
    expect(pagedProducts.body.pagination).toBeDefined();
    expect(pagedProducts.body.pagination.page).toBe(1);
    expect(pagedProducts.body.pagination.limit).toBe(1);
    expect(pagedProducts.body.pagination.total).toBe(2);
    expect(pagedProducts.body.pagination.totalPages).toBe(2);

    // 5. Search by name / SKU / barcode & Filter by category & status
    const searchByBarcode = await request(app)
      .get('/api/v1/products?search=8851110005509')
      .set('Authorization', `Bearer ${token}`);
    expect(searchByBarcode.status).toBe(200);
    expect(searchByBarcode.body.data).toHaveLength(1);
    expect(searchByBarcode.body.data[0].id).toBe(waterId);

    const filterByCat = await request(app)
      .get(`/api/v1/products?categoryId=${snacksCategoryId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(filterByCat.status).toBe(200);
    expect(filterByCat.body.data).toHaveLength(1);
    expect(filterByCat.body.data[0].id).toBe(chipsId);

    // 6. Archive & filter by ARCHIVED / ACTIVE, then restore
    const archRes = await request(app)
      .delete(`/api/v1/products/${chipsId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archRes.status).toBe(200);
    expect(archRes.body.data.status).toBe('ARCHIVED');

    const activeOnly = await request(app)
      .get('/api/v1/products?status=ACTIVE')
      .set('Authorization', `Bearer ${token}`);
    expect(activeOnly.body.data.map((p: any) => p.id)).toEqual([waterId]);

    const archivedOnly = await request(app)
      .get('/api/v1/products?status=ARCHIVED')
      .set('Authorization', `Bearer ${token}`);
    expect(archivedOnly.body.data.map((p: any) => p.id)).toEqual([chipsId]);

    const restoreRes = await request(app)
      .patch(`/api/v1/products/${chipsId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data.status).toBe('ACTIVE');
  });

  it('FR-05: supports POS search (name/SKU/barcode), discounts, subtotal/total, split payments, stock guard, and sales history receipts', async () => {
    const { token, branchId } = await registerOwner('pos-owner@bayv.com.kh', 'POS Market');

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Coffee' });
    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cup', abbreviation: 'cup' });

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'COF-LATTE',
        barcode: '8852220001112',
        name: 'Iced Latte',
        costPrice: '1.20',
        sellingPrice: '3.00',
        trackInventory: true,
        openingStock: '5',
        branchId,
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id;

    // 1. Search by name, SKU, barcode
    for (const q of ['Latte', 'COF-LATTE', '8852220001112']) {
      const searchRes = await request(app)
        .get(`/api/v1/products?status=ACTIVE&branchId=${branchId}&search=${encodeURIComponent(q)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data).toHaveLength(1);
      expect(searchRes.body.data[0].id).toBe(productId);
    }

    // 2. Reject discount exceeding subtotal & reject overselling tracked stock
    const badDiscount = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        discountAmount: '20.00',
        items: [{ productId, quantity: '2' }],
        payments: [{ paymentMethod: 'CASH', amount: '1.00', currencyCode: 'USD' }],
      });
    expect(badDiscount.status).toBe(400);
    expect(badDiscount.body.error.code).toBe('INVALID_DISCOUNT');

    const badStock = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '10' }],
        payments: [{ paymentMethod: 'CASH', amount: '30.00', currencyCode: 'USD' }],
      });
    expect(badStock.status).toBe(400);
    expect(badStock.body.error.code).toBe('INSUFFICIENT_STOCK');

    // 3. Complete sale with line discount ($1), order discount ($1), tax ($0.80) and split CASH + ACLEDA
    // 4 * $3.00 = $12.00 - $1.00 item discount => subtotal $11.00 - $1.00 order discount + $0.80 tax = $10.80
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        discountAmount: '1.00',
        taxAmount: '0.80',
        items: [{ productId, quantity: '4', discountAmount: '1.00' }],
        payments: [
          { paymentMethod: 'ACLEDA', amount: '5.80', currencyCode: 'USD', referenceNumber: 'ACL-7788' },
          { paymentMethod: 'CASH', amount: '10.00', currencyCode: 'USD' },
        ],
      });
    expect(orderRes.status).toBe(201);
    const created = orderRes.body.data;
    expect(created.subtotal).toBe('11.00');
    expect(created.discountAmount).toBe('1.00');
    expect(created.taxAmount).toBe('0.80');
    expect(created.totalAmount).toBe('10.80');
    expect(created.paidAmount).toBe('15.80');
    expect(created.changeAmount).toBe('5.00');
    expect(created.payments).toHaveLength(2);

    // 4. View sales history & receipt detail
    const historyRes = await request(app)
      .get(`/api/v1/orders?branchId=${branchId}&status=COMPLETED&search=${created.orderNumber}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data).toHaveLength(1);

    const detailRes = await request(app)
      .get(`/api/v1/orders/${created.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.orderItems[0].skuSnapshot).toBe('COF-LATTE');
    expect(detailRes.body.data.payments).toHaveLength(2);
  });

  it('FR-06: handles Cash, ABA, ACLEDA, Other, multi-currency split payments, payment history filters, and refund tracking', async () => {
    const { token, branchId } = await registerOwner('pay-owner@bayv.com.kh', 'Payment Mart');

    const branch2Res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Siem Reap', branchCode: 'SR-01' });
    expect(branch2Res.status).toBe(201);
    const branch2Id = branch2Res.body.data.id;

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Accessories' });
    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Piece', abbreviation: 'pcs' });

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'CAB-USBC',
        name: 'USB-C Cable',
        costPrice: '3.00',
        sellingPrice: '10.00',
        trackInventory: true,
        openingStock: '20',
        branchId,
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id;

    // 1. Reject non-cash overpayment even inside a split payment ($12 ABA + $5 CASH on $10 order)
    const badOverpay = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '1' }],
        payments: [
          { paymentMethod: 'ABA', amount: '12.00', currencyCode: 'USD', referenceNumber: 'ABA-OVER' },
          { paymentMethod: 'CASH', amount: '5.00', currencyCode: 'USD' },
        ],
      });
    expect(badOverpay.status).toBe(400);
    expect(badOverpay.body.error.code).toBe('OVERPAYMENT_NOT_SUPPORTED');

    // 2. Complete 2-unit ($20.00) order using split payments across all 4 methods and both USD & KHR (rate = 4100)
    // ABA $5.00 USD + ACLEDA 20500 KHR ($5.00) + OTHER $4.00 USD + CASH 41000 KHR ($10.00) => $24.00 paid, $4.00 cash change
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '2' }],
        payments: [
          { paymentMethod: 'ABA', amount: '5.00', currencyCode: 'USD', referenceNumber: 'ABA-9901' },
          { paymentMethod: 'ACLEDA', amount: '20500', currencyCode: 'KHR', referenceNumber: 'ACL-4402' },
          { paymentMethod: 'OTHER', amount: '4.00', currencyCode: 'USD', referenceNumber: 'WING-1122' },
          { paymentMethod: 'CASH', amount: '41000', currencyCode: 'KHR' },
        ],
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.totalAmount).toBe('20.00');
    expect(order.paidAmount).toBe('24.00');
    expect(order.changeAmount).toBe('4.00');
    expect(order.payments).toHaveLength(4);

    // 3. Payment history filtering by method, currency, branch, and reference/order search
    const abaPayments = await request(app)
      .get('/api/v1/payments?paymentMethod=ABA&search=ABA-9901')
      .set('Authorization', `Bearer ${token}`);
    expect(abaPayments.status).toBe(200);
    expect(abaPayments.body.data).toHaveLength(1);
    expect(abaPayments.body.data[0].referenceNumber).toBe('ABA-9901');
    expect(abaPayments.body.data[0].order.currencyCode).toBe('USD');

    const khrPayments = await request(app)
      .get(`/api/v1/payments?branchId=${branchId}&currencyCode=KHR`)
      .set('Authorization', `Bearer ${token}`);
    expect(khrPayments.status).toBe(200);
    expect(khrPayments.body.data).toHaveLength(2);

    const otherBranchPayments = await request(app)
      .get(`/api/v1/payments?branchId=${branch2Id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(otherBranchPayments.status).toBe(200);
    expect(otherBranchPayments.body.data).toHaveLength(0);

    // Verify payments listing with pagination and orderId filter
    const paginatedPaymentsRes = await request(app)
      .get(`/api/v1/payments?orderId=${order.id}&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(paginatedPaymentsRes.status).toBe(200);
    expect(paginatedPaymentsRes.body.data).toHaveLength(4);
    expect(paginatedPaymentsRes.body.pagination).toBeDefined();
    expect(paginatedPaymentsRes.body.pagination.page).toBe(1);
    expect(paginatedPaymentsRes.body.pagination.limit).toBe(10);
    expect(paginatedPaymentsRes.body.pagination.total).toBe(4);

    // Verify all 12 schema fields of payments
    const verifiedPayment = paginatedPaymentsRes.body.data.find((p: any) => p.paymentMethod === 'ABA');
    expect(verifiedPayment).toBeDefined();
    expect(verifiedPayment.id).toBeDefined();
    expect(verifiedPayment.tenantId).toBeDefined();
    expect(verifiedPayment.orderId).toBe(order.id);
    expect(verifiedPayment.paymentMethod).toBe('ABA');
    expect(Number(verifiedPayment.amount)).toBe(5);
    expect(verifiedPayment.currencyCode).toBe('USD');
    expect(Number(verifiedPayment.exchangeRate)).toBeGreaterThanOrEqual(1);
    expect(Number(verifiedPayment.amountInOrderCurrency)).toBe(5);
    expect(verifiedPayment.referenceNumber).toBe('ABA-9901');
    expect(verifiedPayment.status).toBe('COMPLETED');
    expect(verifiedPayment.paidAt).toBeDefined();
    expect(verifiedPayment.createdAt).toBeDefined();

    // Verify order-specific payments endpoint
    const orderPaymentsRes = await request(app)
      .get(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderPaymentsRes.status).toBe(200);
    expect(orderPaymentsRes.body.data).toHaveLength(4);
    expect(orderPaymentsRes.body.pagination).toBeDefined();

    // 4. Refund tracking via ABA + return filtering + order detail saleReturns linkage
    const retRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Defective cable',
        refundMethod: 'ABA',
        items: [{ orderItemId: order.orderItems[0].id, quantity: '1', restockQuantity: '1' }],
      });
    expect(retRes.status).toBe(201);
    expect(retRes.body.data.refundAmount).toBe('10.00');
    expect(retRes.body.data.refundMethod).toBe('ABA');

    const filteredReturns = await request(app)
      .get(`/api/v1/returns?branchId=${branchId}&refundMethod=ABA&search=${order.orderNumber}`)
      .set('Authorization', `Bearer ${token}`);
    expect(filteredReturns.status).toBe(200);
    expect(filteredReturns.body.data).toHaveLength(1);
    expect(filteredReturns.body.data[0].returnNumber).toBe(retRes.body.data.returnNumber);
    expect(filteredReturns.body.pagination).toBeDefined();
    expect(filteredReturns.body.pagination.total).toBe(1);
    expect(filteredReturns.body.pagination.page).toBe(1);

    // Verify all 13 schema fields of sale_returns
    const sr = filteredReturns.body.data[0];
    expect(sr.id).toBe(retRes.body.data.id);
    expect(sr.tenantId).toBeDefined();
    expect(sr.branchId).toBe(branchId);
    expect(sr.orderId).toBe(order.id);
    expect(sr.returnNumber).toBe(retRes.body.data.returnNumber);
    expect(sr.employeeId).toBeDefined();
    expect(sr.returnReason).toBe('Defective cable');
    expect(sr.subtotal).toBeDefined();
    expect(sr.refundAmount).toBe('10.00');
    expect(sr.refundMethod).toBe('ABA');
    expect(sr.restockStatus).toBe('RESTOCKED');
    expect(sr.status).toBe('COMPLETED');
    expect(sr.returnedAt).toBeDefined();

    // Verify order-scoped returns endpoint
    const orderReturns = await request(app)
      .get(`/api/v1/orders/${order.id}/returns`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderReturns.status).toBe(200);
    expect(orderReturns.body.data).toHaveLength(1);
    expect(orderReturns.body.data[0].id).toBe(retRes.body.data.id);

    const returnDetail = await request(app)
      .get(`/api/v1/returns/${retRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(returnDetail.status).toBe(200);
    expect(returnDetail.body.data.returnNumber).toBe(retRes.body.data.returnNumber);
    expect(returnDetail.body.data.refundAmount).toBe('10.00');
    expect(returnDetail.body.data.saleReturnItems).toHaveLength(1);
    expect(returnDetail.body.data.order.orderNumber).toBe(order.orderNumber);

    const orderDetail = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderDetail.status).toBe(200);
    expect(orderDetail.body.data.saleReturns).toHaveLength(1);
    expect(orderDetail.body.data.saleReturns[0].refundMethod).toBe('ABA');

    // 5. Verify sale_return_items listing, pagination, and all 8 schema fields
    const returnItemsRes = await request(app)
      .get(`/api/v1/returns/items?saleReturnId=${retRes.body.data.id}&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(returnItemsRes.status).toBe(200);
    expect(returnItemsRes.body.data).toHaveLength(1);
    expect(returnItemsRes.body.pagination).toBeDefined();
    expect(returnItemsRes.body.pagination.total).toBe(1);
    expect(returnItemsRes.body.pagination.page).toBe(1);

    const sri = returnItemsRes.body.data[0];
    expect(sri.id).toBeDefined();
    expect(sri.saleReturnId).toBe(retRes.body.data.id);
    expect(sri.orderItemId).toBe(order.orderItems[0].id);
    expect(sri.productId).toBeDefined();
    expect(Number(sri.quantity)).toBe(1);
    expect(sri.unitPrice).toBeDefined();
    expect(sri.refundAmount).toBe('10.00');
    expect(Number(sri.restockQuantity)).toBe(1);

    // Verify sub-resource route: GET /api/v1/returns/:returnId/items
    const returnSubItemsRes = await request(app)
      .get(`/api/v1/returns/${retRes.body.data.id}/items`)
      .set('Authorization', `Bearer ${token}`);
    expect(returnSubItemsRes.status).toBe(200);
    expect(returnSubItemsRes.body.data).toHaveLength(1);
    expect(returnSubItemsRes.body.data[0].id).toBe(sri.id);
  });

  it('FR-07: handles selecting original sale, partial/full returns, proportional refundable amounts with discounts, restock decisions, and inventory updates', async () => {
    const { token, branchId } = await registerOwner('returns-owner@bayv.com.kh', 'Returns Studio');

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Electronics' });
    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Unit', abbreviation: 'u' });

    // Tracked product ($3.00, 10 in stock) + untracked service product ($5.00)
    const trackedProdRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'EAR-01',
        name: 'Earbuds',
        costPrice: '1.50',
        sellingPrice: '3.00',
        trackInventory: true,
        openingStock: '10',
        branchId,
      });
    expect(trackedProdRes.status).toBe(201);
    const trackedProdId = trackedProdRes.body.data.id;

    const serviceProdRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'SVC-WRAP',
        name: 'Gift Wrap Service',
        costPrice: '0.50',
        sellingPrice: '5.00',
        trackInventory: false,
        branchId,
      });
    expect(serviceProdRes.status).toBe(201);
    const serviceProdId = serviceProdRes.body.data.id;

    // Open shift with $50.00 starting cash to track cash refund drawer balance
    const shiftRes = await request(app)
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, openingCash: '50.00' });
    expect(shiftRes.status).toBe(201);
    const shiftId = shiftRes.body.data.id;

    // Order: (4 * $3.00 - $1.00 line discount = $11.00) + (1 * $5.00 = $5.00) = $16.00 subtotal - $1.60 order discount = $14.40 total
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        discountAmount: '1.60',
        items: [
          { productId: trackedProdId, quantity: '4', discountAmount: '1.00' },
          { productId: serviceProdId, quantity: '1' },
        ],
        payments: [{ paymentMethod: 'CASH', amount: '14.40', currencyCode: 'USD' }],
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.subtotal).toBe('16.00');
    expect(order.totalAmount).toBe('14.40');
    const trackedOrderItemId = order.orderItems[0].id;
    const serviceOrderItemId = order.orderItems[1].id;

    // Stock should now be 6.0000
    let invRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(invRes.body.data[0].quantity).toBe('6.0000');

    // 1. Guardrails: reject restock > return, restock on untracked item, and return > sold
    const badRestockExceed = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Defective unit',
        refundMethod: 'CASH',
        items: [{ orderItemId: trackedOrderItemId, quantity: '1', restockQuantity: '2' }],
      });
    expect(badRestockExceed.status).toBe(400);
    expect(badRestockExceed.body.error.code).toBe('INVALID_RESTOCK_QUANTITY');

    const badUntrackedRestock = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Unused service',
        refundMethod: 'CASH',
        items: [{ orderItemId: serviceOrderItemId, quantity: '1', restockQuantity: '1' }],
      });
    expect(badUntrackedRestock.status).toBe(400);
    expect(badUntrackedRestock.body.error.code).toBe('INVENTORY_NOT_TRACKED');

    // 2. Partial return: return 2 of 4 earbuds (only 1 restocked, 1 damaged), refund via CASH
    // Proportional refund: (2/4 * $11.00 = $5.50) * ($14.40 / $16.00) = $4.95
    const ret1Res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: '1 open-box + 1 broken',
        refundMethod: 'CASH',
        items: [{ orderItemId: trackedOrderItemId, quantity: '2', restockQuantity: '1' }],
      });
    expect(ret1Res.status).toBe(201);
    expect(ret1Res.body.data.restockStatus).toBe('PARTIAL');
    expect(ret1Res.body.data.refundAmount).toBe('4.95');

    // Stock should increase by 1 (6 -> 7)
    invRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(invRes.body.data[0].quantity).toBe('7.0000');

    // Order detail reflects PARTIALLY_RETURNED and product.trackInventory metadata for return UI
    const midOrderDetail = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(midOrderDetail.status).toBe(200);
    expect(midOrderDetail.body.data.status).toBe('PARTIALLY_RETURNED');
    expect(midOrderDetail.body.data.orderItems[0].product.trackInventory).toBe(true);
    expect(midOrderDetail.body.data.orderItems[1].product.trackInventory).toBe(false);

    // Returning 3 more earbuds when only 2 remain is rejected
    const badRemaining = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Excess qty',
        refundMethod: 'ABA',
        items: [{ orderItemId: trackedOrderItemId, quantity: '3', restockQuantity: '0' }],
      });
    expect(badRemaining.status).toBe(400);
    expect(badRemaining.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');

    // 3. Second return: return remaining 2 earbuds (0 restocked — damaged) + 1 service item -> exact remaining $9.45 (sum $4.95 + $9.45 = $14.40)
    const ret2Res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Remainder defective & cancelled wrap',
        refundMethod: 'ABA',
        items: [
          { orderItemId: trackedOrderItemId, quantity: '2', restockQuantity: '0' },
          { orderItemId: serviceOrderItemId, quantity: '1', restockQuantity: '0' },
        ],
      });
    expect(ret2Res.status).toBe(201);
    expect(ret2Res.body.data.restockStatus).toBe('NONE');
    expect(ret2Res.body.data.refundAmount).toBe('9.45');

    // Stock remains 7.0000 since restockQuantity was 0
    invRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(invRes.body.data[0].quantity).toBe('7.0000');

    // Order is now RETURNED and rejects any further return attempts
    const finalOrderDetail = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(finalOrderDetail.body.data.status).toBe('RETURNED');
    expect(finalOrderDetail.body.data.saleReturns).toHaveLength(2);

    const alreadyReturned = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: order.id,
        returnReason: 'Duplicate return',
        refundMethod: 'CASH',
        items: [{ orderItemId: serviceOrderItemId, quantity: '1', restockQuantity: '0' }],
      });
    expect(alreadyReturned.status).toBe(400);
    expect(alreadyReturned.body.error.code).toBe('ORDER_ALREADY_RETURNED');

    // Verify shift expected cash = $50.00 + $14.40 (sale) - $4.95 (CASH refund) = $59.45 (ABA refund does not affect cash drawer)
    const activeShift = await request(app)
      .get(`/api/v1/shifts/current?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(activeShift.status).toBe(200);
    expect(activeShift.body.data.id).toBe(shiftId);
    expect(activeShift.body.data.expectedCash).toBe('59.45');
  });

  it('FR-08: handles purchase orders/receipts, supplier/product validation, purchase costs, payment statuses (UNPAID/PARTIAL/PAID), and receiving into inventory', async () => {
    const { token, branchId } = await registerOwner('purchasing-owner@bayv.com.kh', 'Supply Hub');

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Beverages' });
    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Case', abbreviation: 'case' });

    const supActiveRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Phnom Penh Distributors', phone: '+85512999888' });
    expect(supActiveRes.status).toBe(201);
    const activeSupId = supActiveRes.body.data.id;

    const supInactiveRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dormant Supplier' });
    const inactiveSupId = supInactiveRes.body.data.id;
    await request(app)
      .patch(`/api/v1/suppliers/${inactiveSupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INACTIVE' });

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'BEV-WATER',
        name: 'Drinking Water Case',
        costPrice: '4.00',
        sellingPrice: '6.00',
        trackInventory: true,
        openingStock: '5',
        branchId,
      });
    const productId = prodRes.body.data.id;

    const archivedProdRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'BEV-OLD',
        name: 'Discontinued Soda',
        costPrice: '3.00',
        sellingPrice: '5.00',
        trackInventory: true,
        branchId,
      });
    const archivedProdId = archivedProdRes.body.data.id;
    await request(app)
      .patch(`/api/v1/products/${archivedProdId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ARCHIVED' });

    // 1. Reject inactive supplier & archived product
    const badSupPurchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: inactiveSupId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '2', unitCost: '4.00' }],
      });
    expect(badSupPurchase.status).toBe(400);
    expect(badSupPurchase.body.error.code).toBe('SUPPLIER_INACTIVE');

    const badProdPurchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: activeSupId,
        currencyCode: 'USD',
        items: [{ productId: archivedProdId, quantity: '2', unitCost: '3.00' }],
      });
    expect(badProdPurchase.status).toBe(400);
    expect(badProdPurchase.body.error.code).toBe('PRODUCT_ARCHIVED');

    // 2. Create ORDERED purchase (receiveImmediately: false, UNPAID, with cost discount & tax)
    // 10 * $4.50 = $45.00 subtotal - $5.00 discount + $2.00 tax = $42.00 total
    const poRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: activeSupId,
        currencyCode: 'USD',
        discountAmount: '5.00',
        taxAmount: '2.00',
        receiveImmediately: false,
        items: [{ productId, quantity: '10', unitCost: '4.50' }],
      });
    expect(poRes.status).toBe(201);
    const poId = poRes.body.data.id;
    expect(poRes.body.data.status).toBe('ORDERED');
    expect(poRes.body.data.paymentStatus).toBe('UNPAID');
    expect(poRes.body.data.totalAmount).toBe('42.00');

    // Stock should still be 5.0000 before receiving
    let invRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(invRes.body.data[0].quantity).toBe('5.0000');

    // 3. Receive PO -> status RECEIVED and stock becomes 15.0000; duplicate receive rejected
    const receiveRes = await request(app)
      .post(`/api/v1/purchases/${poId}/receive`)
      .set('Authorization', `Bearer ${token}`);
    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.status).toBe('RECEIVED');

    const dupReceive = await request(app)
      .post(`/api/v1/purchases/${poId}/receive`)
      .set('Authorization', `Bearer ${token}`);
    expect(dupReceive.status).toBe(400);
    expect(dupReceive.body.error.code).toBe('ALREADY_RECEIVED');

    invRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(invRes.body.data[0].quantity).toBe('15.0000');

    // 4. Record partial payment in KHR (82000 KHR = $20.00 at 4100) -> PARTIAL, then remaining $22.00 via ABA -> PAID
    const pay1Res = await request(app)
      .post(`/api/v1/purchases/${poId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '82000', currencyCode: 'KHR', paymentMethod: 'CASH' });
    expect(pay1Res.status).toBe(201);

    const partialCheck = await request(app)
      .get(`/api/v1/purchases/${poId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(partialCheck.status).toBe(200);
    expect(partialCheck.body.data.paymentStatus).toBe('PARTIAL');
    expect(partialCheck.body.data.paidAmount).toBe('20.00');

    const pay2Res = await request(app)
      .post(`/api/v1/purchases/${poId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: '22.00',
        currencyCode: 'USD',
        paymentMethod: 'ABA',
        referenceNumber: 'ABA-SUP-55',
      });
    expect(pay2Res.status).toBe(201);

    const paidListRes = await request(app)
      .get(`/api/v1/purchases?branchId=${branchId}&paymentStatus=PAID&search=${encodeURIComponent('Phnom Penh')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(paidListRes.status).toBe(200);
    expect(paidListRes.body.data).toHaveLength(1);
    expect(paidListRes.body.pagination).toBeDefined();
    expect(paidListRes.body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(paidListRes.body.pagination.page).toBe(1);

    const purchaseRecord = paidListRes.body.data[0];
    expect(purchaseRecord.id).toBe(poId);
    expect(purchaseRecord.tenantId).toBeDefined();
    expect(purchaseRecord.branchId).toBe(branchId);
    expect(purchaseRecord.supplierId).toBe(activeSupId);
    expect(purchaseRecord.purchaseNumber).toMatch(/^PUR-/);
    expect(purchaseRecord.employeeId).toBeDefined();
    expect(purchaseRecord.subtotal).toBe('45.00');
    expect(purchaseRecord.discountAmount).toBe('5.00');
    expect(purchaseRecord.taxAmount).toBe('2.00');
    expect(purchaseRecord.totalAmount).toBe('42.00');
    expect(purchaseRecord.paidAmount).toBe('42.00');
    expect(purchaseRecord.currencyCode).toBe('USD');
    expect(purchaseRecord.exchangeRate).toBeDefined();
    expect(purchaseRecord.status).toBe('RECEIVED');
    expect(purchaseRecord.purchaseDate).toBeDefined();
    expect(purchaseRecord.receivedAt).toBeDefined();
    expect(purchaseRecord.createdAt).toBeDefined();
    expect(purchaseRecord.updatedAt).toBeDefined();

    // 5. Create purchase with receiveImmediately: true + partial initial payment -> RECEIVED & PARTIAL immediately, stock 15 -> 20
    const instantRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: activeSupId,
        currencyCode: 'USD',
        receiveImmediately: true,
        items: [{ productId, quantity: '5', unitCost: '4.00' }],
        initialPayment: {
          amount: '10.00',
          currencyCode: 'USD',
          paymentMethod: 'ACLEDA',
          referenceNumber: 'ACL-SUP-88',
        },
      });
    expect(instantRes.status).toBe(201);
    expect(instantRes.body.data.status).toBe('RECEIVED');
    expect(instantRes.body.data.paymentStatus).toBe('PARTIAL');

    invRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(invRes.body.data[0].quantity).toBe('20.0000');

    // 6. List supplier payments with method filtering, pagination, and single payment lookup
    const supPaymentsRes = await request(app)
      .get(`/api/v1/purchases/payments?branchId=${branchId}&paymentMethod=ABA`)
      .set('Authorization', `Bearer ${token}`);
    expect(supPaymentsRes.status).toBe(200);
    expect(supPaymentsRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(supPaymentsRes.body.data[0].paymentMethod).toBe('ABA');
    expect(supPaymentsRes.body.pagination).toBeDefined();
    expect(supPaymentsRes.body.pagination.total).toBeGreaterThanOrEqual(1);

    // Verify all 10 schema fields of purchase_payments
    const verifiedPayment = supPaymentsRes.body.data.find((p: any) => p.paymentMethod === 'ABA');
    expect(verifiedPayment).toBeDefined();
    expect(verifiedPayment.id).toBeDefined();
    expect(verifiedPayment.tenantId).toBeDefined();
    expect(verifiedPayment.purchaseId).toBe(poId);
    expect(verifiedPayment.amount).toBe('22.00');
    expect(verifiedPayment.currencyCode).toBe('USD');
    expect(verifiedPayment.exchangeRate).toBeDefined();
    expect(verifiedPayment.paymentMethod).toBe('ABA');
    expect(verifiedPayment.referenceNumber).toBe('ABA-SUP-55');
    expect(verifiedPayment.paidAt).toBeDefined();
    expect(verifiedPayment.status).toBe('COMPLETED');

    // Scoped purchase payments endpoint GET /api/v1/purchases/:purchaseId/payments
    const poPaymentsRes = await request(app)
      .get(`/api/v1/purchases/${poId}/payments`)
      .set('Authorization', `Bearer ${token}`);
    expect(poPaymentsRes.status).toBe(200);
    expect(poPaymentsRes.body.data).toHaveLength(2); // CASH (KHR) + ABA (USD)

    // Lookup individual purchase payment by ID
    const singlePaymentRes = await request(app)
      .get(`/api/v1/purchases/payments/${verifiedPayment.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singlePaymentRes.status).toBe(200);
    expect(singlePaymentRes.body.data.id).toBe(verifiedPayment.id);
    expect(singlePaymentRes.body.data.referenceNumber).toBe('ABA-SUP-55');

    // 7. List purchase items across purchases & for specific purchase
    const allPurchaseItemsRes = await request(app)
      .get(`/api/v1/purchases/items?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(allPurchaseItemsRes.status).toBe(200);
    expect(allPurchaseItemsRes.body.data.length).toBeGreaterThanOrEqual(2);
    expect(allPurchaseItemsRes.body.pagination).toBeDefined();
    expect(allPurchaseItemsRes.body.pagination.total).toBeGreaterThanOrEqual(2);

    const firstItem = allPurchaseItemsRes.body.data[0];
    expect(firstItem.id).toBeDefined();
    expect(firstItem.purchaseId).toBeDefined();
    expect(firstItem.productId).toBe(productId);
    expect(firstItem.productNameSnapshot).toBe('Drinking Water Case');
    expect(firstItem.quantity).toBeDefined();
    expect(firstItem.unitCost).toBeDefined();
    expect(firstItem.discountAmount).toBeDefined();
    expect(firstItem.taxAmount).toBeDefined();
    expect(firstItem.lineTotal).toBeDefined();

    const singlePoItemsRes = await request(app)
      .get(`/api/v1/purchases/${poId}/items`)
      .set('Authorization', `Bearer ${token}`);
    expect(singlePoItemsRes.status).toBe(200);
    expect(singlePoItemsRes.body.data).toHaveLength(1);
    expect(singlePoItemsRes.body.data[0].purchaseId).toBe(poId);
    expect(singlePoItemsRes.body.data[0].lineTotal).toBe('45.00');
  });

  it('FR-09: handles viewing stock balances, tracking increases/decreases, manual adjustments with reasons, movement history filters, and unauthorized change prevention', async () => {
    const { token, branchId } = await registerOwner('inv-owner@bayv.com.kh', 'Inventory Mart');

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Snacks' });
    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pack', abbreviation: 'pk' });

    const tracked1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'SNK-CHIPS',
        barcode: '8859990001',
        name: 'Seaweed Chips',
        costPrice: '1.00',
        sellingPrice: '2.00',
        lowStockAlert: '4',
        trackInventory: true,
        openingStock: '10',
        branchId,
      });
    const tracked1Id = tracked1Res.body.data.id;

    const untrackedRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'SVC-BAG',
        name: 'Gift Bagging Fee',
        costPrice: '0.10',
        sellingPrice: '0.50',
        trackInventory: false,
        branchId,
      });
    const untrackedId = untrackedRes.body.data.id;

    const archivedRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'SNK-OLD',
        name: 'Old Crackers',
        costPrice: '1.00',
        sellingPrice: '2.00',
        trackInventory: true,
        openingStock: '5',
        branchId,
      });
    const archivedId = archivedRes.body.data.id;
    await request(app)
      .patch(`/api/v1/products/${archivedId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ARCHIVED' });

    // 1. Create viewer-only role (inventory.view WITHOUT inventory.adjust) and enforce authorization guard
    const viewerRoleRes = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stock Viewer',
        permissionCodes: ['inventory.view', 'products.view'],
      });
    expect(viewerRoleRes.status).toBe(201);

    await request(app)
      .post('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: 'EMP-VIEW',
        name: 'Dara Viewer',
        email: 'dara-view@bayv.com.kh',
        branchIds: [branchId],
        roleId: viewerRoleRes.body.data.id,
        createUserAccount: true,
        password: 'Password123',
      });

    const viewerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'dara-view@bayv.com.kh',
      password: 'Password123',
    });
    expect(viewerLogin.status).toBe(200);
    const viewerToken = viewerLogin.body.data.tokens.accessToken;

    // Viewer CAN read balances & movements, CANNOT apply manual adjustments (403)
    const viewerBalRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}&search=8859990001`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerBalRes.status).toBe(200);
    expect(viewerBalRes.body.data).toHaveLength(1);
    expect(viewerBalRes.body.data[0].quantity).toBe('10.0000');

    const unauthAdjRes = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        branchId,
        reason: 'Unauthorized change',
        items: [{ productId: tracked1Id, direction: 'OUT', quantity: '2' }],
      });
    expect(unauthAdjRes.status).toBe(403);
    expect(unauthAdjRes.body.error.code).toBe('PERMISSION_DENIED');

    // 2. Reject adjustments for untracked product, archived product, or insufficient stock
    const badUntracked = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Count test',
        items: [{ productId: untrackedId, direction: 'IN', quantity: '5' }],
      });
    expect(badUntracked.status).toBe(400);
    expect(badUntracked.body.error.code).toBe('INVENTORY_NOT_TRACKED');

    const badArchived = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Archived test',
        items: [{ productId: archivedId, direction: 'IN', quantity: '2' }],
      });
    expect(badArchived.status).toBe(400);
    expect(badArchived.body.error.code).toBe('PRODUCT_ARCHIVED');

    const badInsufficient = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Over-deduct',
        items: [{ productId: tracked1Id, direction: 'OUT', quantity: '25' }],
      });
    expect(badInsufficient.status).toBe(400);
    expect(badInsufficient.body.error.code).toBe('INSUFFICIENT_STOCK');

    // 3. Apply authorized adjustments (IN 5 -> 15, then OUT 12 -> 3 <= lowStockAlert 4) + verify movements & reasons
    const adjInRes = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Found missing carton during audit',
        items: [{ productId: tracked1Id, direction: 'IN', quantity: '5', notes: 'Shelf B2' }],
      });
    expect(adjInRes.status).toBe(201);
    expect(adjInRes.body.data.status).toBe('APPROVED');

    const adjOutRes = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        reason: 'Expired batch disposal',
        items: [{ productId: tracked1Id, direction: 'OUT', quantity: '12' }],
      });
    expect(adjOutRes.status).toBe(201);

    // Check low-stock detection (3 <= 4)
    const lowStockRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}&lowStockOnly=true&search=SNK-CHIPS`)
      .set('Authorization', `Bearer ${token}`);
    expect(lowStockRes.status).toBe(200);
    expect(lowStockRes.body.data).toHaveLength(1);
    expect(lowStockRes.body.data[0].quantity).toBe('3.0000');
    expect(lowStockRes.body.data[0].isLowStock).toBe(true);

    // Verify all 6 schema fields of stock_balances: id, tenant_id, branch_id, product_id, quantity, updated_at
    const verifiedBalance = lowStockRes.body.data[0];
    expect(verifiedBalance.id).toBeDefined();
    expect(verifiedBalance.tenantId).toBeDefined();
    expect(verifiedBalance.branchId).toBe(branchId);
    expect(verifiedBalance.productId).toBe(tracked1Id);
    expect(verifiedBalance.quantity).toBe('3.0000');
    expect(verifiedBalance.updatedAt).toBeDefined();

    // Verify single balance detail endpoint GET /api/v1/inventory/balances/:balanceId
    const singleBalRes = await request(app)
      .get(`/api/v1/inventory/balances/${verifiedBalance.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singleBalRes.status).toBe(200);
    expect(singleBalRes.body.data.id).toBe(verifiedBalance.id);
    expect(singleBalRes.body.data.tenantId).toBe(verifiedBalance.tenantId);
    expect(singleBalRes.body.data.branchId).toBe(branchId);
    expect(singleBalRes.body.data.productId).toBe(tracked1Id);
    expect(singleBalRes.body.data.quantity).toBe('3.0000');
    expect(singleBalRes.body.data.updatedAt).toBeDefined();

    // Verify stock balance pagination metadata
    const pagedBalRes = await request(app)
      .get(`/api/v1/inventory/balances?branchId=${branchId}&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(pagedBalRes.status).toBe(200);
    expect(pagedBalRes.body.pagination).toBeDefined();
    expect(pagedBalRes.body.pagination.page).toBe(1);
    expect(pagedBalRes.body.pagination.limit).toBe(10);
    expect(pagedBalRes.body.pagination.total).toBeGreaterThanOrEqual(1);

    // Verify unique constraint: tenant_id + branch_id + product_id cannot have duplicates
    await expect(
      mockPrisma.current.stockBalance.create({
        data: {
          tenantId: verifiedBalance.tenantId,
          branchId,
          productId: tracked1Id,
          quantity: 10,
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);

    // Check movement filtering by movementType & search + adjustment search
    const adjOutMovements = await request(app)
      .get(`/api/v1/inventory/movements?branchId=${branchId}&movementType=adjustment_out&search=${encodeURIComponent('Expired')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(adjOutMovements.status).toBe(200);
    expect(adjOutMovements.body.data).toHaveLength(1);
    expect(Number(adjOutMovements.body.data[0].quantityOut)).toBe(12);
    expect(adjOutMovements.body.data[0].balanceAfter).toBe('3.0000');
    expect(adjOutMovements.body.pagination).toBeDefined();
    expect(adjOutMovements.body.pagination.total).toBeGreaterThanOrEqual(1);

    // Verify all 13 schema fields of stock_movements
    const verifiedMovement = adjOutMovements.body.data[0];
    expect(verifiedMovement.id).toBeDefined();
    expect(verifiedMovement.tenantId).toBeDefined();
    expect(verifiedMovement.branchId).toBe(branchId);
    expect(verifiedMovement.productId).toBe(tracked1Id);
    expect(verifiedMovement.movementType).toBe('adjustment_out');
    expect(verifiedMovement.quantityIn).toBeDefined();
    expect(Number(verifiedMovement.quantityOut)).toBe(12);
    expect(Number(verifiedMovement.balanceAfter)).toBe(3);
    expect(verifiedMovement.referenceType).toBeDefined();
    expect(verifiedMovement.referenceId).toBeDefined();
    expect(verifiedMovement.notes).toBeDefined();
    expect(verifiedMovement.createdBy).toBeDefined();
    expect(verifiedMovement.createdAt).toBeDefined();

    // Verify single movement detail endpoint GET /api/v1/inventory/movements/:movementId
    const singleMovRes = await request(app)
      .get(`/api/v1/inventory/movements/${verifiedMovement.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singleMovRes.status).toBe(200);
    expect(singleMovRes.body.data.id).toBe(verifiedMovement.id);
    expect(singleMovRes.body.data.productId).toBe(tracked1Id);

    // Verify invalid movementType query parameter is rejected by validation schema
    const invalidTypeRes = await request(app)
      .get('/api/v1/inventory/movements?movementType=invalid_type_xyz')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidTypeRes.status).toBe(400);
    expect(invalidTypeRes.body.error.code).toBe('VALIDATION_ERROR');

    // Verify valid movementType query parameter is accepted
    const validTypeRes = await request(app)
      .get('/api/v1/inventory/movements?movementType=adjustment_out')
      .set('Authorization', `Bearer ${token}`);
    expect(validTypeRes.status).toBe(200);

    const adjListRes = await request(app)
      .get(`/api/v1/inventory/adjustments?branchId=${branchId}&search=${encodeURIComponent('audit')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(adjListRes.status).toBe(200);
    expect(adjListRes.body.data).toHaveLength(1);
    expect(adjListRes.body.data[0].reason).toBe('Found missing carton during audit');

    const adjDetailRes = await request(app)
      .get(`/api/v1/inventory/adjustments/${adjOutRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(adjDetailRes.status).toBe(200);
    expect(adjDetailRes.body.data.id).toBe(adjOutRes.body.data.id);

    // Verify all 10 schema fields of stock_adjustments
    const verifiedAdj = adjDetailRes.body.data;
    expect(verifiedAdj.id).toBe(adjOutRes.body.data.id);
    expect(verifiedAdj.tenantId).toBeDefined();
    expect(verifiedAdj.branchId).toBe(branchId);
    expect(verifiedAdj.adjustmentNumber).toBeDefined();
    expect(verifiedAdj.employeeId).toBeDefined();
    expect(verifiedAdj.reason).toBe('Expired batch disposal');
    expect(verifiedAdj.status).toBe('APPROVED');
    expect(verifiedAdj.approvedBy).toBeDefined();
    expect(verifiedAdj.adjustmentDate).toBeDefined();
    expect(verifiedAdj.createdAt).toBeDefined();

    // Verify adjustment line details represented by linked stock_movements
    expect(verifiedAdj.movements).toHaveLength(1);
    const adjLine = verifiedAdj.movements[0];
    expect(adjLine.id).toBeDefined();
    expect(adjLine.tenantId).toBe(verifiedAdj.tenantId);
    expect(adjLine.branchId).toBe(branchId);
    expect(adjLine.productId).toBe(tracked1Id);
    expect(adjLine.movementType).toBe('adjustment_out');
    expect(Number(adjLine.quantityOut)).toBe(12);
    expect(Number(adjLine.balanceAfter)).toBe(3);
    expect(adjLine.referenceType).toBe('StockAdjustment');
    expect(adjLine.referenceId).toBe(verifiedAdj.id);
    expect(adjLine.notes).toBe('Expired batch disposal');
    expect(adjLine.product.sku).toBe('SNK-CHIPS');
  });

  it('FR-11: manages expense types, expenses, additional income, RBAC, transaction ledger, and date-scoped financial summaries', async () => {
    const { token, branchId } = await registerOwner();

    // 1. Setup catalog, supplier, viewer role
    const [catRes, unitRes, supRes] = await Promise.all([
      request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Beverages' }),
      request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bottle', abbreviation: 'btl' }),
      request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Angkor Supplier' }),
    ]);

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'DRK-01',
        name: 'Iced Latte',
        costPrice: '2.00',
        sellingPrice: '10.00',
        trackInventory: true,
        openingStock: '20',
        branchId,
      });
    const productId = prodRes.body.data.id;

    // 2. Expense Type lifecycle: create, duplicate 409, rename conflict 409, update, deactivate/reactivate
    const rentTypeRes = await request(app)
      .post('/api/v1/finance/expense-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rent', description: 'Shop lease' });
    expect(rentTypeRes.status).toBe(201);

    // Verify all 5 user-specified fields of expense_types: id, tenant_id, name, description, status
    expect(rentTypeRes.body.data.id).toBeDefined();
    expect(rentTypeRes.body.data.tenantId).toBeDefined();
    expect(rentTypeRes.body.data.name).toBe('Rent');
    expect(rentTypeRes.body.data.description).toBe('Shop lease');
    expect(rentTypeRes.body.data.status).toBe('ACTIVE');

    // Verify GET /api/v1/finance/expense-types/:expenseTypeId
    const getSingleTypeRes = await request(app)
      .get(`/api/v1/finance/expense-types/${rentTypeRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getSingleTypeRes.status).toBe(200);
    expect(getSingleTypeRes.body.data.id).toBe(rentTypeRes.body.data.id);
    expect(getSingleTypeRes.body.data.name).toBe('Rent');

    // Verify listing with pagination and search filter
    const listTypesRes = await request(app)
      .get('/api/v1/finance/expense-types?search=Rent&page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(listTypesRes.status).toBe(200);
    expect(listTypesRes.body.data).toHaveLength(1);
    expect(listTypesRes.body.pagination).toBeDefined();
    expect(listTypesRes.body.pagination.total).toBe(1);

    // Verify unique constraint: tenant_id + name cannot have duplicates
    await expect(
      mockPrisma.current.expenseType.create({
        data: {
          tenantId: rentTypeRes.body.data.tenantId,
          name: 'Rent',
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);

    const dupTypeRes = await request(app)
      .post('/api/v1/finance/expense-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rent' });
    expect(dupTypeRes.status).toBe(409);

    const utilTypeRes = await request(app)
      .post('/api/v1/finance/expense-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Electricity' });
    expect(utilTypeRes.status).toBe(201);
    const utilTypeId = utilTypeRes.body.data.id;

    const renameConflictRes = await request(app)
      .patch(`/api/v1/finance/expense-types/${utilTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rent' });
    expect(renameConflictRes.status).toBe(409);

    const deactivateRes = await request(app)
      .patch(`/api/v1/finance/expense-types/${utilTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Utilities', status: 'INACTIVE' });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.status).toBe('INACTIVE');

    const inactiveExpRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        expenseTypeId: utilTypeId,
        amount: '10.00',
        currencyCode: 'USD',
        paymentMethod: 'CASH',
      });
    expect(inactiveExpRes.status).toBe(400);
    expect(inactiveExpRes.body.error.code).toBe('EXPENSE_TYPE_INACTIVE');

    await request(app)
      .patch(`/api/v1/finance/expense-types/${utilTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' });

    // 3. RBAC enforcement: finance.view-only role cannot mutate finance data
    const viewerRoleRes = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Finance Auditor', permissionCodes: ['finance.view'] });
    await request(app)
      .post('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: 'FIN-AUD',
        name: 'Sokha Auditor',
        email: 'auditor@finpos.kh',
        branchIds: [branchId],
        roleId: viewerRoleRes.body.data.id,
        createUserAccount: true,
        password: 'Password123',
      });
    const auditorLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'auditor@finpos.kh',
      password: 'Password123',
    });
    const auditorToken = auditorLogin.body.data.tokens.accessToken;

    const blockedExp = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({
        branchId,
        expenseTypeId: utilTypeId,
        amount: '5.00',
        currencyCode: 'USD',
        paymentMethod: 'CASH',
      });
    expect(blockedExp.status).toBe(403);
    expect(blockedExp.body.error.code).toBe('PERMISSION_DENIED');

    // 4. Record transactions across all 5 sources:
    // a) Sale ($20.00 via ABA) + b) Refund (1 item = $10.00 via CASH)
    const saleRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '2' }],
        payments: [{ paymentMethod: 'ABA', amount: '20.00', currencyCode: 'USD', referenceNumber: 'ABA-991' }],
      });
    expect(saleRes.status).toBe(201);
    const orderItemId = saleRes.body.data.orderItems[0].id;

    const retRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: saleRes.body.data.id,
        returnReason: 'Customer changed mind',
        refundMethod: 'CASH',
        items: [{ orderItemId, quantity: '1', restockQuantity: '1' }],
      });
    expect(retRes.status).toBe(201);

    // c) Purchase payment ($8.00 ACLEDA)
    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: supRes.body.data.id,
        currencyCode: 'USD',
        receiveImmediately: false,
        initialPayment: {
          amount: '8.00',
          currencyCode: 'USD',
          paymentMethod: 'ACLEDA',
        },
        items: [{ productId, quantity: '4', unitCost: '2.00' }],
      });
    expect(purRes.status).toBe(201);

    // d) Current expenses (Utilities 41,000 KHR = $10.00 ABA) + Backdated expense ($50.00 CASH on 2025-05-10)
    const todayStr = new Date().toISOString().slice(0, 10);
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        expenseTypeId: utilTypeId,
        description: 'EDC Monthly Bill',
        amount: '41000',
        currencyCode: 'KHR',
        paymentMethod: 'ABA',
        expenseDate: todayStr,
      });
    expect(expRes.status).toBe(201);

    // Verify all 13 schema fields of expenses
    const expData = expRes.body.data;
    expect(expData.id).toBeDefined();
    expect(expData.tenantId).toBeDefined();
    expect(expData.branchId).toBe(branchId);
    expect(expData.expenseTypeId).toBe(utilTypeId);
    expect(expData.employeeId).toBeDefined();
    expect(expData.expenseNumber).toBeDefined();
    expect(expData.description).toBe('EDC Monthly Bill');
    expect(expData.amount).toBeDefined();
    expect(expData.currencyCode).toBe('KHR');
    expect(expData.exchangeRate).toBeDefined();
    expect(expData.paymentMethod).toBe('ABA');
    expect(expData.expenseDate).toBeDefined();
    expect(expData.createdAt).toBeDefined();

    // Verify GET /api/v1/finance/expenses/:expenseId
    const singleExpRes = await request(app)
      .get(`/api/v1/finance/expenses/${expData.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singleExpRes.status).toBe(200);
    expect(singleExpRes.body.data.id).toBe(expData.id);
    expect(singleExpRes.body.data.expenseNumber).toBe(expData.expenseNumber);

    // Verify GET /api/v1/finance/expenses with pagination and search
    const pagedExpRes = await request(app)
      .get(`/api/v1/finance/expenses?branchId=${branchId}&search=EDC&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(pagedExpRes.status).toBe(200);
    expect(pagedExpRes.body.data).toHaveLength(1);
    expect(pagedExpRes.body.pagination).toBeDefined();
    expect(pagedExpRes.body.pagination.page).toBe(1);
    expect(pagedExpRes.body.pagination.limit).toBe(10);
    expect(pagedExpRes.body.pagination.total).toBe(1);

    // Verify unique constraint: tenant_id + branch_id + expense_number cannot have duplicates
    await expect(
      mockPrisma.current.expense.create({
        data: {
          tenantId: expData.tenantId,
          branchId,
          expenseTypeId: utilTypeId,
          employeeId: expData.employeeId,
          expenseNumber: expData.expenseNumber,
          amount: 10,
          currencyCode: 'USD',
          exchangeRate: 4100,
          paymentMethod: 'CASH',
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);

    await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        expenseTypeId: rentTypeRes.body.data.id,
        description: 'Prior Year Rent',
        amount: '50.00',
        currencyCode: 'USD',
        paymentMethod: 'CASH',
        expenseDate: '2025-05-10',
      });

    // e) Additional income ($25.00 USD today)
    const incRes = await request(app)
      .post('/api/v1/finance/incomes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        description: 'Booth Sublease',
        amount: '25.00',
        currencyCode: 'USD',
        incomeDate: todayStr,
      });
    expect(incRes.status).toBe(201);

    // Verify all 11 schema fields of incomes
    const incData = incRes.body.data;
    expect(incData.id).toBeDefined();
    expect(incData.tenantId).toBeDefined();
    expect(incData.branchId).toBe(branchId);
    expect(incData.employeeId).toBeDefined();
    expect(incData.incomeNumber).toBeDefined();
    expect(incData.description).toBe('Booth Sublease');
    expect(incData.amount).toBeDefined();
    expect(incData.currencyCode).toBe('USD');
    expect(incData.exchangeRate).toBeDefined();
    expect(incData.incomeDate).toBeDefined();
    expect(incData.createdAt).toBeDefined();

    // Verify GET /api/v1/finance/incomes/:incomeId
    const singleIncRes = await request(app)
      .get(`/api/v1/finance/incomes/${incData.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singleIncRes.status).toBe(200);
    expect(singleIncRes.body.data.id).toBe(incData.id);
    expect(singleIncRes.body.data.incomeNumber).toBe(incData.incomeNumber);

    // Verify GET /api/v1/finance/incomes with pagination and search
    const pagedIncRes = await request(app)
      .get(`/api/v1/finance/incomes?branchId=${branchId}&search=Booth&page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(pagedIncRes.status).toBe(200);
    expect(pagedIncRes.body.data).toHaveLength(1);
    expect(pagedIncRes.body.pagination).toBeDefined();
    expect(pagedIncRes.body.pagination.page).toBe(1);
    expect(pagedIncRes.body.pagination.limit).toBe(10);
    expect(pagedIncRes.body.pagination.total).toBe(1);

    // Verify unique constraint: tenant_id + branch_id + income_number cannot have duplicates
    await expect(
      mockPrisma.current.income.create({
        data: {
          tenantId: incData.tenantId,
          branchId,
          employeeId: incData.employeeId,
          incomeNumber: incData.incomeNumber,
          description: 'Duplicate income voucher',
          amount: 25,
          currencyCode: 'USD',
          exchangeRate: 4100,
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);

    // 5. Verify unified financial transactions ledger & filters
    const ledgerRes = await request(app)
      .get(`/api/v1/finance/transactions?branchId=${branchId}`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.data.totalInflow).toBe('45.00'); // $20 sale + $25 additional income
    expect(ledgerRes.body.data.totalOutflow).toBe('78.00'); // $10 refund + $8 supplier + $10 + $50 expenses
    expect(ledgerRes.body.data.netAmount).toBe('-33.00');
    const types = new Set(ledgerRes.body.data.transactions.map((x: { transactionType: string }) => x.transactionType));
    expect(types.has('SALE_PAYMENT')).toBe(true);
    expect(types.has('SALE_RETURN')).toBe(true);
    expect(types.has('PURCHASE_PAYMENT')).toBe(true);
    expect(types.has('EXPENSE')).toBe(true);
    expect(types.has('ADDITIONAL_INCOME')).toBe(true);

    const inflowRes = await request(app)
      .get(`/api/v1/finance/transactions?branchId=${branchId}&direction=INFLOW&search=Booth`)
      .set('Authorization', `Bearer ${token}`);
    expect(inflowRes.status).toBe(200);
    expect(inflowRes.body.data.transactions).toHaveLength(1);
    expect(inflowRes.body.data.transactions[0].transactionType).toBe('ADDITIONAL_INCOME');

    // 6. Verify overall & date-scoped summary + expense breakdown
    const fullSumRes = await request(app)
      .get(`/api/v1/finance/summary?branchId=${branchId}`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(fullSumRes.status).toBe(200);
    expect(fullSumRes.body.data.grossSales).toBe('20.00');
    expect(fullSumRes.body.data.totalRefunds).toBe('10.00');
    expect(fullSumRes.body.data.salesRevenue).toBe('10.00');
    expect(fullSumRes.body.data.additionalIncome).toBe('25.00');
    expect(fullSumRes.body.data.totalExpenses).toBe('60.00');
    expect(fullSumRes.body.data.purchasePayments).toBe('8.00');
    expect(fullSumRes.body.data.netCashflow).toBe('-25.00');
    expect(fullSumRes.body.data.netPositionIncludingPurchases).toBe('-33.00');
    expect(fullSumRes.body.data.expenseBreakdown[0].expenseTypeName).toBe('Rent');
    expect(fullSumRes.body.data.expenseBreakdown[0].total).toBe('50.00');

    const may2025Sum = await request(app)
      .get(`/api/v1/finance/summary?branchId=${branchId}&dateFrom=2025-05-01&dateTo=2025-05-31`)
      .set('Authorization', `Bearer ${token}`);
    expect(may2025Sum.status).toBe(200);
    expect(may2025Sum.body.data.totalExpenses).toBe('50.00');
    expect(may2025Sum.body.data.additionalIncome).toBe('0.00');
  });

  it('FR-12: generates daily/monthly sales, product performance, inventory, purchase, expense, income, profit estimation, and cashier shift reports with RBAC & date filters', async () => {
    const { token, branchId } = await registerOwner('rep-owner@bayv.com.kh', 'Report Mart');

    const [catRes, unitRes, supRes] = await Promise.all([
      request(app).post('/api/v1/categories').set('Authorization', `Bearer ${token}`).send({ name: 'Coffee' }),
      request(app).post('/api/v1/units').set('Authorization', `Bearer ${token}`).send({ name: 'Bag', abbreviation: 'bag' }),
      request(app).post('/api/v1/suppliers').set('Authorization', `Bearer ${token}`).send({ name: 'Roaster Co' }),
    ]);

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'COF-BEANS',
        name: 'Kampot Beans',
        costPrice: '3.00',
        sellingPrice: '10.00',
        lowStockAlert: '6',
        trackInventory: true,
        openingStock: '10',
        branchId,
      });
    const productId = prodRes.body.data.id;

    // Role without reports.view -> 403 guard
    const cashierRoleRes = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'NoReport Cashier', permissionCodes: ['sales.view'] });
    await request(app)
      .post('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: 'REP-NOREP',
        name: 'Vanna',
        email: 'norep@bayv.com.kh',
        branchIds: [branchId],
        roleId: cashierRoleRes.body.data.id,
        createUserAccount: true,
        password: 'Password123',
      });
    const noRepLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'norep@bayv.com.kh',
      password: 'Password123',
    });
    const noRepToken = noRepLogin.body.data.tokens.accessToken;
    const blockedReport = await request(app)
      .get('/api/v1/reports/profit')
      .set('Authorization', `Bearer ${noRepToken}`);
    expect(blockedReport.status).toBe(403);
    expect(blockedReport.body.error.code).toBe('PERMISSION_DENIED');

    // Open cashier shift ($50 opening) with notes
    const openShiftRes = await request(app)
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, openingCash: '50.00', notes: 'Morning cashier shift float' });
    expect(openShiftRes.status).toBe(201);
    expect(openShiftRes.body.data.notes).toBe('Morning cashier shift float');
    const shiftId = openShiftRes.body.data.id;

    // Order 1: 2 units ($20 - $2 discount = $18 ABA), Order 2: 3 units ($30 CASH)
    const ord1 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        shiftId,
        currencyCode: 'USD',
        discountAmount: '2.00',
        items: [{ productId, quantity: '2' }],
        payments: [{ paymentMethod: 'ABA', amount: '18.00', currencyCode: 'USD' }],
      });
    expect(ord1.status).toBe(201);

    const ord2 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        shiftId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '3' }],
        payments: [{ paymentMethod: 'CASH', amount: '30.00', currencyCode: 'USD' }],
      });
    expect(ord2.status).toBe(201);

    // Return 1 unit on Order 2 ($10 CASH refund, restock 1 -> stock = 6 <= lowStockAlert 6)
    const retRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: ord2.body.data.id,
        returnReason: 'Damaged bag',
        refundMethod: 'CASH',
        items: [{ orderItemId: ord2.body.data.orderItems[0].id, quantity: '1', restockQuantity: '1' }],
      });
    expect(retRes.status).toBe(201);

    // Close shift with closingCash & notes: expectedCash = 50 + 30 - 10 = 70.00, actual = 69.00 -> diff = -1.00
    const closeShiftRes = await request(app)
      .post(`/api/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ closingCash: '69.00', notes: 'Evening closing count' });
    expect(closeShiftRes.status).toBe(200);
    expect(closeShiftRes.body.data.notes).toBe('Evening closing count');
    expect(Number(closeShiftRes.body.data.closingCash)).toBe(69);
    expect(Number(closeShiftRes.body.data.actualCash)).toBe(69);

    const getShiftRes = await request(app)
      .get(`/api/v1/shifts/${shiftId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getShiftRes.status).toBe(200);
    expect(getShiftRes.body.data.id).toBe(shiftId);
    expect(getShiftRes.body.data.status).toBe('CLOSED');
    expect(getShiftRes.body.data.orders.length).toBeGreaterThanOrEqual(1);

    // Verify shifts listing with pagination and search
    const shiftsListRes = await request(app)
      .get(`/api/v1/shifts?branchId=${branchId}&status=CLOSED&page=1&limit=10&search=${encodeURIComponent(getShiftRes.body.data.shiftNumber)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(shiftsListRes.status).toBe(200);
    expect(shiftsListRes.body.data.length).toBe(1);
    expect(shiftsListRes.body.pagination).toBeDefined();
    expect(shiftsListRes.body.pagination.page).toBe(1);
    expect(shiftsListRes.body.pagination.limit).toBe(10);
    expect(shiftsListRes.body.pagination.total).toBe(1);

    // Verify all 12 user-specified fields of shifts (plus closingCash and notes)
    const verifiedShift = shiftsListRes.body.data.find((s: any) => s.id === shiftId);
    expect(verifiedShift).toBeDefined();
    expect(verifiedShift.id).toBe(shiftId);
    expect(verifiedShift.tenantId).toBeDefined();
    expect(verifiedShift.branchId).toBe(branchId);
    expect(verifiedShift.employeeId).toBeDefined();
    expect(verifiedShift.shiftNumber).toBeDefined();
    expect(Number(verifiedShift.openingCash)).toBe(50);
    expect(Number(verifiedShift.expectedCash)).toBe(70);
    expect(Number(verifiedShift.actualCash)).toBe(69);
    expect(Number(verifiedShift.closingCash)).toBe(69);
    expect(Number(verifiedShift.cashDifference)).toBe(-1);
    expect(verifiedShift.openedAt).toBeDefined();
    expect(verifiedShift.closedAt).toBeDefined();
    expect(verifiedShift.status).toBe('CLOSED');
    expect(verifiedShift.notes).toBe('Evening closing count');

    // Verify unique constraint: tenant_id + branch_id + shift_number cannot have duplicates
    await expect(
      mockPrisma.current.shift.create({
        data: {
          tenantId: verifiedShift.tenantId,
          branchId,
          shiftNumber: verifiedShift.shiftNumber,
          employeeId: verifiedShift.employeeId,
          openingCash: 10,
          expectedCash: 10,
          status: 'OPEN',
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);

    // Purchase ($12 total, $5 paid, $7 due)
    await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: supRes.body.data.id,
        currencyCode: 'USD',
        receiveImmediately: false,
        initialPayment: { amount: '5.00', currencyCode: 'USD', paymentMethod: 'CASH' },
        items: [{ productId, quantity: '4', unitCost: '3.00' }],
      });

    // Expense (41,000 KHR = $10 ABA) & Additional Income ($15 USD)
    const etRes = await request(app)
      .post('/api/v1/finance/expense-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Utilities' });
    await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        expenseTypeId: etRes.body.data.id,
        description: 'Power bill',
        amount: '41000',
        currencyCode: 'KHR',
        paymentMethod: 'ABA',
      });
    await request(app)
      .post('/api/v1/finance/incomes')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, description: 'Grinder fee', amount: '15.00', currencyCode: 'USD' });

    // Query all 10 report endpoints
    const [dashRes, salesRes, prodRepRes, invRepRes, purRepRes, expRepRes, incRepRes, profRes, shiftRepRes, empRepRes] =
      await Promise.all([
        request(app).get(`/api/v1/reports/dashboard?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/sales?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/products?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/inventory?branchId=${branchId}&lowStockOnly=true`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/purchases?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/expenses?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/incomes?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/profit?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/shifts?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`/api/v1/reports/employees?branchId=${branchId}`).set('Authorization', `Bearer ${token}`),
      ]);

    expect(salesRes.status).toBe(200);
    expect(salesRes.body.data.summary.orderCount).toBe(2);
    expect(salesRes.body.data.summary.grossSales).toBe('48.00');
    expect(salesRes.body.data.summary.totalRefunds).toBe('10.00');
    expect(salesRes.body.data.summary.netSales).toBe('38.00');
    expect(salesRes.body.data.daily[0].total).toBe('38.00');
    expect(salesRes.body.data.monthly[0].total).toBe('38.00');

    expect(prodRepRes.status).toBe(200);
    expect(prodRepRes.body.data.products[0].quantitySold).toBe('5.0000');
    expect(prodRepRes.body.data.totalCost).toBe('15.00');

    expect(invRepRes.status).toBe(200);
    expect(invRepRes.body.data.lowStockCount).toBe(1);
    expect(invRepRes.body.data.items[0].quantity).toBe('6.0000');
    expect(invRepRes.body.data.totalCostValue).toBe('18.00');
    expect(invRepRes.body.data.totalRetailValue).toBe('60.00');

    expect(purRepRes.status).toBe(200);
    expect(purRepRes.body.data.summary.totalCost).toBe('12.00');
    expect(purRepRes.body.data.summary.totalPaid).toBe('5.00');
    expect(purRepRes.body.data.summary.totalBalanceDue).toBe('7.00');
    expect(purRepRes.body.data.items[0].status).toBe('ORDERED');
    expect(purRepRes.body.data.items[0].paymentStatus).toBe('PARTIAL');

    const orderedFilterRes = await request(app)
      .get(`/api/v1/reports/purchases?branchId=${branchId}&status=ORDERED`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderedFilterRes.status).toBe(200);
    expect(orderedFilterRes.body.data.items).toHaveLength(1);

    expect(expRepRes.status).toBe(200);
    expect(expRepRes.body.data.totalExpenses).toBe('10.00');
    expect(expRepRes.body.data.byExpenseType[0].name).toBe('Utilities');

    expect(incRepRes.status).toBe(200);
    expect(incRepRes.body.data.netSalesRevenue).toBe('38.00');
    expect(incRepRes.body.data.additionalIncome).toBe('15.00');
    expect(incRepRes.body.data.totalIncome).toBe('53.00');

    expect(profRes.status).toBe(200);
    expect(profRes.body.data.netSalesRevenue).toBe('38.00');
    expect(profRes.body.data.costOfGoodsSold).toBe('15.00');
    expect(profRes.body.data.grossProfit).toBe('23.00');
    expect(profRes.body.data.estimatedNetProfit).toBe('28.00');
    expect(dashRes.body.data.estimatedProfit).toBe('28.00');

    expect(shiftRepRes.status).toBe(200);
    expect(shiftRepRes.body.data.summary.closedShifts).toBe(1);
    expect(shiftRepRes.body.data.summary.totalShiftSales).toBe('48.00');
    expect(shiftRepRes.body.data.summary.totalExpectedCash).toBe('70.00');
    expect(shiftRepRes.body.data.summary.totalActualCash).toBe('69.00');
    expect(shiftRepRes.body.data.summary.totalCashDifference).toBe('-1.00');
    expect(shiftRepRes.body.data.shifts[0].orderCount).toBe(2);

    expect(empRepRes.status).toBe(200);
    expect(empRepRes.body.data.summary.totalEmployees).toBeGreaterThanOrEqual(1);
    expect(empRepRes.body.data.employees[0].orderCount).toBe(2);
    expect(empRepRes.body.data.employees[0].totalSales).toBe('48.00');

    // Date-range exclusion test
    const emptyRangeRes = await request(app)
      .get(`/api/v1/reports/profit?branchId=${branchId}&dateFrom=2024-01-01&dateTo=2024-01-31`)
      .set('Authorization', `Bearer ${token}`);
    expect(emptyRangeRes.status).toBe(200);
    expect(emptyRangeRes.body.data.estimatedNetProfit).toBe('0.00');
  });

  it('FR-13: manages business profile, language/currency defaults, exchange rates, receipt settings, tax config, custom document numbering, and user preferences with RBAC', async () => {
    const { token, branchId, userId } = await registerOwner('settings-owner@bayv.com.kh', 'Settings Supermart');

    // 1. Business Profile update (name, logoUrl, defaultCurrency, defaultLanguage, timezone)
    const updateProfileRes = await request(app)
      .patch('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Settings Flagship Mart',
        logoUrl: 'https://example.com/assets/logo.png',
        defaultCurrency: 'USD',
        defaultLanguage: 'km',
        timezone: 'Asia/Phnom_Penh',
      });
    expect(updateProfileRes.status).toBe(200);
    expect(updateProfileRes.body.data.name).toBe('Settings Flagship Mart');
    expect(updateProfileRes.body.data.logoUrl).toBe('https://example.com/assets/logo.png');
    expect(updateProfileRes.body.data.defaultLanguage).toBe('km');

    // Verify /auth/me reflects the updated profile & logo
    const authMeRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(authMeRes.status).toBe(200);
    expect(authMeRes.body.data.activeTenant.name).toBe('Settings Flagship Mart');
    expect(authMeRes.body.data.activeTenant.logoUrl).toBe('https://example.com/assets/logo.png');
    expect(authMeRes.body.data.activeTenant.defaultLanguage).toBe('km');

    // 2. User Preferences (personal workstation settings)
    const initialPrefs = await request(app)
      .get('/api/v1/settings/user-preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(initialPrefs.status).toBe(200);
    expect(initialPrefs.body.data.language).toBe('en');
    expect(initialPrefs.body.data.posSoundEnabled).toBe(true);
    expect(initialPrefs.body.data.autoPrintReceipt).toBe(false);

    const updatePrefsRes = await request(app)
      .put('/api/v1/settings/user-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'km',
        theme: 'dark',
        posSoundEnabled: false,
        autoPrintReceipt: true,
        compactTables: true,
        defaultBranchId: branchId,
      });
    expect(updatePrefsRes.status).toBe(200);
    expect(updatePrefsRes.body.data.language).toBe('km');
    expect(updatePrefsRes.body.data.theme).toBe('dark');
    expect(updatePrefsRes.body.data.posSoundEnabled).toBe(false);
    expect(updatePrefsRes.body.data.autoPrintReceipt).toBe(true);
    expect(updatePrefsRes.body.data.compactTables).toBe(true);
    expect(updatePrefsRes.body.data.defaultBranchId).toBe(branchId);

    // 3. System Settings: Tax, Receipts, and Custom Numbering Prefixes
    const initialSettingsRes = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(initialSettingsRes.status).toBe(200);
    expect(initialSettingsRes.body.data.settings.orderPrefix).toBe('ORD');
    expect(initialSettingsRes.body.data.settings.purchasePrefix).toBe('PUR');

    const updateSettingsRes = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        settings: {
          taxEnabled: true,
          taxRatePercent: '10.00',
          taxIdentificationNumber: 'K001-902103456',
          taxInclusive: false,
          receiptHeader: 'Welcome to Flagship Mart / សូមស្វាគមន៍!',
          receiptFooter: 'Goods sold are exchangeable within 7 days. / សូមអរគុណ!',
          showLogo: true,
          showTaxDetails: true,
          showCashierName: true,
          showCustomerInfo: true,
          paperSize: '80mm',
          orderPrefix: 'INV',
          purchasePrefix: 'PO',
          returnPrefix: 'SR',
          adjustmentPrefix: 'ADJ',
          expensePrefix: 'EXP',
          incomePrefix: 'INC',
          shiftPrefix: 'SH',
        },
      });
    expect(updateSettingsRes.status).toBe(200);
    expect(updateSettingsRes.body.data.settings.taxEnabled).toBe(true);
    expect(updateSettingsRes.body.data.settings.taxRatePercent).toBe('10.00');
    expect(updateSettingsRes.body.data.settings.taxIdentificationNumber).toBe('K001-902103456');
    expect(updateSettingsRes.body.data.settings.orderPrefix).toBe('INV');
    expect(updateSettingsRes.body.data.settings.purchasePrefix).toBe('PO');
    expect(updateSettingsRes.body.data.settings.returnPrefix).toBe('SR');
    expect(updateSettingsRes.body.data.settings.shiftPrefix).toBe('SH');

    // Verify GET /api/v1/settings/records and all 7 schema fields of settings
    const recordsRes = await request(app)
      .get('/api/v1/settings/records')
      .set('Authorization', `Bearer ${token}`);
    expect(recordsRes.status).toBe(200);
    expect(Array.isArray(recordsRes.body.data)).toBe(true);
    expect(recordsRes.body.data.length).toBeGreaterThan(0);

    const firstSetting = recordsRes.body.data[0];
    expect(firstSetting.id).toBeDefined();
    expect(firstSetting.tenantId).toBeDefined();
    expect(firstSetting.branchId === null || typeof firstSetting.branchId === 'string').toBe(true);
    expect(firstSetting.settingKey).toBeDefined();
    expect(firstSetting.settingValue).toBeDefined();
    expect(firstSetting.createdAt).toBeDefined();
    expect(firstSetting.updatedAt).toBeDefined();

    // Verify GET /api/v1/settings/records/:id by UUID
    const singleRecordRes = await request(app)
      .get(`/api/v1/settings/records/${firstSetting.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(singleRecordRes.status).toBe(200);
    expect(singleRecordRes.body.data.id).toBe(firstSetting.id);
    expect(singleRecordRes.body.data.settingKey).toBe(firstSetting.settingKey);

    // Verify GET /api/v1/settings/records/:settingKey by key name
    const keyLookupRes = await request(app)
      .get('/api/v1/settings/records/orderPrefix')
      .set('Authorization', `Bearer ${token}`);
    expect(keyLookupRes.status).toBe(200);
    expect(keyLookupRes.body.data.settingKey).toBe('orderPrefix');
    expect(keyLookupRes.body.data.settingValue).toBe('INV');

    // Verify unique constraint: tenant_id + branch_id + setting_key cannot have duplicate rows
    await expect(
      mockPrisma.current.setting.create({
        data: {
          tenantId: firstSetting.tenantId,
          branchId: firstSetting.branchId,
          settingKey: firstSetting.settingKey,
          settingValue: 'DUPLICATE_VAL',
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/i);

    // 4. Exchange Rates
    const newRateRes = await request(app)
      .post('/api/v1/settings/exchange-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        baseCurrency: 'USD',
        targetCurrency: 'KHR',
        rate: '4120.000000',
      });
    expect(newRateRes.status).toBe(201);
    expect(newRateRes.body.data.rate).toBe('4120.000000');

    const settingsAfterRate = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(settingsAfterRate.body.data.exchangeRates[0].rate).toBe('4120.000000');

    // 5. Verify custom numbering formats apply when generating shifts, orders, returns, and purchases
    const [catRes, unitRes, supRes] = await Promise.all([
      request(app).post('/api/v1/categories').set('Authorization', `Bearer ${token}`).send({ name: 'Bakery' }),
      request(app).post('/api/v1/units').set('Authorization', `Bearer ${token}`).send({ name: 'Piece', abbreviation: 'pcs' }),
      request(app).post('/api/v1/suppliers').set('Authorization', `Bearer ${token}`).send({ name: 'Bake Supply Co' }),
    ]);

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: catRes.body.data.id,
        unitId: unitRes.body.data.id,
        sku: 'CAKE-01',
        name: 'Strawberry Cake',
        costPrice: '5.00',
        sellingPrice: '12.00',
        trackInventory: true,
        openingStock: '20',
        branchId,
      });
    const productId = prodRes.body.data.id;

    // Shift should use prefix SH-
    const openShiftRes = await request(app)
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, openingCash: '100.00' });
    expect(openShiftRes.status).toBe(201);
    expect(openShiftRes.body.data.shiftNumber.startsWith('SH-')).toBe(true);

    // Order should use prefix INV-
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        taxAmount: '1.20',
        items: [{ productId, quantity: '1' }],
        payments: [{ paymentMethod: 'CASH', amount: '13.20', currencyCode: 'USD' }],
      });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.orderNumber.startsWith('INV-')).toBe(true);

    // Return should use prefix SR-
    const returnRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: orderRes.body.data.id,
        returnReason: 'Wrong flavor',
        refundMethod: 'CASH',
        items: [{ orderItemId: orderRes.body.data.orderItems[0].id, quantity: '1', restockQuantity: '1' }],
      });
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.returnNumber.startsWith('SR-')).toBe(true);

    // Purchase should use prefix PO-
    const purchaseRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: supRes.body.data.id,
        currencyCode: 'USD',
        receiveImmediately: false,
        items: [{ productId, quantity: '5', unitCost: '5.00' }],
      });
    expect(purchaseRes.status).toBe(201);
    expect(purchaseRes.body.data.purchaseNumber.startsWith('PO-')).toBe(true);

    // 6. RBAC guards: Cashier without tenant.update is blocked from system settings & exchange rates, but can manage own preferences
    const cashierRole = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cashier Staff', permissionCodes: ['sales.create', 'sales.view'] });

    await request(app)
      .post('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: 'CASH-002',
        name: 'Dara',
        email: 'dara@bayv.com.kh',
        branchIds: [branchId],
        roleId: cashierRole.body.data.id,
        createUserAccount: true,
        password: 'Password123',
      });

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'dara@bayv.com.kh',
      password: 'Password123',
    });
    const cashierToken = cashierLogin.body.data.tokens.accessToken;

    const blockedSettings = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ settings: { orderPrefix: 'HACK' } });
    expect(blockedSettings.status).toBe(403);
    expect(blockedSettings.body.error.code).toBe('PERMISSION_DENIED');

    const blockedExchangeRate = await request(app)
      .post('/api/v1/settings/exchange-rates')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ baseCurrency: 'USD', targetCurrency: 'KHR', rate: '5000' });
    expect(blockedExchangeRate.status).toBe(403);
    expect(blockedExchangeRate.body.error.code).toBe('PERMISSION_DENIED');

    // But cashier CAN view and update their own user preferences
    const cashierPrefsGet = await request(app)
      .get('/api/v1/settings/user-preferences')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(cashierPrefsGet.status).toBe(200);

    const cashierPrefsPut = await request(app)
      .put('/api/v1/settings/user-preferences')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ language: 'km', posSoundEnabled: true });
    expect(cashierPrefsPut.status).toBe(200);
    expect(cashierPrefsPut.body.data.language).toBe('km');
    expect(cashierPrefsPut.body.data.posSoundEnabled).toBe(true);
  });

  it('FR-14: records important user actions, tracks record creators/updaters, captures transaction status changes, and supports authorized history reviews', async () => {
    // 1. Register a tenant owner
    const { token, branchId, userId } = await registerOwner('owner@logmart.com.kh', 'Log Mart');

    // 2. Perform important actions across modules:
    // Catalog category and product
    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Snacks' });
    expect(catRes.status).toBe(201);
    const categoryId = catRes.body.data.id;

    // Update category (verifies track who updated record with oldValues vs newValues)
    const catUpdateRes = await request(app)
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Crispy Snacks' });
    expect(catUpdateRes.status).toBe(200);

    const unitRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pack', abbreviation: 'pk' });
    expect(unitRes.status).toBe(201);

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        unitId: unitRes.body.data.id,
        sku: 'LOG-SNK-01',
        name: 'Potato Chips',
        costPrice: '1.00',
        sellingPrice: '2.50',
        trackInventory: true,
        openingStock: '100',
        branchId,
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id;

    // Update product (verifies oldValues and newValues)
    const prodUpdateRes = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sellingPrice: '3.00', name: 'Premium Potato Chips' });
    expect(prodUpdateRes.status).toBe(200);

    // Shift: open shift
    const shiftRes = await request(app)
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, openingCash: '100.00' });
    expect(shiftRes.status).toBe(201);
    const shiftId = shiftRes.body.data.id;

    // Sales: create order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        currencyCode: 'USD',
        items: [{ productId, quantity: '2' }],
        payments: [{ paymentMethod: 'CASH', currencyCode: 'USD', amount: '6.00' }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;
    const orderItemId = orderRes.body.data.orderItems[0].id;

    // Transaction status change 1: Order returned (Order status changes COMPLETED -> RETURNED)
    const returnRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        returnReason: 'Customer change of mind',
        refundMethod: 'CASH',
        items: [{ orderItemId, quantity: '2', restockQuantity: '2' }],
      });
    expect(returnRes.status).toBe(201);

    // Shift: close shift (Transaction status change 2: Shift status changes OPEN -> CLOSED)
    const shiftCloseRes = await request(app)
      .post(`/api/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualCash: '100.00', closingNotes: 'Balanced drawer' });
    expect(shiftCloseRes.status).toBe(200);

    // Purchasing: create purchase with UNPAID status
    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Log Supplies Co' });
    expect(supRes.status).toBe(201);

    const purchaseRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId,
        supplierId: supRes.body.data.id,
        currencyCode: 'USD',
        receiveImmediately: false,
        items: [{ productId, quantity: '10', unitCost: '1.00' }],
      });
    expect(purchaseRes.status).toBe(201);
    const purchaseId = purchaseRes.body.data.id;
    expect(purchaseRes.body.data.status).toBe('ORDERED');

    // Transaction status change 3: Receive purchase (ORDERED -> RECEIVED)
    const receiveRes = await request(app)
      .post(`/api/v1/purchases/${purchaseId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(receiveRes.status).toBe(200);

    // Transaction status change 4: Record full purchase payment (UNPAID -> PAID)
    const purchasePayRes = await request(app)
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', currencyCode: 'USD', paymentMethod: 'CASH' });
    expect(purchasePayRes.status).toBe(201);

    // 3. Review History & Query Activity Logs as authorized user
    // A. Fetch all logs (with pagination meta)
    const allLogsRes = await request(app)
      .get('/api/v1/activity-logs?limit=50')
      .set('Authorization', `Bearer ${token}`);
    expect(allLogsRes.status).toBe(200);
    expect(Array.isArray(allLogsRes.body.data)).toBe(true);
    expect(allLogsRes.body.meta).toBeDefined();
    expect(allLogsRes.body.meta.total).toBeGreaterThanOrEqual(8);

    const allActions = allLogsRes.body.data.map((l: any) => l.action);
    expect(allActions).toContain('category.created');
    expect(allActions).toContain('category.updated');
    expect(allActions).toContain('product.created');
    expect(allActions).toContain('product.updated');
    expect(allActions).toContain('shift.opened');
    expect(allActions).toContain('order.completed');
    expect(allActions).toContain('order.status_changed');
    expect(allActions).toContain('sale_return.created');
    expect(allActions).toContain('shift.closed');
    expect(allActions).toContain('purchase.created');
    expect(allActions).toContain('purchase.received');
    expect(allActions).toContain('purchase.status_changed');

    // B. Verify who created/updated records
    const productUpdateLog = allLogsRes.body.data.find(
      (l: any) => l.action === 'product.updated' && l.recordId === productId,
    );
    expect(productUpdateLog).toBeDefined();
    expect(productUpdateLog.userId).toBe(userId);
    expect(productUpdateLog.user).toBeDefined();
    expect(productUpdateLog.user.email).toBe('owner@logmart.com.kh');
    expect(productUpdateLog.oldValues).toBeDefined();
    expect(productUpdateLog.oldValues.name).toBe('Potato Chips');
    expect(productUpdateLog.newValues.name).toBe('Premium Potato Chips');
    expect(productUpdateLog.newValues.sellingPrice).toBe('3.00');

    // C. Verify transaction status changes
    const orderStatusLog = allLogsRes.body.data.find(
      (l: any) => l.action === 'order.status_changed' && l.recordId === orderId,
    );
    expect(orderStatusLog).toBeDefined();
    expect(orderStatusLog.oldValues.status).toBe('COMPLETED');
    expect(orderStatusLog.newValues.status).toBe('RETURNED');

    const shiftCloseLog = allLogsRes.body.data.find(
      (l: any) => l.action === 'shift.closed' && l.recordId === shiftId,
    );
    expect(shiftCloseLog).toBeDefined();
    expect(shiftCloseLog.oldValues.status).toBe('OPEN');
    expect(shiftCloseLog.newValues.status).toBe('CLOSED');

    const purchaseStatusLog = allLogsRes.body.data.find(
      (l: any) => l.action === 'purchase.status_changed' && l.recordId === purchaseId,
    );
    expect(purchaseStatusLog).toBeDefined();
    expect(purchaseStatusLog.oldValues.paymentStatus).toBe('UNPAID');
    expect(purchaseStatusLog.newValues.paymentStatus).toBe('PAID');

    // D. Filter by module
    const salesLogsRes = await request(app)
      .get('/api/v1/activity-logs?module=sales')
      .set('Authorization', `Bearer ${token}`);
    expect(salesLogsRes.status).toBe(200);
    expect(salesLogsRes.body.data.every((l: any) => l.module === 'sales')).toBe(true);

    // E. Search filter
    const searchLogsRes = await request(app)
      .get(`/api/v1/activity-logs?search=${encodeURIComponent('Premium')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(searchLogsRes.status).toBe(200);

    // F. Activity Log Stats endpoint
    const statsRes = await request(app)
      .get('/api/v1/activity-logs/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.totalLogs).toBeGreaterThanOrEqual(8);
    expect(statsRes.body.data.uniqueUsers).toBeGreaterThanOrEqual(1);
    expect(statsRes.body.data.statusTransitions).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(statsRes.body.data.topModules)).toBe(true);

    // 4. RBAC: Unauthorized user without activity_logs.view is rejected with 403 PERMISSION_DENIED
    const cashierRole = await request(app)
      .post('/api/v1/access/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cashier Without Audit', permissionCodes: ['sales.create', 'sales.view'] });

    await request(app)
      .post('/api/v1/access/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeCode: 'CASH-999',
        name: 'Sokha Cashier',
        email: 'sokha@logmart.com.kh',
        branchIds: [branchId],
        roleId: cashierRole.body.data.id,
        createUserAccount: true,
        password: 'Password123',
      });

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'sokha@logmart.com.kh',
      password: 'Password123',
    });
    const cashierToken = cashierLogin.body.data.tokens.accessToken;

    const blockedLogs = await request(app)
      .get('/api/v1/activity-logs')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(blockedLogs.status).toBe(403);
    expect(blockedLogs.body.error.code).toBe('PERMISSION_DENIED');

    const blockedStats = await request(app)
      .get('/api/v1/activity-logs/stats')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(blockedStats.status).toBe(403);
    expect(blockedStats.body.error.code).toBe('PERMISSION_DENIED');

    // 5. Cross-tenant isolation: another tenant cannot see this tenant's activity logs
    const { token: otherTenantToken } = await registerOwner('owner@othermart.com.kh', 'Other Mart');
    const otherLogs = await request(app)
      .get('/api/v1/activity-logs')
      .set('Authorization', `Bearer ${otherTenantToken}`);
    expect(otherLogs.status).toBe(200);
    const otherRecordIds = otherLogs.body.data.map((l: any) => l.recordId);
    expect(otherRecordIds).not.toContain(productId);
    expect(otherRecordIds).not.toContain(orderId);
    expect(otherRecordIds).not.toContain(purchaseId);
  });
});
