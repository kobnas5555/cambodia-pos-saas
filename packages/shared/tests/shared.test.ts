import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_CODES,
  PAYMENT_METHODS,
  addDecimals,
  closeShiftSchema,
  compareDecimals,
  convertCurrency,
  createBranchSchema,
  createExpenseSchema,
  createIncomeSchema,
  createOrderSchema,
  createProductSchema,
  createPurchaseSchema,
  createSaleReturnSchema,
  createStockAdjustmentSchema,
  formatCurrency,
  getDictionary,
  mulDecimals,
  openShiftSchema,
  registerBusinessSchema,
  slugifyBusinessName,
  subDecimals,
} from '../src';

describe('@cambodia-pos/shared', () => {
  it('performs exact decimal arithmetic without floating-point errors', () => {
    expect(addDecimals('0.1', '0.2', 2)).toBe('0.30');
    expect(subDecimals('10.00', '3.33', 2)).toBe('6.67');
    expect(mulDecimals('2.5', '4.20', 4, 2, 2)).toBe('10.50');
    expect(mulDecimals('3', '1.995', 4, 3, 2)).toBe('5.99');
    expect(compareDecimals('10.5000', '10.5', 4)).toBe(0);
    expect(compareDecimals('9.9999', '10.0000', 4)).toBe(-1);
    expect(compareDecimals('12.5', '12.4999', 4)).toBe(1);
  });

  it('converts between USD and KHR accurately', () => {
    expect(convertCurrency('12.50', 'USD', 'KHR', '4100')).toBe('51250');
    expect(convertCurrency('41000', 'KHR', 'USD', '4100')).toBe('10.00');
    expect(convertCurrency('0.10', 'USD', 'KHR', '4100')).toBe('410');
    expect(convertCurrency('2.00', 'USD', 'KHR', '4050')).toBe('8100');
    expect(convertCurrency('8100', 'KHR', 'USD', '4050')).toBe('2.00');
    expect(convertCurrency('1500', 'KHR', 'KHR', '4100')).toBe('1500');
  });

  it('formats USD and KHR cleanly', () => {
    expect(formatCurrency('1250.5', 'USD')).toBe('$1,250.50');
    expect(formatCurrency('-15.25', 'USD')).toBe('-$15.25');
    expect(formatCurrency('51250', 'KHR')).toBe('51,250 ៛');
  });

  it('provides complete Khmer and English dictionaries and permission catalog', () => {
    const en = getDictionary('en');
    const km = getDictionary('km');
    expect(en.nav.dashboard).toBe('Dashboard');
    expect(km.nav.dashboard).toBe('ផ្ទាំងគ្រប់គ្រង');
    expect(km.pos.title).toContain('POS');
    expect(PAYMENT_METHODS).toEqual(['CASH', 'ABA', 'ACLEDA', 'OTHER']);
    expect(ALL_PERMISSION_CODES).toContain('products.create');
    expect(ALL_PERMISSION_CODES).toContain('sales.refund');
    expect(ALL_PERMISSION_CODES).toContain('finance.manage');
  });

  it('validates business registration and normalizes branch codes and slugs', () => {
    expect(slugifyBusinessName('BayV Accessories & Co!')).toBe('bayv-accessories-co');

    const parsed = registerBusinessSchema.parse({
      ownerName: 'Sokha Chan',
      email: 'SOKHA@EXAMPLE.COM',
      phone: '+85512345678',
      password: 'Password123',
      businessName: 'BayV Accessories',
      mainBranchCode: 'pp-01',
    });

    expect(parsed.email).toBe('sokha@example.com');
    expect(parsed.mainBranchCode).toBe('PP-01');
    expect(parsed.defaultCurrency).toBe('USD');

    const branch = createBranchSchema.parse({
      name: 'Siem Reap Branch',
      branchCode: 'sr-01',
    });
    expect(branch.branchCode).toBe('SR-01');
    expect(branch.isMain).toBe(false);
  });

  it('validates POS, Purchasing, Inventory, Return, Shift, and Finance schemas', () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';

    const product = createProductSchema.parse({
      categoryId: validUuid,
      unitId: validUuid,
      sku: 'cab-usb-c',
      name: 'USB-C Fast Cable',
      costPrice: 2.5,
      sellingPrice: 5.99,
      openingStock: 20,
    });
    expect(product.sku).toBe('CAB-USB-C');
    expect(product.costPrice).toBe('2.5');
    expect(product.trackInventory).toBe(true);

    const order = createOrderSchema.parse({
      branchId: validUuid,
      currencyCode: 'USD',
      items: [{ productId: validUuid, quantity: 2 }],
      payments: [
        { paymentMethod: 'CASH', amount: 10, currencyCode: 'USD' },
        { paymentMethod: 'ABA', amount: 8200, currencyCode: 'KHR' },
      ],
    });
    expect(order.payments).toHaveLength(2);

    const purchase = createPurchaseSchema.parse({
      branchId: validUuid,
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 50, unitCost: '2.10' }],
    });
    expect(purchase.receiveImmediately).toBe(true);

    const adjustment = createStockAdjustmentSchema.parse({
      branchId: validUuid,
      reason: 'Cycle count adjustment',
      items: [{ productId: validUuid, direction: 'OUT', quantity: 2 }],
    });
    expect(adjustment.items[0].direction).toBe('OUT');

    const saleReturn = createSaleReturnSchema.parse({
      orderId: validUuid,
      returnReason: 'Damaged item',
      items: [{ orderItemId: validUuid, quantity: 1, restockQuantity: 1 }],
    });
    expect(saleReturn.refundMethod).toBe('CASH');

    expect(openShiftSchema.parse({ branchId: validUuid, openingCash: 100 }).openingCash).toBe('100');
    expect(closeShiftSchema.parse({ actualCash: '150.50' }).actualCash).toBe('150.50');

    expect(
      createExpenseSchema.parse({
        branchId: validUuid,
        expenseTypeId: validUuid,
        amount: 25,
        currencyCode: 'USD',
      }).paymentMethod,
    ).toBe('CASH');

    expect(
      createIncomeSchema.parse({
        branchId: validUuid,
        description: 'Packaging scrap sale',
        amount: 40000,
        currencyCode: 'KHR',
      }).currencyCode,
    ).toBe('KHR');
  });
});
