import crypto from 'node:crypto';

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

