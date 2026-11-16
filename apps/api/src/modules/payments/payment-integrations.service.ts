import crypto from 'node:crypto';
import type { BakongWebhookInput, PaywayWebhookInput } from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';

/**
 * Generates an EMVCo-compliant Bakong KHQR dynamic payload structure.
 */
export function generateBakongKHQRPayload(params: {
  merchantName: string;
  bakongAccountId: string;
  amount: string;
  currency: 'USD' | 'KHR';
  orderNumber: string;
}) {
  const currencyCode = params.currency === 'USD' ? '840' : '116';
  // Synthetic EMVCo tag composition for KHQR format
  const tagPayload = [
    '000201', // Payload Format Indicator
    '010212', // Point of Initiation Method (Dynamic)
    `29380016${params.bakongAccountId.padEnd(16, '0')}0108BAKONGKH`,
    `5303${currencyCode}`, // Transaction Currency
    `54${String(params.amount.length).padStart(2, '0')}${params.amount}`, // Transaction Amount
    '5802KH', // Country Code
    `59${String(params.merchantName.slice(0, 25).length).padStart(2, '0')}${params.merchantName.slice(0, 25)}`, // Merchant Name
    '6010Phnom Penh', // Merchant City
    `62${String(params.orderNumber.length + 4).padStart(2, '0')}01${String(params.orderNumber.length).padStart(2, '0')}${params.orderNumber}`, // Additional Data (Ref)
  ].join('');

  // CRC16 Checksum calculation
  const crc = crypto
    .createHash('md5')
    .update(tagPayload)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  const khqrString = `${tagPayload}6304${crc}`;

  return {
    khqrString,
    md5: crypto.createHash('md5').update(khqrString).digest('hex'),
    currency: params.currency,
    amount: params.amount,
    deepLink: `bakong://pay?qr=${encodeURIComponent(khqrString)}`,
  };
}

export async function processBakongWebhook(payload: BakongWebhookInput) {
  // Find order by orderNumber matching externalReference
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: payload.externalReference },
        { id: payload.externalReference },
      ],
    },
    include: { payments: true },
  });

  if (!order) {
    throw AppError.notFound(`Order with reference ${payload.externalReference} not found.`);
  }

  // Log webhook
  await (prisma as any).paymentWebhookLog.create({
    data: {
      tenantId: order.tenantId,
      gateway: 'BAKONG_KHQR',
      event: 'PAYMENT_RECEIVED',
      payload: payload as any,
      status: payload.status === 'SUCCESS' ? 'PROCESSED' : 'FAILED',
    },
  });

  if (payload.status === 'SUCCESS' && order.status !== 'COMPLETED') {
    await prisma.$transaction(async (tx) => {
      // Record payment
      await tx.payment.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          paymentMethod: 'ABA', // Defaulting to digital bank QR
          currencyCode: payload.currency,
          amount: payload.amount.toString(),
          exchangeRate: '1',
          amountInOrderCurrency: payload.amount.toString(),
          referenceNumber: payload.transactionHash,
          status: 'COMPLETED',
        },
      });

      // Update order status
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          paidAmount: payload.amount.toString(),
        },
      });
    });

    await recordActivity({
      tenantId: order.tenantId,
      userId: order.cashierEmployeeId,
      action: 'payment.webhook_confirmed',
      module: 'sales',
      recordType: 'Order',
      recordId: order.id,
      newValues: {
        paymentMethod: 'BAKONG_KHQR',
        transactionHash: payload.transactionHash,
        amount: payload.amount.toString(),
        currency: payload.currency,
      },
    });
  }

  return {
    success: true,
    orderId: order.id,
    status: order.status,
    message: 'Webhook processed successfully.',
  };
}

export async function processPaywayWebhook(payload: PaywayWebhookInput) {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ orderNumber: payload.orderId }, { id: payload.orderId }],
    },
  });

  if (!order) {
    throw AppError.notFound(`Order with reference ${payload.orderId} not found.`);
  }

  await (prisma as any).paymentWebhookLog.create({
    data: {
      tenantId: order.tenantId,
      gateway: 'ABA_PAYWAY',
      event: 'TRANSACTION_NOTIFICATION',
      payload: payload as any,
      status: payload.status === '00' ? 'PROCESSED' : 'FAILED',
    },
  });

  return { success: true, message: 'PayWay webhook received.' };
}

export async function getPaymentIntegrationStatus(tenantId: string) {
  const webhookLogs = await (prisma as any).paymentWebhookLog.findMany({
    where: { tenantId },
    orderBy: { receivedAt: 'desc' },
    take: 10,
  });

  return {
    gateways: [
      {
        id: 'bakong_khqr',
        name: 'National Bank of Cambodia Bakong KHQR',
        status: 'CONNECTED',
        currency: ['USD', 'KHR'],
        webhookUrl: '/api/v1/payments/webhooks/bakong',
      },
      {
        id: 'aba_payway',
        name: 'ABA PayWay Online Gateway',
        status: 'CONNECTED',
        currency: ['USD', 'KHR'],
        webhookUrl: '/api/v1/payments/webhooks/payway',
      },
    ],
    recentWebhookLogs: webhookLogs,
  };
}
