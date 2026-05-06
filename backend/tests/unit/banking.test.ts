import { describe, it, expect } from '@jest/globals'
import { executeTool } from '../../src/services/banking.js'

describe('BankingService', () => {
  describe('get_account_balance', () => {
    it('returns all accounts when no account_id provided', () => {
      const result = executeTool('get_account_balance', {})
      expect(result).toHaveProperty('accounts')
      expect(result).toHaveProperty('customer_name')
      expect(result).toHaveProperty('customer_name_ar')
    })

    it('returns specific account when account_id provided', () => {
      const result = executeTool('get_account_balance', { account_id: 'acc-001' }) as Record<string, unknown>
      expect(result).toHaveProperty('account')
      expect(result).toHaveProperty('customer_name')
    })

    it('throws for unknown account_id', () => {
      expect(() =>
        executeTool('get_account_balance', { account_id: 'invalid-account' }),
      ).toThrow()
    })
  })

  describe('get_recent_transactions', () => {
    it('returns transactions with default limit 5', () => {
      const result = executeTool('get_recent_transactions', {}) as Record<string, unknown>
      expect(result).toHaveProperty('transactions')
      expect(result).toHaveProperty('customer_id')
    })

    it('respects custom limit', () => {
      const result = executeTool('get_recent_transactions', { limit: 2 }) as Record<string, unknown>
      const txns = result.transactions as unknown[]
      expect(txns.length).toBeLessThanOrEqual(2)
    })

    it('filters by account_id', () => {
      const result = executeTool('get_recent_transactions', { account_id: 'acc-001', limit: 10 }) as Record<string, unknown>
      const txns = result.transactions as Array<{ account_id: string }>
      for (const t of txns) {
        expect(t.account_id).toBe('acc-001')
      }
    })
  })

  describe('update_card_status', () => {
    it('blocks a card', () => {
      const result = executeTool('update_card_status', { action: 'block' }) as Record<string, unknown>
      expect(result).toHaveProperty('card')
      expect(result).toHaveProperty('message_ar')
    })

    it('unblocks a card', () => {
      const result = executeTool('update_card_status', { action: 'unblock' }) as Record<string, unknown>
      expect(result).toHaveProperty('card')
    })

    it('reports card as lost', () => {
      const result = executeTool('update_card_status', { action: 'report_lost', reason: 'stolen' }) as Record<string, unknown>
      expect(result).toHaveProperty('card')
      expect(result).toHaveProperty('message_ar')
    })
  })

  describe('file_dispute', () => {
    it('files a dispute for valid transaction', () => {
      const result = executeTool('file_dispute', {
        transaction_id: 'txn-001',
        reason: 'unauthorized',
        contact_method: 'phone',
      }) as Record<string, unknown>
      expect(result).toHaveProperty('dispute')
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('message_ar')
    })

    it('throws for invalid transaction_id', () => {
      expect(() =>
        executeTool('file_dispute', {
          transaction_id: 'invalid-txn',
          reason: 'unauthorized',
          contact_method: 'email',
        }),
      ).toThrow()
    })
  })

  describe('unknown tool', () => {
    it('throws for unknown tool', () => {
      expect(() => executeTool('unknown_tool', {})).toThrow()
    })
  })
})
