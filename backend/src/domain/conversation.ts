export interface ToolCall {
  name: string
  args: Record<string, unknown>
  result: string | null
}

export interface Turn {
  turn_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls: ToolCall[]
  timestamp: string
  latency_ms: Record<string, number> | null
  language_detected: string | null
}

export interface Session {
  session_id: string
  customer_id: string
  created_at: string
  turns: Turn[]
}

export function createTurn(data: {
  turn_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  latency_ms?: Record<string, number> | null
  language_detected?: string | null
}): Turn {
  return {
    turn_id: data.turn_id,
    role: data.role,
    content: data.content,
    tool_calls: data.tool_calls ?? [],
    timestamp: new Date().toISOString(),
    latency_ms: data.latency_ms ?? null,
    language_detected: data.language_detected ?? null,
  }
}

export function createSession(sessionId: string, customerId: string = 'cust-001'): Session {
  return {
    session_id: sessionId,
    customer_id: customerId,
    created_at: new Date().toISOString(),
    turns: [],
  }
}

export function getRecentTurns(session: Session, limit: number = 10): Turn[] {
  return session.turns.slice(-limit)
}
