import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerBusinessSchema,
  resetPasswordSchema,
  switchTenantSchema,
} from '@cambodia-pos/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { postAcceptInvitation } from '../access/access.controller';
import * as controller from './auth.controller';

const router = Router();

router.post(
  '/register-business',
  validate({ body: registerBusinessSchema }),
  controller.registerBusiness,
);
router.post('/login', validate({ body: loginSchema }), controller.login);
router.post('/refresh', validate({ body: refreshTokenSchema }), controller.refresh);
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', validate({ body: resetPasswordSchema }), controller.resetPassword);
router.post('/accept-invitation', validate({ body: acceptInvitationSchema }), postAcceptInvitation);

router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.getMe);
router.post('/switch-tenant', authenticate, validate({ body: switchTenantSchema }), controller.switchTenant);
router.get('/sessions', authenticate, controller.getSessions);
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({ params: z.object({ sessionId: z.string().uuid() }) }),
  controller.revokeSession,
);

export const authRouter = router;
