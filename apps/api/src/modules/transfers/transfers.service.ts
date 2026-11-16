import type {
  CreateStockTransferInput,
  StockTransferQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';

export interface ActorContext {
  userId: string;
  employeeId?: string | null;
  ipAddress?: string | null;
}

export async function createStockTransfer(
  tenantId: string,
  currentBranchId: string,
  actor: ActorContext,
  input: CreateStockTransferInput,
) {
  const fromBranchId = input.fromBranchId ?? currentBranchId;
  const toBranchId = input.toBranchId;

  if (fromBranchId === toBranchId) {
    throw AppError.badRequest(
      'Source branch and destination branch must be different.',
      'INVALID_BRANCHES',
    );
  }

  // Validate branches exist
  const [fromBranch, toBranch] = await Promise.all([
    prisma.branch.findUnique({ where: { id: fromBranchId } }),
    prisma.branch.findUnique({ where: { id: toBranchId } }),
  ]);

  if (!fromBranch || fromBranch.tenantId !== tenantId) {
    throw AppError.notFound('Source branch not found.');
  }
  if (!toBranch || toBranch.tenantId !== tenantId) {
    throw AppError.notFound('Destination branch not found.');
  }

  // Validate products exist
  const productIds = input.items.map((i: any) => i.productId);
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds } },
  });
  if (products.length !== productIds.length) {
    throw AppError.badRequest('One or more products were not found.');
  }

  const employeeId = await resolveActorEmployeeId(prisma, tenantId, actor.userId, actor.employeeId);
  const prefix = await getTenantDocumentPrefix(prisma, tenantId, 'TRANSFER', 'TRF');
  const count = await ((prisma as any).stockTransfer?.count({ where: { tenantId } }) ?? Promise.resolve(0));
  const transferNumber = generateDocumentNumber(prefix, count + 1);

  const transfer = await (prisma as any).stockTransfer.create({
    data: {
      tenantId,
      fromBranchId,
      toBranchId,
      transferNumber,
      status: 'PENDING',
      notes: input.notes ?? null,
      transferDate: input.transferDate ? new Date(input.transferDate) : new Date(),
      createdBy: employeeId,
      items: {
        create: input.items.map((it: any) => ({
          productId: it.productId,
          quantity: it.quantity,
          notes: it.notes ?? null,
        })),
      },
    },
    include: {
      fromBranch: { select: { id: true, name: true, branchCode: true } },
      toBranch: { select: { id: true, name: true, branchCode: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
        },
      },
    },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId,
    action: 'transfer.created',
    module: 'inventory',
    recordType: 'StockTransfer',
    recordId: transfer.id,
    newValues: {
      transferNumber,
      fromBranchId,
      toBranchId,
      itemsCount: input.items.length,
    },
    ipAddress: actor.ipAddress,
  });

  return transfer;
}

export async function sendStockTransfer(
  tenantId: string,
  transferId: string,
  actor: ActorContext,
) {
  const transfer = await (prisma as any).stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });

  if (!transfer || transfer.tenantId !== tenantId) {
    throw AppError.notFound('Stock transfer not found.');
  }

  if (transfer.status !== 'PENDING') {
    throw AppError.badRequest(
      `Cannot send transfer with status ${transfer.status}. Only PENDING transfers can be dispatched.`,
    );
  }

  const employeeId = await resolveActorEmployeeId(prisma, tenantId, actor.userId, actor.employeeId);

  // Deduct stock from source branch
  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      await applyStockMovement(tx, {
        tenantId,
        branchId: transfer.fromBranchId,
        productId: item.productId,
        movementType: 'transfer_out',
        quantityOut: item.quantity.toString(),
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        notes: `Transfer dispatched: ${transfer.transferNumber}`,
        createdByEmployeeId: employeeId,
      });
    }

    await (tx as any).stockTransfer.update({
      where: { id: transfer.id },
      data: { status: 'IN_TRANSIT' },
    });
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId,
    action: 'transfer.dispatched',
    module: 'inventory',
    recordType: 'StockTransfer',
    recordId: transfer.id,
    oldValues: { status: 'PENDING' },
    newValues: { status: 'IN_TRANSIT' },
    ipAddress: actor.ipAddress,
  });

  return (prisma as any).stockTransfer.findUnique({
    where: { id: transfer.id },
    include: {
      fromBranch: { select: { id: true, name: true, branchCode: true } },
      toBranch: { select: { id: true, name: true, branchCode: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
        },
      },
    },
  });
}

export async function receiveStockTransfer(
  tenantId: string,
  transferId: string,
  actor: ActorContext,
) {
  const transfer = await (prisma as any).stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });

  if (!transfer || transfer.tenantId !== tenantId) {
    throw AppError.notFound('Stock transfer not found.');
  }

  if (transfer.status !== 'IN_TRANSIT') {
    throw AppError.badRequest(
      `Cannot receive transfer with status ${transfer.status}. Only IN_TRANSIT transfers can be received.`,
    );
  }

  const employeeId = await resolveActorEmployeeId(prisma, tenantId, actor.userId, actor.employeeId);

  // Increase stock at destination branch
  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      await applyStockMovement(tx, {
        tenantId,
        branchId: transfer.toBranchId,
        productId: item.productId,
        movementType: 'transfer_in',
        quantityIn: item.quantity.toString(),
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        notes: `Transfer received: ${transfer.transferNumber}`,
        createdByEmployeeId: employeeId,
      });
    }

    await (tx as any).stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: 'COMPLETED',
        receivedDate: new Date(),
      },
    });
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId,
    action: 'transfer.received',
    module: 'inventory',
    recordType: 'StockTransfer',
    recordId: transfer.id,
    oldValues: { status: 'IN_TRANSIT' },
    newValues: { status: 'COMPLETED' },
    ipAddress: actor.ipAddress,
  });

  return (prisma as any).stockTransfer.findUnique({
    where: { id: transfer.id },
    include: {
      fromBranch: { select: { id: true, name: true, branchCode: true } },
      toBranch: { select: { id: true, name: true, branchCode: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
        },
      },
    },
  });
}

export async function cancelStockTransfer(
  tenantId: string,
  transferId: string,
  actor: ActorContext,
) {
  const transfer = await (prisma as any).stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });

  if (!transfer || transfer.tenantId !== tenantId) {
    throw AppError.notFound('Stock transfer not found.');
  }

  if (transfer.status === 'COMPLETED' || transfer.status === 'CANCELLED') {
    throw AppError.badRequest(
      `Cannot cancel transfer with status ${transfer.status}.`,
    );
  }

  const employeeId = await resolveActorEmployeeId(prisma, tenantId, actor.userId, actor.employeeId);

  await prisma.$transaction(async (tx) => {
    // If it was already in transit, restore stock to source branch
    if (transfer.status === 'IN_TRANSIT') {
      for (const item of transfer.items) {
        await applyStockMovement(tx, {
          tenantId,
          branchId: transfer.fromBranchId,
          productId: item.productId,
          movementType: 'transfer_in',
          quantityIn: item.quantity.toString(),
          referenceType: 'TRANSFER_REVERSAL',
          referenceId: transfer.id,
          notes: `Transfer cancelled & reversed: ${transfer.transferNumber}`,
          createdByEmployeeId: employeeId,
        });
      }
    }

    await (tx as any).stockTransfer.update({
      where: { id: transfer.id },
      data: { status: 'CANCELLED' },
    });
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId,
    action: 'transfer.cancelled',
    module: 'inventory',
    recordType: 'StockTransfer',
    recordId: transfer.id,
    oldValues: { status: transfer.status },
    newValues: { status: 'CANCELLED' },
    ipAddress: actor.ipAddress,
  });

  return { success: true, message: 'Stock transfer cancelled.' };
}

export async function listStockTransfers(
  tenantId: string,
  query: StockTransferQueryInput,
) {
  const where: any = {
    tenantId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.fromBranchId ? { fromBranchId: query.fromBranchId } : {}),
    ...(query.toBranchId ? { toBranchId: query.toBranchId } : {}),
  };

  const take = query.limit ?? 20;
  const skip = ((query.page ?? 1) - 1) * take;

  const [total, rows] = await Promise.all([
    (prisma as any).stockTransfer.count({ where }),
    (prisma as any).stockTransfer.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true, branchCode: true } },
        toBranch: { select: { id: true, name: true, branchCode: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
  ]);

  return {
    data: rows,
    pagination: {
      total,
      page: query.page ?? 1,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getStockTransfer(tenantId: string, transferId: string) {
  const transfer = await (prisma as any).stockTransfer.findUnique({
    where: { id: transferId },
    include: {
      fromBranch: { select: { id: true, name: true, branchCode: true } },
      toBranch: { select: { id: true, name: true, branchCode: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
        },
      },
    },
  });

  if (!transfer || transfer.tenantId !== tenantId) {
    throw AppError.notFound('Stock transfer not found.');
  }

  return transfer;
}
