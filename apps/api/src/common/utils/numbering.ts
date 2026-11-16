import type { Prisma } from '@prisma/client';

export function generateDocumentNumber(prefix: string, existingCount: number): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const seq = String(existingCount + 1).padStart(4, '0');
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${y}${m}${d}-${seq}-${rand}`;
}

export async function getTenantDocumentPrefix(
  tx: Prisma.TransactionClient,
  tenantId: string,
  key: string,
  fallback: string,
): Promise<string> {
  const setting = await tx.setting.findFirst({
    where: { tenantId, branchId: null, settingKey: key },
  });
  if (setting && typeof setting.settingValue === 'string' && setting.settingValue.trim().length > 0) {
    return setting.settingValue.trim().toUpperCase();
  }
  return fallback;
}


