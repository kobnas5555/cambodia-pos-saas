import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  mulDecimals,
  subDecimals,
  type CreatePurchaseInput,
  type CreatePurchasePaymentInput,
  type CurrencyCode,
  type ListPurchaseItemsQueryInput,
  type ListPurchasesQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { getTenantDefaultExchangeRate, resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

function computePaymentStatus(paidAmount: string, totalAmount: string): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (compareDecimals(paidAmount, '0', 2) <= 0) return 'UNPAID';
  if (compareDecimals(paidAmount, totalAmount, 2) >= 0) return 'PAID';
  return 'PARTIAL';
}

export async function listPurchases(
  tenantId: string,
  filters: Partial<ListPurchasesQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.startDate || query.endDate
      ? {
          purchaseDate: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { purchaseNumber: { contains: query.search, mode: 'insensitive' } },
            { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
            { supplier: { contactPerson: { contains: query.search, mode: 'insensitive' } } },
            { employee: { name: { contains: query.search, mode: 'insensitive' } } },
            { branch: { name: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.purchase.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const rows = await prisma.purchase.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
      _count: { select: { purchaseItems: true, purchasePayments: true } },
    },
    orderBy: { purchaseDate: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const enriched = rows.map((p) => ({
    ...p,
    paymentStatus: computePaymentStatus(p.paidAmount.toString(), p.totalAmount.toString()),
  }));

  const filtered =
    query.paymentStatus && query.paymentStatus !== 'ALL'
      ? enriched.filter((p) => p.paymentStatus === query.paymentStatus)
      : enriched;

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(filtered, {
    items: filtered,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function listPurchasePayments(
  tenantId: string,
  filters: {
    branchId?: string;
    supplierId?: string;
    paymentMethod?: string;
    currencyCode?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  } = {},
) {
  const where: any = {
    tenantId,
    ...(filters.paymentMethod && filters.paymentMethod !== 'ALL' ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.currencyCode && filters.currencyCode !== 'ALL' ? { currencyCode: filters.currencyCode } : {}),
    ...(filters.branchId || filters.supplierId || filters.search
      ? {
          purchase: {
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            ...(filters.search
              ? {
                  OR: [
                    { purchaseNumber: { contains: filters.search, mode: 'insensitive' } },
                    { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
                  ],
                }
              : {}),
          },
        }
      : {}),
  };

  const total = await prisma.purchasePayment.count({ where });
  const hasPagination = filters.page !== undefined || filters.limit !== undefined;
  const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
  const limit = filters.limit ? Math.min(100, Math.max(1, Number(filters.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const payments = await prisma.purchasePayment.findMany({
    where,
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          totalAmount: true,
          currencyCode: true,
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { paidAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(payments, {
    items: payments,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function listPurchaseItems(
  tenantId: string,
  filters: Partial<ListPurchaseItemsQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    purchase: {
      tenantId,
      ...(query.purchaseId ? { id: query.purchaseId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.startDate || query.endDate
        ? {
            purchaseDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    },
    ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search
      ? {
          OR: [
            { productNameSnapshot: { contains: query.search, mode: 'insensitive' } },
            { purchase: { purchaseNumber: { contains: query.search, mode: 'insensitive' } } },
            { purchase: { supplier: { name: { contains: query.search, mode: 'insensitive' } } } },
            { product: { sku: { contains: query.search, mode: 'insensitive' } } },
            { product: { barcode: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.purchaseItem.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const items = await prisma.purchaseItem.findMany({
    where,
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          currencyCode: true,
          exchangeRate: true,
          status: true,
          purchaseDate: true,
          receivedAt: true,
          branch: { select: { id: true, name: true, branchCode: true } },
          supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
          employee: { select: { id: true, name: true, employeeCode: true } },
        },
      },
      product: {
        select: { id: true, name: true, sku: true, barcode: true, trackInventory: true },
      },
    },
    orderBy: { purchase: { purchaseDate: 'desc' } },
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

export async function getPurchaseById(tenantId: string, purchaseId: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      supplier: true,
      employee: { select: { id: true, name: true } },
      purchaseItems: {
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
      purchasePayments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!purchase) throw AppError.notFound('Purchase not found', 'PURCHASE_NOT_FOUND');
  return {
    ...purchase,
    paymentStatus: computePaymentStatus(
      purchase.paidAmount.toString(),
      purchase.totalAmount.toString(),
    ),
  };
}

export async function createPurchase(
  tenantId: string,
  actor: ActorInfo,
  input: CreatePurchaseInput,
) {
  return prisma.$transaction(async (tx) => {
    const [branch, supplier] = await Promise.all([
      tx.branch.findFirst({ where: { id: input.branchId, tenantId, status: 'ACTIVE' } }),
      tx.supplier.findFirst({ where: { id: input.supplierId, tenantId } }),
    ]);

    if (!branch) throw AppError.notFound('Active branch not found', 'BRANCH_NOT_FOUND');
    if (!supplier) throw AppError.notFound('Supplier not found', 'SUPPLIER_NOT_FOUND');
    if (supplier.status !== 'ACTIVE') {
      throw AppError.badRequest('Selected supplier is inactive', 'SUPPLIER_INACTIVE');
    }

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);
    const defaultRate = await getTenantDefaultExchangeRate(tx, tenantId);
    const exchangeRate = input.exchangeRate ?? defaultRate;
    const currencyCode = input.currencyCode as CurrencyCode;

    const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
    const products = await tx.product.findMany({
      where: { tenantId, id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = '0.00';
    const preparedItems: Array<{
      productId: string;
      productNameSnapshot: string;
      quantity: string;
      unitCost: string;
      discountAmount: string;
      taxAmount: string;
      lineTotal: string;
      trackInventory: boolean;
    }> = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw AppError.notFound(`Product ${item.productId} not found`, 'PRODUCT_NOT_FOUND');
      }
      if (product.status !== 'ACTIVE') {
        throw AppError.badRequest(
          `Product ${product.name} is archived and cannot be purchased`,
          'PRODUCT_ARCHIVED',
        );
      }
      const gross = mulDecimals(item.quantity, item.unitCost, 4, 2, 2);
      const afterDiscount = subDecimals(gross, item.discountAmount, 2);
      if (compareDecimals(afterDiscount, '0', 2) < 0) {
        throw AppError.badRequest('Purchase item discount cannot exceed gross cost');
      }
      const lineTotal = addDecimals(afterDiscount, item.taxAmount, 2);
      subtotal = addDecimals(subtotal, lineTotal, 2);

      preparedItems.push({
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
        lineTotal,
        trackInventory: product.trackInventory,
      });
    }

    const totalAmount = addDecimals(subDecimals(subtotal, input.discountAmount, 2), input.taxAmount, 2);
    if (compareDecimals(totalAmount, '0', 2) < 0) {
      throw AppError.badRequest('Purchase total cannot be negative');
    }

    let paidAmount = '0.00';
    if (input.initialPayment) {
      const converted = convertCurrency(
        input.initialPayment.amount,
        input.initialPayment.currencyCode as CurrencyCode,
        currencyCode,
        exchangeRate,
      );
      if (compareDecimals(converted, totalAmount, 2) > 0) {
        throw AppError.badRequest('Supplier payment cannot exceed purchase total', 'OVERPAYMENT');
      }
      paidAmount = converted;
    }

    const count = await tx.purchase.count({ where: { tenantId, branchId: branch.id } });
    const purchasePrefix = await getTenantDocumentPrefix(tx, tenantId, 'purchasePrefix', 'PUR');
    const purchaseNumber = generateDocumentNumber(purchasePrefix, count);
    const status = input.receiveImmediately ? 'RECEIVED' : 'ORDERED';

    const purchase = await tx.purchase.create({
      data: {
        tenantId,
        branchId: branch.id,
        supplierId: supplier.id,
        purchaseNumber,
        employeeId,
        subtotal,
        discountAmount: input.discountAmount,
        taxAmount: input.taxAmount,
        totalAmount,
        paidAmount,
        currencyCode,
        exchangeRate,
        status,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
        receivedAt: input.receiveImmediately ? new Date() : null,
        purchaseItems: {
          create: preparedItems.map(({ trackInventory: _ti, ...rest }) => rest),
        },
        ...(input.initialPayment
          ? {
              purchasePayments: {
                create: {
                  tenantId,
                  amount: input.initialPayment.amount,
                  currencyCode: input.initialPayment.currencyCode,
                  exchangeRate,
                  paymentMethod: input.initialPayment.paymentMethod,
                  referenceNumber: input.initialPayment.referenceNumber ?? null,
                  status: 'COMPLETED',
                },
              },
            }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        purchaseItems: true,
        purchasePayments: true,
      },
    });

    if (input.receiveImmediately) {
      for (const item of preparedItems) {
        if (item.trackInventory) {
          await applyStockMovement(tx, {
            tenantId,
            branchId: branch.id,
            productId: item.productId,
            movementType: 'purchase_in',
            quantityIn: item.quantity,
            referenceType: 'Purchase',
            referenceId: purchase.id,
            notes: `Purchase received ${purchaseNumber}`,
            createdByEmployeeId: employeeId,
          });
        }
      }
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'purchase.created',
        module: 'purchasing',
        recordType: 'Purchase',
        recordId: purchase.id,
        newValues: { purchaseNumber, totalAmount, status },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      ...purchase,
      paymentStatus: computePaymentStatus(
        purchase.paidAmount.toString(),
        purchase.totalAmount.toString(),
      ),
    };
  });
}

export async function receivePurchase(
  tenantId: string,
  purchaseId: string,
  actor: ActorInfo,
) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, tenantId },
      include: {
        purchaseItems: { include: { product: { select: { trackInventory: true } } } },
      },
    });

    if (!purchase) throw AppError.notFound('Purchase not found', 'PURCHASE_NOT_FOUND');
    if (purchase.status === 'RECEIVED') {
      throw AppError.badRequest('Purchase has already been received', 'ALREADY_RECEIVED');
    }

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);

    for (const item of purchase.purchaseItems) {
      if (item.product.trackInventory) {
        await applyStockMovement(tx, {
          tenantId,
          branchId: purchase.branchId,
          productId: item.productId,
          movementType: 'purchase_in',
          quantityIn: item.quantity.toString(),
          referenceType: 'Purchase',
          referenceId: purchase.id,
          notes: `Purchase received ${purchase.purchaseNumber}`,
          createdByEmployeeId: employeeId,
        });
      }
    }

    const updated = await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'purchase.received',
        module: 'purchasing',
        recordType: 'Purchase',
        recordId: purchase.id,
        oldValues: { status: purchase.status },
        newValues: { status: 'RECEIVED' },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      ...updated,
      paymentStatus: computePaymentStatus(
        updated.paidAmount.toString(),
        updated.totalAmount.toString(),
      ),
    };
  });
}

export async function recordPurchasePayment(
  tenantId: string,
  purchaseId: string,
  actor: ActorInfo,
  input: CreatePurchasePaymentInput,
) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, tenantId },
    });
    if (!purchase) throw AppError.notFound('Purchase not found', 'PURCHASE_NOT_FOUND');

    const rate = input.exchangeRate ?? purchase.exchangeRate.toString();
    const amountInPurchaseCurrency = convertCurrency(
      input.amount,
      input.currencyCode as CurrencyCode,
      purchase.currencyCode as CurrencyCode,
      rate,
    );

    const nextPaid = addDecimals(purchase.paidAmount.toString(), amountInPurchaseCurrency, 2);
    if (compareDecimals(nextPaid, purchase.totalAmount.toString(), 2) > 0) {
      throw AppError.badRequest(
        'Payment exceeds remaining balance due on this purchase',
        'OVERPAYMENT',
      );
    }

    const payment = await tx.purchasePayment.create({
      data: {
        tenantId,
        purchaseId: purchase.id,
        amount: input.amount,
        currencyCode: input.currencyCode,
        exchangeRate: rate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        status: 'COMPLETED',
      },
    });

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidAmount: nextPaid },
    });

    const oldPaymentStatus = computePaymentStatus(purchase.paidAmount.toString(), purchase.totalAmount.toString());
    const newPaymentStatus = computePaymentStatus(nextPaid, purchase.totalAmount.toString());

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'purchase_payment.recorded',
        module: 'purchasing',
        recordType: 'PurchasePayment',
        recordId: payment.id,
        newValues: { purchaseId, amount: input.amount, currencyCode: input.currencyCode, paymentStatus: newPaymentStatus },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    if (oldPaymentStatus !== newPaymentStatus) {
      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId: actor.employeeId,
          action: 'purchase.status_changed',
          module: 'purchasing',
          recordType: 'Purchase',
          recordId: purchase.id,
          oldValues: { paymentStatus: oldPaymentStatus, paidAmount: purchase.paidAmount.toString() },
          newValues: { paymentStatus: newPaymentStatus, paidAmount: nextPaid },
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    }

    return payment;
  });
}

