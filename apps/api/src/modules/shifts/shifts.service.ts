import {
  subDecimals,
  type CloseShiftInput,
  type OpenShiftInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listShifts(tenantId: string, branchId?: string) {
  return prisma.shift.findMany({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
    },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 100,
  });
}

export async function getCurrentShift(tenantId: string, branchId?: string) {
  return prisma.shift.findFirst({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
      status: 'OPEN',
    },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { openedAt: 'desc' },
  });
}

export async function getShiftById(tenantId: string, shiftId: string) {
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
      orders: {
        include: {
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      _count: { select: { orders: true } },
    },
  });
  if (!shift) throw AppError.notFound('Shift not found', 'SHIFT_NOT_FOUND');
  return shift;
}

export async function openShift(
  tenantId: string,
  actor: ActorInfo,
  input: OpenShiftInput,
) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, tenantId, status: 'ACTIVE' },
    });
    if (!branch) throw AppError.notFound('Active branch not found', 'BRANCH_NOT_FOUND');

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);

    const existingOpen = await tx.shift.findFirst({
      where: { tenantId, branchId: branch.id, employeeId, status: 'OPEN' },
    });
    if (existingOpen) {
      throw AppError.conflict(
        `Shift ${existingOpen.shiftNumber} is already open for this cashier in ${branch.name}`,
        'SHIFT_ALREADY_OPEN',
      );
    }

    const count = await tx.shift.count({ where: { tenantId, branchId: branch.id } });
    const shiftPrefix = await getTenantDocumentPrefix(tx, tenantId, 'shiftPrefix', 'SFT');
    const shiftNumber = generateDocumentNumber(shiftPrefix, count);

    const shift = await tx.shift.create({
      data: {
        tenantId,
        branchId: branch.id,
        employeeId,
        shiftNumber,
        openingCash: input.openingCash,
        expectedCash: input.openingCash,
        status: 'OPEN',
      },
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        employee: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'shift.opened',
        module: 'shifts',
        recordType: 'Shift',
        recordId: shift.id,
        newValues: { shiftNumber, openingCash: input.openingCash },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return shift;
  });
}

export async function closeShift(
  tenantId: string,
  shiftId: string,
  actor: ActorInfo,
  input: CloseShiftInput,
) {
  return prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, tenantId },
    });
    if (!shift) throw AppError.notFound('Shift not found', 'SHIFT_NOT_FOUND');
    if (shift.status !== 'OPEN') {
      throw AppError.badRequest('Shift is already closed', 'SHIFT_ALREADY_CLOSED');
    }

    const cashDifference = subDecimals(input.actualCash, shift.expectedCash.toString(), 2);

    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: {
        actualCash: input.actualCash,
        cashDifference,
        closedAt: new Date(),
        status: 'CLOSED',
      },
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        employee: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'shift.closed',
        module: 'shifts',
        recordType: 'Shift',
        recordId: shift.id,
        oldValues: {
          status: 'OPEN',
          expectedCash: shift.expectedCash.toString(),
        },
        newValues: {
          status: 'CLOSED',
          expectedCash: shift.expectedCash.toString(),
          actualCash: input.actualCash,
          cashDifference,
        },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return updated;
  });
}

