import pino from 'pino'
import { settings } from '../config.js'

export const logger = pino({
  level: settings.LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
})
