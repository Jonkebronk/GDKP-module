import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { requireAuth } from '../middleware/auth.js';

const discordTokenSchema = z.object({
  code: z.string(),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Discord OAuth - redirect to Discord
  fastify.get('/discord', async (request, reply) => {
    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: env.DISCORD_CALLBACK_URL,
      response_type: 'code',
      scope: 'identify',
    });

    return reply.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  // Discord OAuth callback
  fastify.get('/discord/callback', async (request, reply) => {
    try {
      const { code } = discordTokenSchema.parse(request.query);

      // Exchange code for token
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.DISCORD_CALLBACK_URL,
        }),
      });

      if (!tokenResponse.ok) {
        logger.error({ status: tokenResponse.status }, 'Discord token exchange failed');
        return reply.redirect(`${env.FRONTEND_URL}/login?error=discord_failed`);
      }

      const tokenData = await tokenResponse.json();

      // Get user info from Discord
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        logger.error({ status: userResponse.status }, 'Discord user fetch failed');
        return reply.redirect(`${env.FRONTEND_URL}/login?error=discord_failed`);
      }

      const discordUser = await userResponse.json() as {
        id: string;
        username: string;
        avatar: string | null;
      };

      // Check if this user should be admin based on env config
      const shouldBeAdmin = env.isAdmin(discordUser.username);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { discord_id: discordUser.id },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            discord_id: discordUser.id,
            discord_username: discordUser.username,
            discord_avatar: discordUser.avatar
              ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
              : null,
            role: shouldBeAdmin ? 'ADMIN' : 'USER',
            // New users start in waiting room with no alias
            session_status: shouldBeAdmin ? 'APPROVED' : 'WAITING',
            alias: null,
          },
        });
        logger.info({ userId: user.id, discordId: discordUser.id, isAdmin: shouldBeAdmin }, 'New user created');
      } else {
        // Update user info and reset session (clear alias, set to waiting)
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            discord_username: discordUser.username,
            discord_avatar: discordUser.avatar
              ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
              : null,
            // Promote to admin if configured (but don't demote existing admins)
            ...(shouldBeAdmin && user.role !== 'ADMIN' ? { role: 'ADMIN' } : {}),
            // Reset session: admins auto-approved, others go to waiting room
            session_status: shouldBeAdmin || user.role === 'ADMIN' ? 'APPROVED' : 'WAITING',
            // Clear alias on each login (session-based)
            alias: null,
          },
        });
        if (shouldBeAdmin && user.role !== 'ADMIN') {
          logger.info({ userId: user.id }, 'User promoted to admin');
        }
      }

      // Generate JWT
      const token = fastify.jwt.sign({
        id: user.id,
        discord_id: user.discord_id,
        discord_username: user.discord_username,
        discord_avatar: user.discord_avatar,
        alias: user.alias,
        role: user.role,
        session_status: user.session_status,
      }, { expiresIn: env.JWT_EXPIRES_IN });

      // Redirect to frontend with token
      return reply.redirect(`${env.FRONTEND_URL}/auth/callback?token=${token}`);
    } catch (error) {
      logger.error({ error }, 'Discord OAuth callback error');
      return reply.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
    }
  });

  // Get current user
  fastify.get('/me', { preHandler: [requireAuth] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        discord_id: true,
        discord_username: true,
        discord_avatar: true,
        alias: true,
        gold_balance: true,
        role: true,
        session_status: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      ...user,
      gold_balance: Number(user.gold_balance),
    };
  });

  // Logout - clear session status and alias
  fastify.post('/logout', { preHandler: [requireAuth] }, async (request) => {
    await prisma.user.update({
      where: { id: request.user.id },
      data: {
        session_status: 'OFFLINE',
        alias: null,
      },
    });
    return { success: true };
  });

  // Gate validation - secret passphrase to unlock login
  fastify.post('/gate', async (request) => {
    const { passphrase } = request.body as { passphrase?: string };
    const correct = passphrase === env.GATE_PASSPHRASE;
    return { success: correct };
  });

  // Refresh token
  fastify.post('/refresh', { preHandler: [requireAuth] }, async (request) => {
    // Fetch fresh user data to get current alias and session status
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        discord_id: true,
        discord_username: true,
        discord_avatar: true,
        alias: true,
        role: true,
        session_status: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const token = fastify.jwt.sign({
      id: user.id,
      discord_id: user.discord_id,
      discord_username: user.discord_username,
      discord_avatar: user.discord_avatar,
      alias: user.alias,
      role: user.role,
      session_status: user.session_status,
    }, { expiresIn: env.JWT_EXPIRES_IN });

    return { token };
  });
};

export default authRoutes;
