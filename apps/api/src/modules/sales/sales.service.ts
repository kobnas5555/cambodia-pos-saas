import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  decimalToScaledInt,
  mulDecimals,
  scaledIntToDecimal,
  subDecimals,
  type CreateOrderInput,
  type CreateSaleReturnInput,
  type CurrencyCode,
  type ListPaymentsQueryInput,
  type ListSaleReturnsQueryInput,
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

export async function listOrderItems(
  tenantId: string,
  filters: {
    orderId?: string;
    productId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  } | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    order: {
      tenantId,
      ...(query.orderId ? { id: query.orderId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    },
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search
      ? {
          OR: [
            { productNameSnapshot: { contains: query.search, mode: 'insensitive' } },
            { skuSnapshot: { contains: query.search, mode: 'insensitive' } },
            { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.orderItem.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const items = await prisma.orderItem.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          currencyCode: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true, branchCode: true } },
          customer: { select: { id: true, name: true, customerCode: true } },
        },
      },
      product: {
        select: { id: true, name: true, sku: true, barcode: true, trackInventory: true },
      },
    },
    orderBy: { order: { createdAt: 'desc' } },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(items, {
    items,
    total,
    page,
    limit,
    totalPages,
  });
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

export async function listPayments(
  tenantId: string,
  options?: Partial<ListPaymentsQueryInput> & {
    branchId?: string;
    orderId?: string;
    paymentMethod?: string;
    currencyCode?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number | string;
    limit?: number | string;
  },
) {
  const query = options || {};
  const page = Math.max(1, Number(query.page) || 1);
  const take = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * take;

  const where: any = {
    tenantId,
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.branchId ? { order: { branchId: query.branchId } } : {}),
  };

  if (query.startDate || query.endDate) {
    where.paidAt = {};
    if (query.startDate) where.paidAt.gte = new Date(query.startDate);
    if (query.endDate) where.paidAt.lte = new Date(query.endDate);
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { referenceNumber: { contains: s, mode: 'insensitive' } },
      { paymentMethod: { contains: s, mode: 'insensitive' } },
      { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
      { order: { branch: { name: { contains: s, mode: 'insensitive' } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            currencyCode: true,
            totalAmount: true,
            status: true,
            branch: { select: { id: true, name: true, branchCode: true } },
            cashierEmployee: { select: { id: true, name: true, employeeCode: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;
  return Object.assign(items, {
    items,
    total,
    page,
    limit: take,
    totalPages,
  });
}

// ============================================================================
// Phase 8: Sales Returns & Refunds
// ============================================================================

export async function listSaleReturns(
  tenantId: string,
  options?: Partial<ListSaleReturnsQueryInput> & {
    branchId?: string;
    orderId?: string;
    employeeId?: string;
    refundMethod?: string;
    restockStatus?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number | string;
    limit?: number | string;
  },
) {
  const query = options || {};
  const page = Math.max(1, Number(query.page) || 1);
  const take = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * take;

  const where: any = {
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.refundMethod ? { refundMethod: query.refundMethod } : {}),
    ...(query.restockStatus ? { restockStatus: query.restockStatus } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  if (query.startDate || query.endDate) {
    where.returnedAt = {};
    if (query.startDate) where.returnedAt.gte = new Date(query.startDate);
    if (query.endDate) where.returnedAt.lte = new Date(query.endDate);
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { returnNumber: { contains: s, mode: 'insensitive' } },
      { returnReason: { contains: s, mode: 'insensitive' } },
      { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
      { order: { branch: { name: { contains: s, mode: 'insensitive' } } } },
      { employee: { name: { contains: s, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.saleReturn.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            currencyCode: true,
            totalAmount: true,
            status: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        employee: { select: { id: true, name: true, employeeCode: true } },
        saleReturnItems: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
      orderBy: { returnedAt: 'desc' },
      skip,
      take,
    }),
    prisma.saleReturn.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;
  return Object.assign(items, {
    items,
    total,
    page,
    limit: take,
    totalPages,
  });
}

export async function createSaleReturn(
  tenantId: string,
  actor: ActorInfo,
  input: CreateSaleReturnInput,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, tenantId },
      include: {
        orderItems: true,
        saleReturns: { include: { saleReturnItems: true } },
      },
    });

    if (!order) {
      throw AppError.notFound('Original order not found', 'ORDER_NOT_FOUND');
    }

    if (order.status === 'RETURNED' || order.status === 'VOIDED') {
      throw AppError.badRequest('This order has already been fully returned', 'ORDER_ALREADY_RETURNED');
    }

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);

    const alreadyReturnedByOrderItem = new Map<string, string>();
    for (const ret of order.saleReturns) {
      for (const ri of ret.saleReturnItems) {
        const prev = alreadyReturnedByOrderItem.get(ri.orderItemId) ?? '0';
        alreadyReturnedByOrderItem.set(
          ri.orderItemId,
          addDecimals(prev, ri.quantity.toString(), 4),
        );
      }
    }

    const orderItemMap = new Map(order.orderItems.map((oi) => [oi.id, oi]));
    const productIds = Array.from(
      new Set(
        input.items
          .map((i) => orderItemMap.get(i.orderItemId)?.productId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const products = productIds.length
      ? await tx.product.findMany({ where: { id: { in: productIds }, tenantId } })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = '0.00';
    let anyRestocked = false;
    let allRestocked = true;
    const isKhr = order.currencyCode === 'KHR';

    const preparedReturnItems: Array<{
      orderItemId: string;
      productId: string;
      quantity: string;
      unitPrice: string;
      refundAmount: string;
      restockQuantity: string;
      trackInventory: boolean;
    }> = [];

    for (const item of input.items) {
      const oi = orderItemMap.get(item.orderItemId);
      if (!oi) {
        throw AppError.badRequest(`Order item ${item.orderItemId} does not belong to this order`);
      }

      const returnedSoFar = alreadyReturnedByOrderItem.get(oi.id) ?? '0';
      const remainingQty = subDecimals(oi.quantity.toString(), returnedSoFar, 4);

      if (compareDecimals(item.quantity, remainingQty, 4) > 0) {
        throw AppError.badRequest(
          `Return quantity (${item.quantity}) exceeds remaining returnable quantity (${remainingQty}) for ${oi.productNameSnapshot}`,
          'RETURN_QUANTITY_EXCEEDED',
        );
      }

      if (compareDecimals(item.restockQuantity, item.quantity, 4) > 0) {
        throw AppError.badRequest(
          'Restock quantity cannot exceed returned quantity',
          'INVALID_RESTOCK_QUANTITY',
        );
      }

      const product = productMap.get(oi.productId);
      const trackInventory = product ? product.trackInventory : true;
      if (!trackInventory && compareDecimals(item.restockQuantity, '0', 4) > 0) {
        throw AppError.badRequest(
          `Cannot restock non-inventory-tracked product ${oi.productNameSnapshot}`,
          'INVENTORY_NOT_TRACKED',
        );
      }

      if (compareDecimals(item.restockQuantity, '0', 4) > 0) {
        anyRestocked = true;
      }
      if (compareDecimals(item.restockQuantity, item.quantity, 4) < 0) {
        allRestocked = false;
      }

      const lineTotalCents = decimalToScaledInt(oi.lineTotal.toString(), 2);
      const origQtyScaled = decimalToScaledInt(oi.quantity.toString(), 4);
      const returnQtyScaled = decimalToScaledInt(item.quantity, 4);
      let itemRefundCents =
        origQtyScaled > 0n
          ? (lineTotalCents * returnQtyScaled + origQtyScaled / 2n) / origQtyScaled
          : 0n;
      if (isKhr) {
        itemRefundCents = ((itemRefundCents + 50n) / 100n) * 100n;
      }
      const itemRefund = scaledIntToDecimal(itemRefundCents, 2);

      subtotal = addDecimals(subtotal, itemRefund, 2);
      alreadyReturnedByOrderItem.set(oi.id, addDecimals(returnedSoFar, item.quantity, 4));

      preparedReturnItems.push({
        orderItemId: oi.id,
        productId: oi.productId,
        quantity: item.quantity,
        unitPrice: oi.unitPrice.toString(),
        refundAmount: itemRefund,
        restockQuantity: item.restockQuantity,
        trackInventory,
      });
    }

    const fullyReturned = order.orderItems.every((oi) => {
      const totalReturned = alreadyReturnedByOrderItem.get(oi.id) ?? '0';
      return compareDecimals(totalReturned, oi.quantity.toString(), 4) >= 0;
    });

    const returnSubtotalCents = decimalToScaledInt(subtotal, 2);
    const orderSubtotalCents = decimalToScaledInt(order.subtotal.toString(), 2);
    const orderTotalCents = decimalToScaledInt(order.totalAmount.toString(), 2);
    const refundedSoFarCents = order.saleReturns.reduce(
      (sum, sr) => sum + decimalToScaledInt(sr.refundAmount.toString(), 2),
      0n,
    );
    const remainingRefundableCents =
      orderTotalCents > refundedSoFarCents ? orderTotalCents - refundedSoFarCents : 0n;

    let refundAmountCents: bigint;
    if (fullyReturned) {
      refundAmountCents = remainingRefundableCents;
    } else if (orderSubtotalCents > 0n && orderTotalCents !== orderSubtotalCents) {
      let scaled =
        (returnSubtotalCents * orderTotalCents + orderSubtotalCents / 2n) / orderSubtotalCents;
      if (isKhr) {
        scaled = ((scaled + 50n) / 100n) * 100n;
      }
      refundAmountCents =
        scaled > remainingRefundableCents ? remainingRefundableCents : scaled;
    } else {
      refundAmountCents =
        returnSubtotalCents > remainingRefundableCents
          ? remainingRefundableCents
          : returnSubtotalCents;
    }
    const refundAmount = scaledIntToDecimal(refundAmountCents, 2);

    const returnCount = await tx.saleReturn.count({
      where: { tenantId, branchId: order.branchId },
    });
    const returnPrefix = await getTenantDocumentPrefix(tx, tenantId, 'returnPrefix', 'RET');
    const returnNumber = generateDocumentNumber(returnPrefix, returnCount);
    const restockStatus = allRestocked
      ? 'RESTOCKED'
      : anyRestocked
        ? 'PARTIAL'
        : 'NONE';

    const saleReturn = await tx.saleReturn.create({
      data: {
        tenantId,
        branchId: order.branchId,
        orderId: order.id,
        returnNumber,
        employeeId,
        returnReason: input.returnReason,
        subtotal,
        refundAmount,
        refundMethod: input.refundMethod,
        restockStatus,
        status: 'COMPLETED',
        saleReturnItems: {
          create: preparedReturnItems.map(({ trackInventory: _ti, ...riData }) => riData),
        },
      },
      include: {
        saleReturnItems: true,
        order: { select: { id: true, orderNumber: true, currencyCode: true } },
      },
    });

    for (const ri of preparedReturnItems) {
      if (ri.trackInventory && compareDecimals(ri.restockQuantity, '0', 4) > 0) {
        await applyStockMovement(tx, {
          tenantId,
          branchId: order.branchId,
          productId: ri.productId,
          movementType: 'sale_return_in',
          quantityIn: ri.restockQuantity,
          referenceType: 'SaleReturn',
          referenceId: saleReturn.id,
          notes: `Return ${returnNumber}: ${input.returnReason}`,
          createdByEmployeeId: employeeId,
        });
      }
    }

    const newOrderStatus = fullyReturned ? 'RETURNED' : 'PARTIALLY_RETURNED';
    await tx.order.update({
      where: { id: order.id },
      data: { status: newOrderStatus },
    });

    if (order.status !== newOrderStatus) {
      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId,
          action: 'order.status_changed',
          module: 'sales',
          recordType: 'Order',
          recordId: order.id,
          oldValues: { status: order.status },
          newValues: { status: newOrderStatus, returnNumber },
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    }

    if (input.refundMethod === 'CASH') {
      const openShift = await tx.shift.findFirst({
        where: { tenantId, branchId: order.branchId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      if (openShift) {
        const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
        const tenantCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
        const refundInTenantCurrency = convertCurrency(
          refundAmount,
          order.currencyCode as CurrencyCode,
          tenantCurrency,
          order.exchangeRate.toString(),
        );
        await tx.shift.update({
          where: { id: openShift.id },
          data: {
            expectedCash: subDecimals(openShift.expectedCash.toString(), refundInTenantCurrency, 2),
          },
        });
      }
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'sale_return.created',
        module: 'returns',
        recordType: 'SaleReturn',
        recordId: saleReturn.id,
        newValues: { returnNumber, refundAmount, restockStatus, orderId: order.id },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return saleReturn;
  });
}

export async function getSaleReturnById(tenantId: string, returnId: string) {
  const saleReturn = await prisma.saleReturn.findFirst({
    where: { id: returnId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true, phone: true, address: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          currencyCode: true,
          totalAmount: true,
          createdAt: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
      employee: { select: { id: true, name: true, employeeCode: true } },
      saleReturnItems: {
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
        },
      },
    },
  });

  if (!saleReturn) throw AppError.notFound('Sale return not found', 'SALE_RETURN_NOT_FOUND');
  return saleReturn;
}

