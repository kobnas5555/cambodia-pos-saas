import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryPrisma } from './helpers/inMemoryPrisma';

const mockPrisma = vi.hoisted(() => ({ current: null as any }));

vi.mock('../src/db/prisma', async () => {
  const { createInMemoryPrisma: buildPrisma } = await import('./helpers/inMemoryPrisma');
  mockPrisma.current = buildPrisma();
  return { prisma: mockPrisma.current };
});

import { createApp } from '../src/app';

describe('Phase 1 API — Auth, Tenants, Branches & Tenant Isolation', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma.current.reset();
  });

  it('registers a business atomically with owner role, main branch, exchange rate, and session', async () => {
    const res = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Sokha Chan',
      email: 'sokha@bayv.com.kh',
      phone: '+85512345678',
      password: 'Password123',
      businessName: 'BayV Accessories',
      businessType: 'ELECTRONICS',
      defaultCurrency: 'USD',
      defaultLanguage: 'km',
      mainBranchName: 'Phnom Penh Main',
      mainBranchCode: 'PP-01',
      branchAddress: 'Street 271, Phnom Penh',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('sokha@bayv.com.kh');
    expect(res.body.data.activeTenant.slug).toBe('bayv-accessories');
    expect(res.body.data.activeTenant.defaultLanguage).toBe('km');
    expect(res.body.data.activeTenant.branches).toHaveLength(1);
    expect(res.body.data.activeTenant.branches[0].branchCode).toBe('PP-01');
    expect(res.body.data.activeTenant.branches[0].isMain).toBe(true);
    expect(res.body.data.activeTenant.permissions).toContain('branches.create');
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
  });

  it('rejects invalid input with structured Zod validation errors', async () => {
    const res = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'A',
      email: 'not-an-email',
      phone: '123',
      password: 'weak',
      businessName: 'X',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces strict cross-tenant isolation across tenants and branches', async () => {
    // Register Tenant A: BayV Accessories
    const regA = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Owner A',
      email: 'ownera@bayv.com.kh',
      phone: '+85511111111',
      password: 'Password123',
      businessName: 'BayV Accessories',
      mainBranchName: 'Phnom Penh',
      mainBranchCode: 'PP-01',
    });

    // Register Tenant B: ABC Coffee Shop
    const regB = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Owner B',
      email: 'ownerb@abccoffee.com.kh',
      phone: '+85522222222',
      password: 'Password123',
      businessName: 'ABC Coffee Shop',
      mainBranchName: 'Toul Kork',
      mainBranchCode: 'TK-01',
    });

    const tokenA = regA.body.data.tokens.accessToken;
    const tenantAId = regA.body.data.activeTenant.id;
    const branchAId = regA.body.data.activeTenant.branches[0].id;

    const tokenB = regB.body.data.tokens.accessToken;
    const tenantBId = regB.body.data.activeTenant.id;

    // Owner B tries to spoof X-Tenant-Id for Tenant A
    const spoofRes = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', tenantAId);

    expect(spoofRes.status).toBe(403);
    expect(spoofRes.body.error.code).toBe('TENANT_ACCESS_DENIED');

    // Owner B tries to read Tenant A's branch using Owner B's own tenant context
    const crossRead = await request(app)
      .get(`/api/v1/branches/${branchAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', tenantBId);

    expect(crossRead.status).toBe(404);
    expect(crossRead.body.error.code).toBe('BRANCH_NOT_FOUND');

    // Owner B cannot modify or deactivate Tenant A's branch or switch to Tenant A
    const crossPatch = await request(app)
      .patch(`/api/v1/branches/${branchAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', tenantBId)
      .send({ name: 'Hijacked Branch' });
    expect(crossPatch.status).toBe(404);
    expect(crossPatch.body.error.code).toBe('BRANCH_NOT_FOUND');

    const crossDelete = await request(app)
      .delete(`/api/v1/branches/${branchAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', tenantBId);
    expect(crossDelete.status).toBe(404);
    expect(crossDelete.body.error.code).toBe('BRANCH_NOT_FOUND');

    const crossSwitch = await request(app)
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ tenantId: tenantAId });
    expect(crossSwitch.status).toBe(403);
    expect(crossSwitch.body.error.code).toBe('TENANT_ACCESS_DENIED');

    // Owner A only sees Tenant A's branch
    const listA = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(listA.status).toBe(200);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0].branchCode).toBe('PP-01');
  });

  it('supports creating, updating, switching main branch, and protecting the main branch from deactivation', async () => {
    const reg = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Owner A',
      email: 'owner@bayv.com.kh',
      phone: '+85511111111',
      password: 'Password123',
      businessName: 'BayV Accessories',
      mainBranchName: 'Phnom Penh',
      mainBranchCode: 'PP-01',
    });

    const token = reg.body.data.tokens.accessToken;
    const ppBranchId = reg.body.data.activeTenant.branches[0].id;

    // Cannot deactivate main branch
    const delMain = await request(app)
      .delete(`/api/v1/branches/${ppBranchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delMain.status).toBe(400);
    expect(delMain.body.error.code).toBe('MAIN_BRANCH_CANNOT_BE_DEACTIVATED');

    // Create second branch (Siem Reap)
    const createSr = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Siem Reap Branch',
        branchCode: 'SR-01',
        phone: '+85563888777',
        address: 'Siem Reap',
        isMain: false,
      });

    expect(createSr.status).toBe(201);
    const srBranchId = createSr.body.data.id;

    // Duplicate branchCode in same tenant rejected
    const dupCode = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Another SR',
        branchCode: 'SR-01',
      });
    expect(dupCode.status).toBe(409);

    // Promote SR-01 to Main Branch -> PP-01 automatically loses isMain
    const promote = await request(app)
      .patch(`/api/v1/branches/${srBranchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isMain: true });
    expect(promote.status).toBe(200);
    expect(promote.body.data.isMain).toBe(true);

    const ppAfter = await request(app)
      .get(`/api/v1/branches/${ppBranchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ppAfter.body.data.isMain).toBe(false);

    // Deactivate & reactivate non-main PP-01 branch
    const deactPp = await request(app)
      .delete(`/api/v1/branches/${ppBranchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deactPp.status).toBe(200);
    expect(deactPp.body.data.status).toBe('INACTIVE');

    const reactPp = await request(app)
      .patch(`/api/v1/branches/${ppBranchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' });
    expect(reactPp.status).toBe(200);
    expect(reactPp.body.data.status).toBe('ACTIVE');
  });

  it('supports login, refresh token rotation, session management, multi-tenant creation, and password reset', async () => {
    const reg = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Dara Sok',
      email: 'dara@example.com',
      phone: '+85512999888',
      password: 'Password123',
      businessName: 'Dara Mart',
      mainBranchCode: 'DM-01',
    });
    const accessToken = reg.body.data.tokens.accessToken;
    const refreshToken = reg.body.data.tokens.refreshToken;

    // Create a second business workspace under same user and verify switch-tenant
    const firstTenantId = reg.body.data.activeTenant.id;
    const createSecond = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        businessName: 'Dara Coffee',
        defaultCurrency: 'KHR',
        defaultLanguage: 'km',
        mainBranchCode: 'DC-01',
      });
    expect(createSecond.status).toBe(201);
    expect(createSecond.body.data.tenants).toHaveLength(2);
    expect(createSecond.body.data.activeTenant.defaultCurrency).toBe('KHR');
    expect(createSecond.body.data.activeTenant.defaultLanguage).toBe('km');

    const switchBack = await request(app)
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${createSecond.body.data.accessToken}`)
      .send({ tenantId: firstTenantId });
    expect(switchBack.status).toBe(200);
    expect(switchBack.body.data.activeTenant.id).toBe(firstTenantId);
    expect(switchBack.body.data.activeTenant.defaultCurrency).toBe('USD');

    // Refresh token rotation
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeTruthy();

    // Old refresh token is now invalid
    const replayRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(replayRefresh.status).toBe(401);

    // List active sessions
    const sessionsRes = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);
    expect(sessionsRes.status).toBe(200);
    expect(sessionsRes.body.data).toHaveLength(1);

    // Password reset revokes all active sessions
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'dara@example.com' });
    expect(forgotRes.status).toBe(200);
    const resetToken = forgotRes.body.data.devResetToken;
    expect(resetToken).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewPassword456' });
    expect(resetRes.status).toBe(200);

    // Reset token cannot be reused
    const reuseResetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'AnotherPassword789' });
    expect(reuseResetRes.status).toBe(400);
    expect(reuseResetRes.body.error.code).toBe('INVALID_RESET_TOKEN');

    // Old access token is rejected because session was revoked on password reset
    const meAfterReset = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);
    expect(meAfterReset.status).toBe(401);

    // Login with new password succeeds (create two concurrent sessions)
    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dara@example.com', password: 'NewPassword456' });
    expect(loginNew.status).toBe(200);
    const sessionOneToken = loginNew.body.data.tokens.accessToken;
    const sessionOneId = loginNew.body.data.tokens.sessionId;

    const loginSecondDevice = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dara@example.com', password: 'NewPassword456' });
    expect(loginSecondDevice.status).toBe(200);
    const sessionTwoToken = loginSecondDevice.body.data.tokens.accessToken;

    // List sessions from device 2 -> 2 active sessions, only device 2 isCurrent
    const sessionsList2 = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${sessionTwoToken}`);
    expect(sessionsList2.status).toBe(200);
    expect(sessionsList2.body.data).toHaveLength(2);
    expect(sessionsList2.body.data.find((s: any) => s.id === sessionOneId)?.isCurrent).toBe(false);

    // Revoke session 1 from session 2 -> session 1 token immediately invalidated
    const revokeRes = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionOneId}`)
      .set('Authorization', `Bearer ${sessionTwoToken}`);
    expect(revokeRes.status).toBe(200);

    const meRevoked = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sessionOneToken}`);
    expect(meRevoked.status).toBe(401);
    expect(meRevoked.body.error.code).toBe('SESSION_REVOKED');

    // Explicit logout revokes session 2
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${sessionTwoToken}`);
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sessionTwoToken}`);
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body.error.code).toBe('SESSION_REVOKED');
  });

  it('updates tenant profile and logs activity audit entries', async () => {
    const reg = await request(app).post('/api/v1/auth/register-business').send({
      ownerName: 'Vanna Lim',
      email: 'vanna@example.com',
      phone: '+85512777666',
      password: 'Password123',
      businessName: 'Vanna Store',
    });
    const token = reg.body.data.tokens.accessToken;

    const updateRes = await request(app)
      .patch('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vanna Supermart',
        defaultCurrency: 'KHR',
        defaultLanguage: 'km',
        address: 'Monivong Blvd, Phnom Penh',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Vanna Supermart');
    expect(updateRes.body.data.defaultCurrency).toBe('KHR');

    const logsRes = await request(app)
      .get('/api/v1/activity-logs')
      .set('Authorization', `Bearer ${token}`);
    expect(logsRes.status).toBe(200);
    const actions = logsRes.body.data.map((l: any) => l.action);
    expect(actions).toContain('tenant.registered');
    expect(actions).toContain('tenant.updated');
  });
});

