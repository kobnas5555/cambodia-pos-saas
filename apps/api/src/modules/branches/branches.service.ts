import type {
  CreateBranchInput,
  ListBranchesQuery,
  UpdateBranchInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listBranches(tenantId: string, query: ListBranchesQuery) {
  const where = {
    tenantId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { branchCode: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
            { address: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const page = query.page && query.page > 0 ? query.page : 1;
  const limit = query.limit && query.limit > 0 ? query.limit : 50;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.branch.count({ where }),
    prisma.branch.findMany({
      where,
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      ...(query.page || query.limit ? { skip, take: limit } : {}),
    }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getBranchById(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      tenantId,
    },
  });

  if (!branch) {
    throw AppError.notFound('Branch not found', 'BRANCH_NOT_FOUND');
  }

  return branch;
}

export async function createBranch(
  tenantId: string,
  actor: ActorInfo,
  input: CreateBranchInput,
) {
  const duplicate = await prisma.branch.findUnique({
    where: {
      tenantId_branchCode: {
        tenantId,
        branchCode: input.branchCode,
      },
    },
  });

  if (duplicate) {
    throw AppError.conflict(
      `Branch code "${input.branchCode}" already exists in this business`,
      'BRANCH_CODE_TAKEN',
    );
  }

  return prisma.$transaction(async (tx) => {
    if (input.isMain) {
      await tx.branch.updateMany({
        where: { tenantId, isMain: true },
        data: { isMain: false },
      });
    }

    const branch = await tx.branch.create({
      data: {
        tenantId,
        name: input.name,
        branchCode: input.branchCode,
        phone: input.phone ?? null,
        address: input.address ?? null,
        isMain: input.isMain,
        status: 'ACTIVE',
      },
    });

    if (actor.employeeId) {
      await tx.employeeBranchAccess.create({
        data: {
          employeeId: actor.employeeId,
          branchId: branch.id,
        },
      });
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'branch.created',
        module: 'branches',
        recordType: 'Branch',
        recordId: branch.id,
        newValues: {
          name: branch.name,
          branchCode: branch.branchCode,
          isMain: branch.isMain,
        },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return branch;
  });
}

export async function updateBranch(
  tenantId: string,
  branchId: string,
  actor: ActorInfo,
  input: UpdateBranchInput,
) {
  const existing = await prisma.branch.findFirst({
    where: { id: branchId, tenantId },
  });

  if (!existing) {
    throw AppError.notFound('Branch not found', 'BRANCH_NOT_FOUND');
  }

  if (existing.isMain && input.isMain === false) {
    throw AppError.badRequest(
      'Cannot remove main branch status directly; mark another branch as main instead',
      'MAIN_BRANCH_REQUIRED',
    );
  }

  if (existing.isMain && input.status === 'INACTIVE') {
    throw AppError.badRequest(
      'The main branch cannot be deactivated; set another branch as main first',
      'MAIN_BRANCH_CANNOT_BE_DEACTIVATED',
    );
  }

  if (input.branchCode && input.branchCode !== existing.branchCode) {
    const duplicate = await prisma.branch.findUnique({
      where: {
        tenantId_branchCode: {
          tenantId,
          branchCode: input.branchCode,
        },
      },
    });
    if (duplicate) {
      throw AppError.conflict(
        `Branch code "${input.branchCode}" already exists in this business`,
        'BRANCH_CODE_TAKEN',
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    if (input.isMain === true && !existing.isMain) {
      await tx.branch.updateMany({
        where: { tenantId, isMain: true },
        data: { isMain: false },
      });
    }

    const updated = await tx.branch.update({
      where: { id: branchId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.branchCode !== undefined ? { branchCode: input.branchCode } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.isMain !== undefined ? { isMain: input.isMain } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'branch.updated',
        module: 'branches',
        recordType: 'Branch',
        recordId: branchId,
        oldValues: {
          name: existing.name,
          branchCode: existing.branchCode,
          isMain: existing.isMain,
          status: existing.status,
        },
        newValues: input,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return updated;
  });
}

export async function deactivateBranch(
  tenantId: string,
  branchId: string,
  actor: ActorInfo,
) {
  const existing = await prisma.branch.findFirst({
    where: { id: branchId, tenantId },
  });

  if (!existing) {
    throw AppError.notFound('Branch not found', 'BRANCH_NOT_FOUND');
  }

  if (existing.isMain) {
    throw AppError.badRequest(
      'Cannot deactivate the main branch; assign another branch as main first',
      'MAIN_BRANCH_CANNOT_BE_DEACTIVATED',
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: { status: 'INACTIVE' },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'branch.deactivated',
        module: 'branches',
        recordType: 'Branch',
        recordId: branchId,
        oldValues: { status: existing.status },
        newValues: { status: 'INACTIVE' },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return updated;
  });
}

