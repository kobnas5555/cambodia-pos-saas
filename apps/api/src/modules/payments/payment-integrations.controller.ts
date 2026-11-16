import type { Request, Response } from 'express';
import {
  bakongWebhookSchema,
  paywayWebhookSchema,
} from '@cambodia-pos/shared';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as paymentIntegrationsService from './payment-integrations.service';

export const bakongWebhookHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = bakongWebhookSchema.parse(req.body);
  const result = await paymentIntegrationsService.processBakongWebhook(payload);
  res.json(result);
});

export const paywayWebhookHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = paywayWebhookSchema.parse(req.body);
  const result = await paymentIntegrationsService.processPaywayWebhook(payload);
  res.json(result);
});

export const getIntegrationStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const result = await paymentIntegrationsService.getPaymentIntegrationStatus(tenantId);
  res.json({
    success: true,
    data: result,
  });
});

export const generateBakongQrHandler = asyncHandler(async (req: Request, res: Response) => {
  const { merchantName, bakongAccountId, amount, currency, orderNumber } = req.body;
  const result = paymentIntegrationsService.generateBakongKHQRPayload({
    merchantName: merchantName ?? 'Cambodia POS Store',
    bakongAccountId: bakongAccountId ?? 'pos@bakong',
    amount: String(amount ?? '1.00'),
    currency: currency ?? 'USD',
    orderNumber: String(orderNumber ?? 'ORD-0001'),
  });

  res.json({
    success: true,
    data: result,
  });
});
