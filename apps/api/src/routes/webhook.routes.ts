import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // PayPal webhook handler
  fastify.post('/paypal', {
    config: {
      rawBody: true, // Need raw body for signature verification
    },
  }, async (request, reply) => {
    // Immediately respond to avoid timeout
    reply.status(200).send('OK');

    try {
      const headers = request.headers;
      const body = request.body as string;

      // TODO: Verify PayPal webhook signature
      // const isValid = await verifyPayPalWebhook(headers, body);
      // if (!isValid) {
      //   logger.warn('Invalid PayPal webhook signature');
      //   return;
      // }

      const event = JSON.parse(body);
      const eventId = event.id;
      const eventType = event.event_type;
      const resource = event.resource;

      // Check idempotency
      const existing = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (existing) {
        logger.info({ eventId }, 'Webhook already processed');
        return;
      }

      // Process event
      switch (eventType) {
        case 'CHECKOUT.ORDER.APPROVED':
          await handleOrderApproved(resource);
          break;

        case 'PAYMENT.CAPTURE.COMPLETED':
          await handleCaptureCompleted(resource);
          break;

        case 'PAYMENT.CAPTURE.DENIED':
        case 'PAYMENT.CAPTURE.REFUNDED':
          await handleCaptureFailed(resource);
          break;

        case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
          await handlePayoutSucceeded(resource);
          break;

        case 'PAYMENT.PAYOUTS-ITEM.FAILED':
          await handlePayoutFailed(resource);
          break;

        default:
          logger.info({ eventType }, 'Unhandled webhook event type');
      }

      // Record webhook as processed
      await prisma.webhookEvent.create({
        data: {
          id: eventId,
          event_type: eventType,
          payload: resource,
        },
      });

      logger.info({ eventId, eventType }, 'Webhook processed');
    } catch (error) {
      logger.error({ error }, 'PayPal webhook error');
    }
  });
};

async function handleOrderApproved(resource: { id: string }) {
  logger.info({ orderId: resource.id }, 'PayPal order approved');
  // Order approved - user will be redirected to capture endpoint
}

async function handleCaptureCompleted(resource: { id: string; custom_id?: string }) {
  const customId = resource.custom_id; // Our idempotency key

  if (!customId) {
    logger.warn({ resource }, 'Capture completed without custom_id');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { idempotency_key: customId },
    });

    if (!transaction || transaction.status !== 'PENDING') {
      return; // Already processed or not found
    }

    // Update transaction
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        paypal_transaction_id: resource.id,
        completed_at: new Date(),
      },
    });

    // Credit user's gold balance
    await tx.user.update({
      where: { id: transaction.user_id },
      data: { gold_balance: { increment: transaction.gold_amount } },
    });

    logger.info(
      { transactionId: transaction.id, userId: transaction.user_id, goldAmount: Number(transaction.gold_amount) },
      'Deposit completed via webhook'
    );
  });
}

async function handleCaptureFailed(resource: { id: string; custom_id?: string }) {
  const customId = resource.custom_id;

  if (!customId) return;

  await prisma.transaction.updateMany({
    where: { idempotency_key: customId, status: 'PENDING' },
    data: {
      status: 'FAILED',
      error_message: 'Payment capture failed',
    },
  });

  logger.warn({ customId }, 'Payment capture failed');
}

async function handlePayoutSucceeded(resource: { sender_item_id: string }) {
  const transactionId = resource.sender_item_id;

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: 'COMPLETED',
      completed_at: new Date(),
    },
  });

  logger.info({ transactionId }, 'Payout succeeded');
}

async function handlePayoutFailed(resource: { sender_item_id: string; payout_item_id: string; error?: { message?: string } }) {
  const transactionId = resource.sender_item_id;

  // Refund the user's balance
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) return;

  await prisma.$transaction(async (tx) => {
    // Refund balance
    await tx.user.update({
      where: { id: transaction.user_id },
      data: { gold_balance: { increment: Math.abs(Number(transaction.gold_amount)) } },
    });

    // Update transaction
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'FAILED',
        error_message: resource.error?.message || 'Payout failed',
      },
    });
  });

  logger.warn({ transactionId, error: resource.error }, 'Payout failed');
}

export default webhookRoutes;
