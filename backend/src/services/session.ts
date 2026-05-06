import * as IORedis from 'ioredis'
import { settings } from '../config.js'
import { logger } from '../lib/logger.js'
import { SessionError } from '../lib/errors.js'
import type { Session, Turn } from '../domain/conversation.js'

type RedisClient = IORedis.Redis

let redisClient: RedisClient | null = null

export async function initRedis(url: string): Promise<RedisClient> {
  redisClient = new IORedis.Redis(url, { maxRetriesPerRequest: 3 })
  await redisClient.ping()
  logger.info({ url }, 'redis_connected')
  return redisClient
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}

export function getRedis(): RedisClient {
  if (!redisClient) throw new SessionError('Redis not initialized')
  return redisClient
}

export class SessionStore {
  private readonly ttl: number
  private readonly turnLimit: number

  constructor(_redis: RedisClient, ttl: number, turnLimit: number) {
    this.ttl = ttl
    this.turnLimit = turnLimit
  }

  private key(sessionId: string): string {
    return `session:${sessionId}`
  }

  async get(sessionId: string): Promise<Session | null> {
    try {
      const data = await getRedis().get(this.key(sessionId))
      if (!data) return null
      return JSON.parse(data) as Session
    } catch (err) {
      logger.error({ sessionId, err }, 'session_get_failed')
      throw new SessionError(`Failed to get session: ${sessionId}`)
    }
  }

  async save(session: Session): Promise<void> {
    try {
      await getRedis().set(this.key(session.session_id), JSON.stringify(session), 'EX', this.ttl)
    } catch (err) {
      logger.error({ sessionId: session.session_id, err }, 'session_save_failed')
      throw new SessionError(`Failed to save session: ${session.session_id}`)
    }
  }

  async create(sessionId: string, customerId: string = 'cust-001'): Promise<Session> {
    const session: Session = {
      session_id: sessionId,
      customer_id: customerId,
      created_at: new Date().toISOString(),
      turns: [],
    }
    await this.save(session)
    return session
  }

  async delete(sessionId: string): Promise<boolean> {
    const result = await getRedis().del(this.key(sessionId))
    return result > 0
  }

  async appendTurn(sessionId: string, turn: Turn): Promise<Session> {
    let session = await this.get(sessionId)
    if (!session) session = await this.create(sessionId)
    session.turns.push(turn)
    await this.save(session)
    return session
  }

  getRecentTurnsDict(session: Session): Turn[] {
    return session.turns.slice(-this.turnLimit)
  }
}

// Singleton session store instance
let _sessionStore: SessionStore | null = null

export function initSessionStore(redis: RedisClient): SessionStore {
  _sessionStore = new SessionStore(redis, settings.SESSION_TTL_SECONDS, settings.SESSION_TURN_LIMIT)
  return _sessionStore
}

export function getSessionStore(): SessionStore {
  if (!_sessionStore) throw new SessionError('SessionStore not initialized')
  return _sessionStore
}
