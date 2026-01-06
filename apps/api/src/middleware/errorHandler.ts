import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES } from '@gdkp/shared';
import { logger } from '../config/logger.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({
    err: error,
    url: request.url,
    method: request.method,
  });

  // Handle AppError
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: error.errors,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: error.message,
      details: error.validation,
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests, please try again later',
    });
  }

  // Handle not found
  if (error.statusCode === 404) {
    return reply.status(404).send({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Resource not found',
    });
  }

  // Default internal error
  return reply.status(500).send({
    code: ERROR_CODES.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message,
  });
}
