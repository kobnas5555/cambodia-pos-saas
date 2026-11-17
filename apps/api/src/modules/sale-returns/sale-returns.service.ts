import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  decimalToScaledInt,
  scaledIntToDecimal,
  subDecimals,
  type CreateSaleReturnInput,
  type CurrencyCode,
  type ListSaleReturnsQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

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

