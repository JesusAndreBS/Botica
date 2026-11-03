import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { prisma } from '../database/prisma.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error({ err: error }, 'Request error');

  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Datos de entrada inválidos',
      details: error.flatten().fieldErrors
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details
    });
  }

  if (error.code === 'P2002') {
    return reply.status(409).send({
      statusCode: 409,
      code: 'DUPLICATE_ENTRY',
      message: 'Ya existe un registro con ese valor único'
    });
  }

  if (error.code === 'P2003') {
    return reply.status(400).send({
      statusCode: 400,
      code: 'FOREIGN_KEY_CONSTRAINT',
      message: 'Referencia inválida'
    });
  }

  return reply.status(500).send({
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor'
  });
}