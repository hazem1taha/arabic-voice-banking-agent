import { describe, it, expect } from '@jest/globals'
import { createTurn, createSession, getRecentTurns } from '../../src/domain/conversation.js'

describe('Conversation domain', () => {
  describe('createTurn', () => {
    it('creates a user turn', () => {
      const turn = createTurn({
        turn_id: 't1',
        role: 'user',
        content: 'Hello',
        language_detected: 'ar',
      })
      expect(turn.turn_id).toBe('t1')
      expect(turn.role).toBe('user')
      expect(turn.content).toBe('Hello')
      expect(turn.language_detected).toBe('ar')
      expect(turn.timestamp).toBeTruthy()
      expect(turn.tool_calls).toEqual([])
    })

    it('creates an assistant turn with tool calls', () => {
      const turn = createTurn({
        turn_id: 't2',
        role: 'assistant',
        content: 'Your balance is 5000 EGP',
        tool_calls: [{ name: 'get_account_balance', args: {}, result: '{"balance":5000}' }],
      })
      expect(turn.role).toBe('assistant')
      expect(turn.tool_calls.length).toBe(1)
      expect(turn.tool_calls[0].name).toBe('get_account_balance')
    })
  })

  describe('createSession', () => {
    it('creates a session with defaults', () => {
      const session = createSession('sess-123')
      expect(session.session_id).toBe('sess-123')
      expect(session.customer_id).toBe('cust-001')
      expect(session.turns).toEqual([])
      expect(session.created_at).toBeTruthy()
    })

    it('creates a session with custom customer_id', () => {
      const session = createSession('sess-456', 'cust-999')
      expect(session.customer_id).toBe('cust-999')
    })
  })

  describe('getRecentTurns', () => {
    it('returns last N turns', () => {
      const session = createSession('sess-1')
      for (let i = 0; i < 15; i++) {
        session.turns.push(createTurn({ turn_id: `t${i}`, role: 'user', content: `msg ${i}` }))
      }
      const recent = getRecentTurns(session, 5)
      expect(recent.length).toBe(5)
      expect(recent[0].turn_id).toBe('t10')
      expect(recent[4].turn_id).toBe('t14')
    })

    it('returns all turns when under limit', () => {
      const session = createSession('sess-2')
      session.turns.push(createTurn({ turn_id: 't1', role: 'user', content: 'a' }))
      session.turns.push(createTurn({ turn_id: 't2', role: 'user', content: 'b' }))
      const recent = getRecentTurns(session, 10)
      expect(recent.length).toBe(2)
    })
  })
})
