import type { FastifyInstance } from 'fastify'

export function registerErrorSchemas(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, _req, reply) => {
    fastify.log.error(error)

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500

    reply.status(statusCode).send({
      error: error.code ?? 'INTERNAL_ERROR',
      message: error.message,
      details: (error as { details?: unknown }).details ?? null,
    })
  })
}
