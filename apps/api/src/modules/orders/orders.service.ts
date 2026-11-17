import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  mulDecimals,
  subDecimals,
  type CreateOrderInput,
  type CurrencyCode,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { getTenantDefaultExchangeRate, resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listOrders(
  tenantId: string,
  filters: {
    branchId?: string;
    customerId?: string;
    shiftId?: string;
    status?: string;
    currencyCode?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  } | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.shiftId ? { shiftId: query.shiftId } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.startDate || query.endDate
      ? {
          createdAt: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: 'insensitive' } },
            { notes: { contains: query.search, mode: 'insensitive' } },
            { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            { customer: { customerCode: { contains: query.search, mode: 'insensitive' } } },
            { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
            { cashierEmployee: { name: { contains: query.search, mode: 'insensitive' } } },
            { cashierEmployee: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
            { branch: { name: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.order.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const orders = await prisma.order.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      customer: { select: { id: true, name: true, customerCode: true, phone: true } },
      cashierEmployee: { select: { id: true, name: true, employeeCode: true } },
      shift: { select: { id: true, shiftNumber: true, status: true } },
      _count: { select: { orderItems: true, payments: true, saleReturns: true } },
    },
    orderBy: { createdAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(orders, {
    items: orders,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function getOrderById(tenantId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      tenant: { select: { id: true, name: true, address: true, phone: true } },
      branch: { select: { id: true, name: true, branchCode: true, phone: true, address: true } },
      customer: { select: { id: true, name: true, customerCode: true, phone: true } },
      cashierEmployee: { select: { id: true, name: true, employeeCode: true } },
      shift: { select: { id: true, shiftNumber: true, status: true, openedAt: true, closedAt: true } },
      orderItems: {
        include: {
          product: { select: { id: true, trackInventory: true } },
        },
      },
      payments: { orderBy: { paidAt: 'asc' } },
      saleReturns: {
        include: { saleReturnItems: true },
        orderBy: { returnedAt: 'desc' },
      },
    },
  });

  if (!order) throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
  return order;
}

export async function createOrder(
  tenantId: string,
  actor: ActorInfo,
  input: CreateOrderInput,
) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, tenantId, status: 'ACTIVE' },
    });
    if (!branch) throw AppError.notFound('Active branch not found', 'BRANCH_NOT_FOUND');

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);

    if (input.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, tenantId, status: 'ACTIVE' },
      });
      if (!customer) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    let resolvedShiftId: string | null = input.shiftId ?? null;
    if (resolvedShiftId) {
      const shift = await tx.shift.findFirst({
        where: { id: resolvedShiftId, tenantId, branchId: branch.id, status: 'OPEN' },
      });
      if (!shift) throw AppError.badRequest('Selected shift is not open', 'SHIFT_NOT_OPEN');
    } else {
      const openShift = await tx.shift.findFirst({
        where: { tenantId, branchId: branch.id, employeeId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      resolvedShiftId = openShift?.id ?? null;
    }

    const defaultRate = await getTenantDefaultExchangeRate(tx, tenantId);
    const orderExchangeRate = input.exchangeRate ?? defaultRate;
    const orderCurrency = input.currencyCode as CurrencyCode;

    const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: { tenantId, id: { in: productIds }, status: 'ACTIVE' },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = '0.00';
    const preparedItems: Array<{
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string;
      quantity: string;
      unitPrice: string;
      unitCostSnapshot: string;
      discountAmount: string;
      taxAmount: string;
      lineTotal: string;
      trackInventory: boolean;
    }> = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw AppError.notFound(`Product ${item.productId} not found or archived`, 'PRODUCT_NOT_FOUND');
      }

      const defaultUnitPrice =
        orderCurrency === 'KHR'
          ? convertCurrency(product.sellingPrice.toString(), 'USD', 'KHR', orderExchangeRate)
          : product.sellingPrice.toString();

      const unitPrice = item.unitPrice ?? defaultUnitPrice;
      const unitCostSnapshot =
        orderCurrency === 'KHR'
          ? convertCurrency(product.costPrice.toString(), 'USD', 'KHR', orderExchangeRate)
          : product.costPrice.toString();

      const gross = mulDecimals(item.quantity, unitPrice, 4, 2, 2);
      const afterDiscount = subDecimals(gross, item.discountAmount, 2);
      if (compareDecimals(afterDiscount, '0', 2) < 0) {
        throw AppError.badRequest('Line item discount cannot exceed line gross amount');
      }
      const lineTotal = addDecimals(afterDiscount, item.taxAmount, 2);

      subtotal = addDecimals(subtotal, lineTotal, 2);
      preparedItems.push({
        productId: product.id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        quantity: item.quantity,
        unitPrice,
        unitCostSnapshot,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
        lineTotal,
        trackInventory: product.trackInventory,
      });
    }

    const afterOrderDiscount = subDecimals(subtotal, input.discountAmount, 2);
    if (compareDecimals(afterOrderDiscount, '0', 2) < 0) {
      throw AppError.badRequest('Order discount cannot exceed subtotal', 'INVALID_DISCOUNT');
    }
    const totalAmount = addDecimals(afterOrderDiscount, input.taxAmount, 2);

    let paidAmount = '0.00';
    let cashInOrderCurrency = '0.00';
    const preparedPayments = input.payments.map((pay) => {
      const rate = pay.exchangeRate ?? orderExchangeRate;
      const inOrderCurrency = convertCurrency(
        pay.amount,
        pay.currencyCode as CurrencyCode,
        orderCurrency,
        rate,
      );
      paidAmount = addDecimals(paidAmount, inOrderCurrency, 2);
      if (pay.paymentMethod === 'CASH') {
        cashInOrderCurrency = addDecimals(cashInOrderCurrency, inOrderCurrency, 2);
      }
      return {
        tenantId,
        paymentMethod: pay.paymentMethod,
        amount: pay.amount,
        currencyCode: pay.currencyCode,
        exchangeRate: rate,
        amountInOrderCurrency: inOrderCurrency,
        referenceNumber: pay.referenceNumber ?? null,
        status: 'COMPLETED',
      };
    });

    if (compareDecimals(paidAmount, totalAmount, 2) < 0) {
      throw AppError.badRequest(
        `Insufficient payment (${paidAmount} paid vs ${totalAmount} due)`,
        'INSUFFICIENT_PAYMENT',
      );
    }

    const changeAmount = subDecimals(paidAmount, totalAmount, 2);
    if (compareDecimals(changeAmount, cashInOrderCurrency, 2) > 0) {
      throw AppError.badRequest(
        'Non-cash payments (ABA / ACLEDA / OTHER) cannot exceed the order total',
        'OVERPAYMENT_NOT_SUPPORTED',
      );
    }

    const orderCount = await tx.order.count({ where: { tenantId, branchId: branch.id } });
    const orderPrefix = await getTenantDocumentPrefix(tx, tenantId, 'orderPrefix', 'ORD');
    const orderNumber = generateDocumentNumber(orderPrefix, orderCount);

    const order = await tx.order.create({
      data: {
        tenantId,
        branchId: branch.id,
        customerId: input.customerId ?? null,
        cashierEmployeeId: employeeId,
        shiftId: resolvedShiftId,
        orderNumber,
        subtotal,
        discountAmount: input.discountAmount,
        taxAmount: input.taxAmount,
        totalAmount,
        paidAmount,
        changeAmount,
        currencyCode: orderCurrency,
        exchangeRate: orderExchangeRate,
        status: 'COMPLETED',
        notes: input.notes ?? null,
        completedAt: new Date(),
        orderItems: {
          create: preparedItems.map(({ trackInventory: _ti, ...itemData }) => itemData),
        },
        payments: {
          create: preparedPayments,
        },
      },
      include: {
        branch: { select: { id: true, name: true, branchCode: true, phone: true, address: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
        cashierEmployee: { select: { id: true, name: true, employeeCode: true } },
        orderItems: true,
        payments: true,
      },
    });

    for (const item of preparedItems) {
      if (item.trackInventory) {
        await applyStockMovement(tx, {
          tenantId,
          branchId: branch.id,
          productId: item.productId,
          movementType: 'sale_out',
          quantityOut: item.quantity,
          referenceType: 'Order',
          referenceId: order.id,
          notes: `POS Sale ${order.orderNumber}`,
          createdByEmployeeId: employeeId,
        });
      }
    }

    if (resolvedShiftId && compareDecimals(cashInOrderCurrency, '0', 2) > 0) {
      const netCashCollected = subDecimals(cashInOrderCurrency, changeAmount, 2);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const tenantCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
      const cashInTenantCurrency = convertCurrency(
        netCashCollected,
        orderCurrency,
        tenantCurrency,
        orderExchangeRate,
      );

      const shift = await tx.shift.findUnique({ where: { id: resolvedShiftId } });
      if (shift) {
        await tx.shift.update({
          where: { id: shift.id },
          data: {
            expectedCash: addDecimals(shift.expectedCash.toString(), cashInTenantCurrency, 2),
          },
        });
      }
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'order.completed',
        module: 'sales',
        recordType: 'Order',
        recordId: order.id,
        newValues: {
          orderNumber: order.orderNumber,
          totalAmount,
          currencyCode: orderCurrency,
        },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return order;
  });
}

