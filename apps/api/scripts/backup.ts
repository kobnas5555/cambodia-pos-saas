import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { prisma as defaultPrisma } from '../src/db/prisma';

dotenv.config();

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

export interface BackupMetadata {
  version: string;
  createdAt: string;
  checksum: string;
  tableCounts: Record<string, number>;
  databaseUrlMasked: string;
}

export interface BackupSnapshot {
  metadata: BackupMetadata;
  tables: Record<string, unknown[]>;
}

// Ordered by foreign-key dependencies for safe linear export & import
const TABLES_IN_ORDER = [
  'tenant',
  'user',
  'tenantUser',
  'branch',
  'permission',
  'role',
  'rolePermission',
  'userRole',
  'employee',
  'employeeBranchAccess',
  'category',
  'unit',
  'supplier',
  'product',
  'customer',
  'order',
  'orderItem',
  'payment',
  'saleReturn',
  'saleReturnItem',
  'purchase',
  'purchaseItem',
  'purchasePayment',
  'stockBalance',
  'stockAdjustment',
  'stockMovement',
  'shift',
  'expenseType',
  'expense',
  'income',
  'setting',
  'exchangeRate',
  'activityLog',
  'userSession',
] as const;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return 'undefined';
  return url.replace(/:([^@:]+)@/, ':****@');
}

export async function createDatabaseBackup(client: any = defaultPrisma): Promise<string> {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  console.log(`[Backup] Starting full database snapshot at ${new Date().toISOString()}...`);

  const tablesData: Record<string, unknown[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const modelName of TABLES_IN_ORDER) {
    const delegate = client[modelName];
    if (delegate && typeof delegate.findMany === 'function') {
      const rows = await delegate.findMany();
      tablesData[modelName] = rows;
      tableCounts[modelName] = rows.length;
      console.log(`  - Exported ${modelName.padEnd(22)}: ${rows.length} records`);
    }
  }

  const rawJson = JSON.stringify(tablesData);
  const checksum = crypto.createHash('sha256').update(rawJson).digest('hex');

  const snapshot: BackupSnapshot = {
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      checksum,
      tableCounts,
      databaseUrlMasked: maskDatabaseUrl(process.env.DATABASE_URL),
    },
    tables: tablesData,
  };

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  const stats = fs.statSync(filePath);
  console.log(`[Backup] Successfully written: ${filename} (${(stats.size / 1024).toFixed(2)} KB)`);
  console.log(`[Backup] SHA-256 Checksum: ${checksum}`);
  return filePath;
}

export async function listDatabaseBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json') || f.endsWith('.sql'));

  if (files.length === 0) {
    console.log('[Backup] No database backups found in ' + BACKUP_DIR);
    return [];
  }

  console.log(`[Backup] Found ${files.length} backup file(s):`);
  const details = files.map((file) => {
    const fullPath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(fullPath);
    let recordCount = 0;
    let checksum = 'N/A';

    if (file.endsWith('.json')) {
      try {
        const content: BackupSnapshot = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        recordCount = Object.values(content.metadata?.tableCounts || {}).reduce((a, b) => a + b, 0);
        checksum = content.metadata?.checksum?.slice(0, 12) + '...' || 'N/A';
      } catch {
        // ignore parse error in summary
      }
    }

    console.log(
      `  - ${file.padEnd(38)} | ${(stat.size / 1024).toFixed(1).padStart(7)} KB | ${recordCount.toString().padStart(6)} records | Hash: ${checksum} | Date: ${stat.mtime.toISOString()}`,
    );

    return { file, size: stat.size, mtime: stat.mtime, recordCount, checksum };
  });

  return details;
}

export async function rotateDatabaseBackups(keepCount = 7) {
  ensureBackupDir();
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .map((file) => ({
      file,
      fullPath: path.join(BACKUP_DIR, file),
      mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  if (files.length <= keepCount) {
    console.log(`[Backup] Retention policy check: Total backups (${files.length}) <= limit (${keepCount}). No rotation required.`);
    return 0;
  }

  const toRemove = files.slice(keepCount);
  console.log(`[Backup] Rotating ${toRemove.length} older backup(s) (keeping newest ${keepCount}):`);
  for (const item of toRemove) {
    fs.unlinkSync(item.fullPath);
    console.log(`  - Deleted: ${item.file}`);
  }
  return toRemove.length;
}

export async function verifyDatabaseBackup(filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }

  const content: BackupSnapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const rawData = JSON.stringify(content.tables);
  const calculated = crypto.createHash('sha256').update(rawData).digest('hex');

  const matches = calculated === content.metadata.checksum;
  console.log(`[Backup Verification] File: ${path.basename(filePath)}`);
  console.log(`  - Stored checksum:     ${content.metadata.checksum}`);
  console.log(`  - Calculated checksum: ${calculated}`);
  console.log(`  - Integrity Status:    ${matches ? 'VALID (PASSED)' : 'CORRUPTED (FAILED)'}`);

  return matches;
}

async function runCli() {
  const action = process.argv[2] || 'create';
  try {
    if (action === 'create' || action === 'backup') {
      await createDatabaseBackup();
      await rotateDatabaseBackups(10);
    } else if (action === 'list') {
      await listDatabaseBackups();
    } else if (action === 'verify') {
      const file = process.argv[3];
      if (!file) {
        console.error('Usage: tsx scripts/backup.ts verify <backup-file-path>');
        process.exit(1);
      }
      const ok = await verifyDatabaseBackup(path.resolve(process.cwd(), file));
      if (!ok) process.exit(1);
    } else if (action === 'rotate') {
      const keep = Number(process.argv[3]) || 7;
      await rotateDatabaseBackups(keep);
    } else {
      console.log('Usage: tsx scripts/backup.ts [create|list|verify|rotate]');
    }
  } catch (err) {
    console.error('[Backup Error]:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('backup')) {
  runCli();
}
