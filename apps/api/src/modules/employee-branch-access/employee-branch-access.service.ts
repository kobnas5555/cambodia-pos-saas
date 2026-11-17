import { prisma } from '../../db/prisma';

export async function listEmployeeBranchAccess(
  tenantId: string,
  options?: {
    employeeId?: string;
    branchId?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
) {
  const { employeeId, branchId, search } = options ?? {};
  const page = Number(options?.page) > 0 ? Number(options?.page) : 1;
  const limit = options?.limit !== undefined ? Number(options?.limit) : undefined;

  const where: any = {
    employee: { tenantId },
    ...(employeeId && employeeId !== 'ALL' ? { employeeId } : {}),
    ...(branchId && branchId !== 'ALL' ? { branchId } : {}),
    ...(search
      ? {
          OR: [
            { employee: { name: { contains: search, mode: 'insensitive' } } },
            { employee: { employeeCode: { contains: search, mode: 'insensitive' } } },
            { branch: { name: { contains: search, mode: 'insensitive' } } },
            { branch: { branchCode: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.employeeBranchAccess.count({ where });

  const accessList = await prisma.employeeBranchAccess.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, employeeCode: true, position: true } },
      branch: { select: { id: true, name: true, branchCode: true, isMain: true } },
    },
    ...(limit ? { skip: (page - 1) * limit, take: limit } : {}),
  });

  const items = accessList.map((ba) => ({
    id: ba.id,
    employeeId: ba.employeeId,
    branchId: ba.branchId,
    employee: ba.employee,
    branch: ba.branch,
  }));

  const effectiveLimit = limit ?? (total > 0 ? total : 50);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

  return {
    items,
    total,
    page,
    limit: effectiveLimit,
    totalPages,
  };
}

