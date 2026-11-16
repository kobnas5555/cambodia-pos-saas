import {
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  type SystemSettingsMap,
  type UserPreferences,
} from '@cambodia-pos/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function getSystemSettings(tenantId: string, branchId?: string) {
  const [rows, rates] = await Promise.all([
    prisma.setting.findMany({
      where: {
        tenantId,
        branchId: branchId ?? null,
      },
    }),
    prisma.exchangeRate.findMany({
      where: { tenantId },
      orderBy: { effectiveAt: 'desc' },
      take: 20,
    }),
  ]);

  const map: Record<string, unknown> = {
    ...DEFAULT_SYSTEM_SETTINGS,
  };

  for (const row of rows) {
    if (!row.settingKey.startsWith('user_pref:')) {
      map[row.settingKey] = row.settingValue;
    }
  }

  return {
    settings: map,
    exchangeRates: rates.map((r) => ({
      ...r,
      rate: r.rate.toString(),
    })),
  };
}

export async function upsertSystemSettings(
  tenantId: string,
  actor: ActorInfo,
  input: { branchId?: string | null; settings: Record<string, unknown> },
) {
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(input.settings)) {
      const existing = await tx.setting.findFirst({
        where: {
          tenantId,
          branchId: input.branchId ?? null,
          settingKey: key,
        },
      });

      if (existing) {
        await tx.setting.update({
          where: { id: existing.id },
          data: { settingValue: value as Prisma.InputJsonValue },
        });
      } else {
        await tx.setting.create({
          data: {
            tenantId,
            branchId: input.branchId ?? null,
            settingKey: key,
            settingValue: value as Prisma.InputJsonValue,
          },
        });
      }
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'settings.updated',
        module: 'settings',
        recordType: 'Setting',
        newValues: input.settings,
        ipAddress: actor.ipAddress,
      },
      tx,
    );
  });

  return getSystemSettings(tenantId, input.branchId ?? undefined);
}

export async function createExchangeRate(
  tenantId: string,
  actor: ActorInfo,
  input: { baseCurrency: string; targetCurrency: string; rate: string },
) {
  return prisma.$transaction(async (tx) => {
    const rateRecord = await tx.exchangeRate.create({
      data: {
        tenantId,
        baseCurrency: input.baseCurrency,
        targetCurrency: input.targetCurrency,
        rate: input.rate,
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'exchange_rate.updated',
        module: 'settings',
        recordType: 'ExchangeRate',
        recordId: rateRecord.id,
        newValues: input,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      ...rateRecord,
      rate: rateRecord.rate.toString(),
    };
  });
}

export async function getUserPreferences(tenantId: string, userId: string): Promise<UserPreferences> {
  const row = await prisma.setting.findFirst({
    where: {
      tenantId,
      branchId: null,
      settingKey: `user_pref:${userId}`,
    },
  });

  if (!row || typeof row.settingValue !== 'object' || row.settingValue === null) {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  const stored = row.settingValue as Record<string, unknown>;
  return {
    language: stored.language === 'km' ? 'km' : 'en',
    theme: stored.theme === 'dark' || stored.theme === 'system' ? stored.theme : 'light',
    posSoundEnabled: stored.posSoundEnabled !== false,
    autoPrintReceipt: Boolean(stored.autoPrintReceipt),
    compactTables: Boolean(stored.compactTables),
    defaultBranchId: typeof stored.defaultBranchId === 'string' ? stored.defaultBranchId : null,
  };
}

export async function updateUserPreferences(
  tenantId: string,
  userId: string,
  actor: ActorInfo,
  input: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const current = await getUserPreferences(tenantId, userId);
  const merged: UserPreferences = {
    ...current,
    ...input,
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findFirst({
      where: {
        tenantId,
        branchId: null,
        settingKey: `user_pref:${userId}`,
      },
    });

    if (existing) {
      await tx.setting.update({
        where: { id: existing.id },
        data: { settingValue: merged as unknown as Prisma.InputJsonValue },
      });
    } else {
      await tx.setting.create({
        data: {
          tenantId,
          branchId: null,
          settingKey: `user_pref:${userId}`,
          settingValue: merged as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'user_preferences.updated',
        module: 'settings',
        recordType: 'Setting',
        newValues: merged,
        ipAddress: actor.ipAddress,
      },
      tx,
    );
  });

  return merged;
}


