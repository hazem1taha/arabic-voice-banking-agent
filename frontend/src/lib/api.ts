export const API_BASE = ''

export interface LatencyMs {
  stt: number
  llm: number
  tools: number
  tts: number
  total: number
}

export interface ToolCallItem {
  name: string
  args: Record<string, unknown>
  result: string | null
}

export interface ConversationTurnResponse {
  session_id: string
  turn_id: string
  user_transcript: string
  user_language_detected: 'ar' | 'en' | null
  assistant_text: string
  assistant_audio_url: string | null
  tool_calls: ToolCallItem[]
  latency_ms: LatencyMs
}

export interface TurnResponse {
  turn_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls: ToolCallItem[]
  timestamp: string
  language_detected: string | null
}

export interface ConversationHistoryResponse {
  session_id: string
  customer_id: string
  turns: TurnResponse[]
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unavailable'
  redis: boolean
  openai_stt: boolean
  openai_llm: boolean
  version: string
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/v1/health`)
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  return res.json()
}

export async function sendConversationTurn(
  audioBlob: Blob,
  sessionId: string,
): Promise<ConversationTurnResponse> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'audio.webm')
  formData.append('session_id', sessionId)

  const res = await fetch(`${API_BASE}/api/v1/conversation/turn`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  return res.json()
}

export async function getConversationHistory(sessionId: string): Promise<ConversationHistoryResponse> {
  const res = await fetch(`${API_BASE}/api/v1/conversation/${sessionId}`)
  if (!res.ok) throw new Error(`Failed to get conversation: ${res.status}`)
  return res.json()
}

export async function deleteConversation(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/conversation/${sessionId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`)
}

export function getAudioUrl(path: string): string {
  return `${API_BASE}${path}`
}