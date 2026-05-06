import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { settings } from './config.js'
import { logger } from './lib/logger.js'
import { registerErrorSchemas } from './lib/error-schemas.js'
import { registerRoutes, initServices } from './routes/conversation.js'
import { closeRedis } from './services/session.js'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = join(__dirname, '../../frontend')

async function main() {
  const fastify = Fastify({ logger: false })

  await fastify.register(cors, { origin: true })
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

  registerErrorSchemas(fastify)
  await initServices()
  await registerRoutes(fastify)

  fastify.get('/', async (_req, reply) => {
    const indexPath = join(FRONTEND_DIR, 'index.html')
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath)
      return reply.header('Content-Type', 'text/html').send(content)
    }
    return { message: 'Frontend not found. Run the frontend dev server.' }
  })

  fastify.get('/static/*', async (req, reply) => {
    const filePath = join(FRONTEND_DIR, req.url.replace('/static/', ''))
    if (existsSync(filePath)) {
      const content = readFileSync(filePath)
      return reply.send(content)
    }
    return reply.status(404).send()
  })

  fastify.addHook('onClose', async () => {
    await closeRedis()
    logger.info('app_shutdown')
  })

  logger.info({ version: '1.0.0' }, 'app_starting')

  await fastify.listen({ host: settings.HOST, port: settings.PORT })
  logger.info({ host: settings.HOST, port: settings.PORT }, 'app_ready')
}

main().catch((err) => {
  logger.fatal({ err }, 'app_crash')
  process.exit(1)
})
