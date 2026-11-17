import { prisma } from '../../db/prisma';
import { ensurePermissionsExist } from '../auth/auth.service';

export async function listPermissions(options?: { search?: string; module?: string; action?: string }) {
  const { search, module, action } = options ?? {};
  return prisma.$transaction(async (tx) => {
    await ensurePermissionsExist(tx);
    const perms = await tx.permission.findMany({
      where: {
        ...(module && module !== 'ALL' ? { module } : {}),
        ...(action && action !== 'ALL'
          ? {
              code: {
                endsWith: `.${action.toLowerCase()}`,
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { module: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });

    return perms.map((p) => {
      const parts = p.code.split('.');
      return {
        ...p,
        action: parts.length > 1 ? parts[1] : 'access',
      };
    });
  });
}

