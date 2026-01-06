import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ERROR_CODES, AuthUser } from '@gdkp/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();

    // The JWT payload contains user info
    const payload = request.user as AuthUser;

    if (!payload.id || !payload.discord_id) {
      throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, 'Invalid token', 401);
    }
  } catch (err) {
    throw new AppError(ERROR_CODES.AUTH_REQUIRED, 'Authentication required', 401);
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAuth(request, reply);

  if (request.user.role !== 'ADMIN') {
    throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Admin access required', 403);
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch {
    // Ignore auth errors - user is optional
  }
}
