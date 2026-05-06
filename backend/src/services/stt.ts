import OpenAI from 'openai'
import { STTError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export interface STTResult {
  transcript: string
  language: string | null
  confidence: number | null
  timingMs: number
}

export class STTService {
  constructor(private client: OpenAI) {}

  async transcribe(audioBytes: Buffer, filename: string = 'audio.webm'): Promise<STTResult> {
    const start = performance.now()

    try {
      const file = new File([audioBytes], filename, { type: 'audio/webm' })

      const response = await this.client.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        response_format: 'verbose_json',
      }) as unknown as { text?: string; language?: string }

      const timingMs = performance.now() - start
      return {
        transcript: response.text?.trim() ?? '',
        language: response.language ?? null,
        confidence: null,
        timingMs,
      }
    } catch (err) {
      logger.error({ err }, 'stt_failed')
      const msg = err instanceof Error ? err.message : 'STT transcription failed'
      throw new STTError(msg)
    }
  }
}

export function createSTTService(apiKey: string | null): STTService | null {
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — STT unavailable')
    return null
  }
  return new STTService(new OpenAI({ apiKey }))
}
