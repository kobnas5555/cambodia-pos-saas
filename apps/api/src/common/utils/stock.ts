import {
  addDecimals,
  compareDecimals,
  subDecimals,
  type StockMovementType,
} from '@cambodia-pos/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';

export type { StockMovementType };

export interface AdjustStockParams {
  tenantId: string;
  branchId: string;
  productId: string;
  movementType: StockMovementType;
  quantityIn?: string;
  quantityOut?: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string | null;
  createdByEmployeeId: string;
  allowNegative?: boolean;
}

/**
 * Atomically updates stock_balances and inserts a matching stock_movements ledger row inside a transaction.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  params: AdjustStockParams,
) {
  const qtyIn = params.quantityIn ?? '0';
  const qtyOut = params.quantityOut ?? '0';

  const existingBalance = await tx.stockBalance.findUnique({
    where: {
      tenantId_branchId_productId: {
        tenantId: params.tenantId,
        branchId: params.branchId,
        productId: params.productId,
      },
    },
  });

  const currentQty = existingBalance ? existingBalance.quantity.toString() : '0';
  const afterIn = addDecimals(currentQty, qtyIn, 4);
  const balanceAfter = subDecimals(afterIn, qtyOut, 4);

  if (!params.allowNegative && compareDecimals(balanceAfter, '0', 4) < 0) {
    throw AppError.badRequest(
      `Insufficient stock balance (available: ${currentQty}, requested out: ${qtyOut})`,
      'INSUFFICIENT_STOCK',
    );
  }

  if (existingBalance) {
    await tx.stockBalance.update({
      where: { id: existingBalance.id },
      data: { quantity: balanceAfter },
    });
  } else {
    await tx.stockBalance.create({
      data: {
        tenantId: params.tenantId,
        branchId: params.branchId,
        productId: params.productId,
        quantity: balanceAfter,
      },
    });
  }

  const movement = await tx.stockMovement.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      movementType: params.movementType,
      quantityIn: qtyIn,
      quantityOut: qtyOut,
      balanceAfter,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      notes: params.notes ?? null,
      createdBy: params.createdByEmployeeId,
    },
  });

  return { balanceAfter, movement };
}

