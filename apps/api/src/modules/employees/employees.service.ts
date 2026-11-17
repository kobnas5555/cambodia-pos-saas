import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { hashPassword } from '../../common/utils/password';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listEmployees(
  tenantId: string,
  options?: {
    search?: string;
    status?: string;
    branchId?: string;
    page?: number;
    limit?: number;
  } | string,
) {
  const opts = typeof options === 'string' ? { search: options } : (options ?? {});
  const { search, status, branchId } = opts;
  const page = Number(opts.page) > 0 ? Number(opts.page) : 1;
  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;

  const where: any = {
    tenantId,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(branchId && branchId !== 'ALL'
      ? {
          branchAccess: {
            some: { branchId },
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { employeeCode: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { position: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const total = await prisma.employee.count({ where });

  const employees = await prisma.employee.findMany({
    where,
    include: {
      branchAccess: {
        include: { branch: { select: { id: true, name: true, branchCode: true } } },
      },
      tenantUser: {
        include: {
          userRoles: {
            include: { role: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { skip: (page - 1) * limit, take: limit } : {}),
  });

  const items = employees.map((e) => ({
    id: e.id,
    tenantId: e.tenantId,
    tenantUserId: e.tenantUserId,
    employeeCode: e.employeeCode,
    name: e.name,
    phone: e.phone,
    email: e.email,
    position: e.position,
    hireDate: e.hireDate,
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    branches: e.branchAccess.map((ba) => ba.branch),
    roles: e.tenantUser?.userRoles.map((ur) => ur.role) ?? [],
    hasLoginAccount: Boolean(e.tenantUserId),
  }));

  const effectiveLimit = limit ?? (total > 0 ? total : 20);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

  return {
    items,
    total,
    page,
    limit: effectiveLimit,
    totalPages,
  };
}

export async function createEmployee(
  tenantId: string,
  actor: ActorInfo,
  input: CreateEmployeeInput,
) {
  const dup = await prisma.employee.findUnique({
    where: { tenantId_employeeCode: { tenantId, employeeCode: input.employeeCode } },
  });
  if (dup) {
    throw AppError.conflict(`Employee code "${input.employeeCode}" already exists`, 'EMPLOYEE_CODE_TAKEN');
  }

  return prisma.$transaction(async (tx) => {
    let tenantUserId: string | null = null;

    if (input.createUserAccount) {
      if (!input.email || !input.password) {
        throw AppError.badRequest(
          'Email and password are required when creating a login account',
          'ACCOUNT_FIELDS_REQUIRED',
        );
      }

      let user = await tx.user.findUnique({ where: { email: input.email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            passwordHash: await hashPassword(input.password),
            status: 'ACTIVE',
          },
        });
      }

      const existingMembership = await tx.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });

      const membership =
        existingMembership ??
        (await tx.tenantUser.create({
          data: { tenantId, userId: user.id, status: 'ACTIVE' },
        }));

      tenantUserId = membership.id;

      if (input.roleId) {
        const role = await tx.role.findFirst({ where: { id: input.roleId, tenantId } });
        if (!role) throw AppError.notFound('Role not found in this tenant', 'ROLE_NOT_FOUND');

        const existingUr = await tx.userRole.findUnique({
          where: { tenantUserId_roleId: { tenantUserId: membership.id, roleId: role.id } },
        });
        if (!existingUr) {
          await tx.userRole.create({
            data: { tenantUserId: membership.id, roleId: role.id },
          });
        }
      }
    }

    const employee = await tx.employee.create({
      data: {
        tenantId,
        tenantUserId,
        employeeCode: input.employeeCode,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        position: input.position ?? null,
        hireDate: input.hireDate ? new Date(input.hireDate) : new Date(),
        status: 'ACTIVE',
      },
    });

    if (input.branchIds.length > 0) {
      const validBranches = await tx.branch.findMany({
        where: { tenantId, id: { in: input.branchIds } },
        select: { id: true },
      });
      await tx.employeeBranchAccess.createMany({
        data: validBranches.map((b) => ({ employeeId: employee.id, branchId: b.id })),
      });
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'employee.created',
        module: 'employees',
        recordType: 'Employee',
        recordId: employee.id,
        newValues: { employeeCode: employee.employeeCode, name: employee.name },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return employee;
  });
}

export async function updateEmployee(
  tenantId: string,
  employeeId: string,
  actor: ActorInfo,
  input: UpdateEmployeeInput,
) {
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  });
  if (!existing) {
    throw AppError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  }

  if (input.status === 'INACTIVE' && actor.employeeId && actor.employeeId === employeeId) {
    throw AppError.badRequest(
      'You cannot deactivate your own active account',
      'CANNOT_DEACTIVATE_SELF',
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.hireDate !== undefined ? { hireDate: input.hireDate ? new Date(input.hireDate) : null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    if (input.branchIds !== undefined) {
      const validBranches = await tx.branch.findMany({
        where: { tenantId, id: { in: input.branchIds } },
        select: { id: true },
      });
      await tx.employeeBranchAccess.deleteMany({ where: { employeeId } });
      if (validBranches.length > 0) {
        await tx.employeeBranchAccess.createMany({
          data: validBranches.map((b) => ({ employeeId, branchId: b.id })),
        });
      }
    }

    if (input.roleIds !== undefined && existing.tenantUserId) {
      const validRoles = await tx.role.findMany({
        where: { tenantId, id: { in: input.roleIds } },
        select: { id: true },
      });
      await tx.userRole.deleteMany({ where: { tenantUserId: existing.tenantUserId } });
      if (validRoles.length > 0) {
        await tx.userRole.createMany({
          data: validRoles.map((r) => ({
            tenantUserId: existing.tenantUserId!,
            roleId: r.id,
          })),
        });
      }
    }

    if (input.status !== undefined && existing.tenantUserId) {
      const updatedTenantUser = await tx.tenantUser.update({
        where: { id: existing.tenantUserId },
        data: { status: input.status },
      });

      if (input.status === 'INACTIVE') {
        await tx.userSession.updateMany({
          where: {
            userId: updatedTenantUser.userId,
            tenantId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
    }

    const isStatusChanged = input.status !== undefined && input.status !== existing.status;
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: isStatusChanged ? 'employee.status_changed' : 'employee.updated',
        module: 'employees',
        recordType: 'Employee',
        recordId: employeeId,
        oldValues: {
          name: existing.name,
          position: existing.position,
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

