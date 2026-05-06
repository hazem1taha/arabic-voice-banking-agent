import { FastifyInstance } from 'fastify'
import { createReadStream, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { LLMService, createLLMService } from '../services/llm.js'
import { STTService, createSTTService } from '../services/stt.js'
import { TTSService, createTTSService } from '../services/tts.js'
import { SessionStore, getSessionStore } from '../services/session.js'
import { settings, redisAvailable } from '../config.js'
import { logger } from '../lib/logger.js'
import { createTurn } from '../domain/conversation.js'
import type { Turn } from '../domain/conversation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = join(__dirname, '../../../frontend')
const AUDIO_DIR = join(FRONTEND_DIR, 'audio')

interface TurnResponse {
  session_id: string
  turn_id: string
  user_transcript: string
  user_language_detected: string | null
  assistant_text: string
  assistant_audio_url: string | null
  tool_calls: Array<{ name: string; args: Record<string, unknown>; result: string | null }>
  latency_ms: { stt: number; llm: number; tools: number; tts: number; total: number }
}

// Injected by initServices
let sttService: STTService | null = null
let llmService: LLMService | null = null
let ttsService: TTSService | null = null
let sessionStore: SessionStore | null = null

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health
  fastify.get('/api/v1/health', async (_req, reply) => {
    let redisOk = false
    if (sessionStore) {
      try {
        await getSessionStore().get('__health__')
        redisOk = true
      } catch { /* noop */ }
    }
    return reply.send({
      status: llmService && sttService ? 'ok' : 'degraded',
      redis: redisOk,
      openai_stt: sttService !== null,
      openai_llm: llmService !== null,
    })
  })

  // Conversation turn
  fastify.post('/api/v1/conversation/turn', async (req, reply) => {
    let sttTiming = 0
    let llmTiming = 0
    let ttsTiming = 0

    // Parse multipart: get both file and session_id field
    let audioBuffer: Buffer | null = null
    let sessionId: string | null = null
    let filename = 'audio.webm'

    const parts = req.parts()
    for await (const part of parts) {
      if (part.type === 'file') {
        // fastify-multipart v8: use toBuffer() or stream from part.file
        audioBuffer = await part.toBuffer()
        filename = part.filename ?? filename
      } else if (part.type === 'field' && part.fieldname === 'session_id') {
        sessionId = part.value as string
      }
    }

    if (!audioBuffer || !audioBuffer.length) {
      return reply.status(400).send({ error: 'No audio data received' })
    }
    if (!sessionId) {
      return reply.status(400).send({ error: 'session_id is required' })
    }

    const turnId = Math.random().toString(36).slice(2, 10)
    const latencyMs: Record<string, number> = {}

    // STT
    let userTranscript = ''
    let languageDetected: string | null = null
    if (sttService) {
      try {
        const sttResult = await sttService.transcribe(audioBuffer, filename)
        userTranscript = sttResult.transcript.trim()
        languageDetected = sttResult.language
        sttTiming = sttResult.timingMs
        latencyMs.stt = sttTiming
      } catch (err) {
        logger.error({ err, sessionId }, 'stt_failed')
        const msg = err instanceof Error ? err.message : 'STT failed'
        return reply.status(500).send({
          error: 'STT_FAILED',
          message: 'I didn\'t catch that — could you repeat?',
          details: { message: msg },
        })
      }
    } else {
      return reply.status(500).send({ error: 'STT service unavailable' })
    }

    // Get session turns
    let sessionTurns: Turn[] = []
    if (sessionStore) {
      try {
        const session = await getSessionStore().get(sessionId)
        if (session) {
          sessionTurns = session.turns.slice(-settings.SESSION_TURN_LIMIT)
        }
      } catch (err) {
        logger.warn({ err, sessionId }, 'session_read_failed')
      }
    }

    // LLM
    let assistantText = ''
    const toolCallsResult: Array<{ name: string; args: Record<string, unknown>; result: string | null }> = []
    if (llmService) {
      try {
        const llmResult = await llmService.generate(
          userTranscript,
          sessionTurns,
          languageDetected,
          sttTiming,
        )
        assistantText = llmResult.text
        llmTiming = llmResult.timingMs
        latencyMs.llm = llmTiming
        latencyMs.tools = 0 // included in llm
        for (const tc of llmResult.toolCalls) {
          toolCallsResult.push({ name: tc.name, args: tc.args, result: tc.result })
        }
      } catch (err) {
        logger.error({ err, sessionId }, 'llm_failed')
        return reply.status(500).send({
          error: 'LLM_FAILED',
          message: 'Something went wrong on my end — please try again.',
          details: {},
        })
      }
    }

    // TTS
    let audioUrl: string | null = null
    if (ttsService && assistantText) {
      try {
        audioUrl = await ttsService.speak(assistantText, turnId)
        ttsTiming = 0
        latencyMs.tts = ttsTiming
      } catch (err) {
        logger.warn({ err, turnId }, 'tts_failed')
      }
    }

    latencyMs.total = (latencyMs.stt ?? 0) + (latencyMs.llm ?? 0) + (latencyMs.tools ?? 0) + (latencyMs.tts ?? 0)

    // Save turns to session
    const userTurn = createTurn({
      turn_id: turnId,
      role: 'user',
      content: userTranscript,
      language_detected: languageDetected,
    })
    const assistantTurn = createTurn({
      turn_id: `${turnId}_a`,
      role: 'assistant',
      content: assistantText,
      tool_calls: toolCallsResult,
      latency_ms: latencyMs,
      language_detected: null,
    })

    if (sessionStore) {
      try {
        await getSessionStore().appendTurn(sessionId, userTurn)
        await getSessionStore().appendTurn(sessionId, assistantTurn)
      } catch (err) {
        logger.warn({ err, sessionId }, 'session_write_failed')
      }
    }

    const response: TurnResponse = {
      session_id: sessionId,
      turn_id: turnId,
      user_transcript: userTranscript,
      user_language_detected: languageDetected,
      assistant_text: assistantText,
      assistant_audio_url: audioUrl,
      tool_calls: toolCallsResult,
      latency_ms: {
        stt: latencyMs.stt ?? 0,
        llm: latencyMs.llm ?? 0,
        tools: latencyMs.tools ?? 0,
        tts: latencyMs.tts ?? 0,
        total: latencyMs.total ?? 0,
      },
    }

    return reply.send(response)
  })

  // Serve audio
  fastify.get('/api/v1/audio/:turnId', async (req, reply) => {
    const { turnId } = req.params as { turnId: string }
    const filename = `response_${turnId}.mp3`
    const filepath = join(AUDIO_DIR, filename)

    if (!existsSync(filepath)) {
      return reply.status(404).send({ error: 'Audio not found' })
    }

    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(createReadStream(filepath))
  })

  // Get conversation history
  fastify.get('/api/v1/conversation/:sessionId', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    if (!sessionStore) return reply.status(503).send({ error: 'Session store unavailable' })

    const session = await getSessionStore().get(sessionId)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    return reply.send({
      session_id: session.session_id,
      customer_id: session.customer_id,
      turns: session.turns,
    })
  })

  // Delete conversation
  fastify.delete('/api/v1/conversation/:sessionId', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    if (!sessionStore) return reply.status(503).send({ error: 'Session store unavailable' })

    const deleted = await getSessionStore().delete(sessionId)
    if (!deleted) return reply.status(404).send({ error: 'Session not found' })

    return reply.send({ status: 'cleared', session_id: sessionId })
  })
}

export async function initServices(): Promise<void> {
  sttService = createSTTService(settings.OPENAI_API_KEY || null)
  llmService = createLLMService(settings.OPENAI_API_KEY || null)
  ttsService = createTTSService(settings.OPENAI_API_KEY || null)

  logger.info({
    stt: sttService !== null,
    llm: llmService !== null,
    tts: true,
  }, 'services_init')

  if (redisAvailable) {
    try {
      const { initRedis, initSessionStore: initSS } = await import('../services/session.js')
      const redis = await initRedis(settings.REDIS_URL)
      sessionStore = initSS(redis)
      logger.info('redis_init_ok')
    } catch (err) {
      logger.warn({ err }, 'redis_init_failed')
    }
  }

  if (ttsService) {
    const deleted = ttsService.cleanupOldAudio()
    if (deleted) logger.info({ deleted }, 'audio_cleanup')
  }
}
