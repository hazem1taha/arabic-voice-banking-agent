import { writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { settings } from '../config.js'
import { logger } from '../lib/logger.js'
import OpenAI from 'openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATIC_DIR = join(__dirname, '../../../static')
const AUDIO_DIR = join(STATIC_DIR, 'audio')

export class TTSService {
  constructor(private client: OpenAI | null) {}

  private ensureAudioDir(): void {
    if (!existsSync(AUDIO_DIR)) {
      mkdirSync(AUDIO_DIR, { recursive: true })
    }
  }

  async speak(text: string, turnId: string): Promise<string | null> {
    if (!this.client) {
      logger.warn('TTS client not configured — returning null')
      return null
    }

    this.ensureAudioDir()
    const filepath = join(AUDIO_DIR, `response_${turnId}.mp3`)

    try {
      const response = await this.client.audio.speech.create({
        model: settings.TTS_MODEL,
        voice: settings.TTS_VOICE,
        input: text,
        response_format: 'mp3',
      })

      const buffer = Buffer.from(await response.arrayBuffer())
      writeFileSync(filepath, buffer)

      logger.info({ turnId, textLen: text.length }, 'tts_generated')
      return `/api/v1/audio/${turnId}`
    } catch (err) {
      logger.error({ turnId, err }, 'tts_failed')
      return null
    }
  }

  cleanupOldAudio(): number {
    try {
      this.ensureAudioDir()
      const now = Date.now() / 1000
      let deleted = 0
      for (const file of readdirSync(AUDIO_DIR)) {
        const filepath = join(AUDIO_DIR, file)
        const mtime = statSync(filepath).mtime.getTime() / 1000
        if (now - mtime > settings.AUDIO_MAX_AGE_SECONDS) {
          unlinkSync(filepath)
          deleted++
        }
      }
      return deleted
    } catch (err) {
      logger.warn({ err }, 'audio_cleanup_failed')
      return 0
    }
  }
}

export function createTTSService(apiKey: string | null): TTSService {
  const client = apiKey ? new OpenAI({ apiKey }) : null
  return new TTSService(client)
}
