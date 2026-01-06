import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  type CoinbaseWebhookEvent,
} from '../services/coinbase.service.js';
import {
  sendPaymentConfirmed,
  sendPaymentFailed,
} from '../services/discord-notify.service.js';

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Coinbase Commerce webhook handler
  fastify.post('/coinbase', {
    config: {
      rawBody: true, // Need raw body for signature verification
    },
  }, async (request, reply) => {
    try {
      const signature = request.headers['x-cc-webhook-signature'] as string;
      const payload = request.body as string;

      // Verify Coinbase webhook signature
      if (!verifyWebhookSignature(payload, signature)) {
        logger.warn('Invalid Coinbase webhook signature');
        return reply.status(401).send('Invalid signature');
      }

      const event = parseWebhookEvent(payload);
      const eventId = event.id;
      const eventType = event.type;

      logger.info({ eventId, eventType }, 'Coinbase webhook received');

      // Check idempotency
      const existing = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (existing) {
        logger.info({ eventId }, 'Webhook already processed');
        return reply.status(200).send('OK');
      }

      // Process event
      switch (eventType) {
        case 'charge:pending':
          await handleChargePending(event);
          break;

        case 'charge:confirmed':
          await handleChargeConfirmed(event);
          break;

        case 'charge:failed':
          await handleChargeFailed(event);
          break;

        default:
          logger.info({ eventType }, 'Unhandled webhook event type');
      }

      // Record webhook as processed
      await prisma.webhookEvent.create({
        data: {
          id: eventId,
          event_type: eventType,
          payload: event.data as object,
        },
      });

      logger.info({ eventId, eventType }, 'Webhook processed');
      return reply.status(200).send('OK');
    } catch (error) {
      logger.error({ error }, 'Coinbase webhook error');
      return reply.status(500).send('Webhook processing failed');
    }
  });
};

/**
 * Handle charge:pending - Payment detected but not confirmed
 */
async function handleChargePending(event: CoinbaseWebhookEvent): Promise<void> {
  const { id: chargeId, metadata } = event.data;

  logger.info({ chargeId, userId: metadata.user_id }, 'Charge pending');

  // Update transaction status to PROCESSING
  await prisma.transaction.updateMany({
    where: { coinbase_charge_id: chargeId, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  });
}

/**
 * Handle charge:confirmed - Payment confirmed on blockchain
 */
async function handleChargeConfirmed(event: CoinbaseWebhookEvent): Promise<void> {
  const { id: chargeId, metadata, payments, pricing } = event.data;
  const userId = metadata.user_id;
  const goldAmount = parseInt(metadata.gold_amount, 10);
  const discordUsername = metadata.discord_username;

  // Get payment details
  const payment = payments?.[0];
  const cryptoCurrency = payment?.value?.crypto?.currency || payment?.network;
  const transactionHash = payment?.transaction_id;
  const amountUsd = pricing.local.amount;

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findFirst({
      where: { coinbase_charge_id: chargeId },
    });

    if (!transaction) {
      logger.warn({ chargeId }, 'Transaction not found for confirmed charge');
      return;
    }

    if (transaction.status === 'COMPLETED') {
      logger.info({ chargeId }, 'Transaction already completed');
      return;
    }

    // Update transaction
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        crypto_currency: cryptoCurrency,
        transaction_hash: transactionHash,
        completed_at: new Date(),
      },
    });

    // Credit user's gold balance
    await tx.user.update({
      where: { id: userId },
      data: { gold_balance: { increment: goldAmount } },
    });

    logger.info(
      { transactionId: transaction.id, userId, goldAmount },
      'Deposit completed via webhook'
    );
  });

  // Send Discord notification
  await sendPaymentConfirmed({
    discordUsername,
    goldAmount,
    amountUsd,
    cryptoCurrency,
    transactionHash,
  });
}

/**
 * Handle charge:failed - Payment failed or expired
 */
async function handleChargeFailed(event: CoinbaseWebhookEvent): Promise<void> {
  const { id: chargeId, metadata } = event.data;
  const discordUsername = metadata.discord_username;
  const goldAmount = parseInt(metadata.gold_amount, 10);

  await prisma.transaction.updateMany({
    where: { coinbase_charge_id: chargeId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: {
      status: 'FAILED',
      error_message: 'Payment failed or expired',
    },
  });

  logger.warn({ chargeId }, 'Charge failed');

  // Send Discord notification
  await sendPaymentFailed({
    discordUsername,
    goldAmount,
    reason: 'Payment failed or expired',
  });
}

export default webhookRoutes;
