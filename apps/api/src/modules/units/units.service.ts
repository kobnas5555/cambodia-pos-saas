import type {
  CreateUnitInput,
  UpdateUnitInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listUnits(tenantId: string) {
  return prisma.unit.findMany({
    where: { tenantId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createUnit(tenantId: string, actor: ActorInfo, input: CreateUnitInput) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({
      data: {
        tenantId,
        name: input.name,
        abbreviation: input.abbreviation,
        status: 'ACTIVE',
      },
    });
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'unit.created',
        module: 'products',
        recordType: 'Unit',
        recordId: unit.id,
        newValues: { name: unit.name, abbreviation: unit.abbreviation },
        ipAddress: actor.ipAddress,
      },
      tx,
    );
    return unit;
  });
}

export async function updateUnit(
  tenantId: string,
  unitId: string,
  actor: ActorInfo,
  input: UpdateUnitInput,
) {
  const existing = await prisma.unit.findFirst({ where: { id: unitId, tenantId } });
  if (!existing) throw AppError.notFound('Unit not found', 'UNIT_NOT_FOUND');

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.abbreviation !== undefined ? { abbreviation: input.abbreviation } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'unit.updated',
    module: 'products',
    recordType: 'Unit',
    recordId: unitId,
    oldValues: { name: existing.name, abbreviation: existing.abbreviation, status: existing.status },
    newValues: input,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

