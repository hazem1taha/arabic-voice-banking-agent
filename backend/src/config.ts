import { z } from 'zod'

const envSchema = z.object({
  OPENAI_API_KEY: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379/0'),
  SESSION_TTL_SECONDS: z.coerce.number().int().default(3600),
  SESSION_TURN_LIMIT: z.coerce.number().int().default(10),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(8000),
  RELOAD: z.coerce.boolean().default(false),
  AUDIO_MAX_AGE_SECONDS: z.coerce.number().int().default(3600),
  TTS_MODEL: z.string().default('tts-1'),
  TTS_VOICE: z.string().default('nova'),
})

export const settings = envSchema.parse(process.env)

export const redisAvailable = settings.REDIS_URL !== 'redis://localhost:6379/0' && settings.REDIS_URL !== ''
export const openaiConfigured = settings.OPENAI_API_KEY !== ''
