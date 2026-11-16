import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  sessionId: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  sessionId: string;
  type: 'refresh';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    jwtid: crypto.randomUUID(),
  };
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token type');
  }
  return decoded;
}

