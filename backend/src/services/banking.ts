import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ToolExecutionError } from '../lib/errors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(__dirname, '../../data/mock_banking.json')

interface Account {
  account_id: string
  account_type: string
  balance: number
  currency: string
  status: string
}

interface Card {
  card_id: string
  last_four: string
  status: string
  expiry: string
  card_type: string
}

interface Transaction {
  id: string
  account_id: string
  amount: number
  currency: string
  description: string
  date: string
  category: string
}

interface Customer {
  customer_id: string
  name: string
  name_ar: string
  accounts: Account[]
  cards: Card[]
  transactions: Transaction[]
  disputes: Record<string, unknown>[]
}

interface MockBankingData {
  customers: Record<string, Customer>
}

let cachedData: MockBankingData | null = null

function loadData(): MockBankingData {
  if (cachedData) return cachedData
  const raw = readFileSync(DATA_PATH, 'utf-8')
  cachedData = JSON.parse(raw) as MockBankingData
  return cachedData
}

function getCustomer(customerId: string = 'cust-001'): Customer {
  const data = loadData()
  const customer = data.customers[customerId]
  if (!customer) throw new ToolExecutionError(`Customer not found: ${customerId}`, { customerId })
  return customer
}

export function getAccountBalance(accountId?: string): Record<string, unknown> {
  const customer = getCustomer()
  if (accountId) {
    const acc = customer.accounts.find((a) => a.account_id === accountId)
    if (!acc) throw new ToolExecutionError(`Account not found: ${accountId}`, { accountId })
    return { account: acc, customer_name: customer.name }
  }
  return {
    accounts: customer.accounts,
    customer_name: customer.name,
    customer_name_ar: customer.name_ar,
  }
}

export function getRecentTransactions(limit: number = 5, accountId?: string): Record<string, unknown> {
  const customer = getCustomer()
  let txns = customer.transactions
  if (accountId) txns = txns.filter((t) => t.account_id === accountId)
  return { transactions: txns.slice(0, limit), customer_id: customer.customer_id }
}

const STATUS_LABELS_AR: Record<string, string> = {
  active: 'مفعلة',
  blocked: 'محظورة',
  expired: 'منتهية الصلاحية',
  pending_activation: 'في انتظار التفعيل',
}

export function getCardStatus(cardId?: string): Record<string, unknown> {
  const customer = getCustomer()
  let card: Card | undefined
  if (cardId) {
    card = customer.cards.find((c) => c.card_id === cardId)
  } else {
    card = customer.cards[0]
  }
  if (!card) throw new ToolExecutionError('No cards found for customer', { customer_id: customer.customer_id })
  return {
    card,
    status_label_ar: STATUS_LABELS_AR[card.status] ?? card.status,
    customer_name: customer.name,
  }
}

export function updateCardStatus(
  cardId?: string,
  action: 'block' | 'unblock' | 'report_lost' = 'block',
  reason?: string,
): Record<string, unknown> {
  const customer = getCustomer()
  let card: Card | undefined
  if (cardId) {
    card = customer.cards.find((c) => c.card_id === cardId)
  } else {
    card = customer.cards[0]
  }
  if (!card) throw new ToolExecutionError('No card found', { cardId: cardId ?? 'default' })

  if (action === 'block') card.status = 'blocked'
  else if (action === 'unblock') card.status = 'active'
  else if (action === 'report_lost') card.status = 'blocked'

  const messagesAr: Record<string, string> = {
    block: 'تم حظر البطاقة بنجاح.',
    unblock: 'تم تفعيل البطاقة بنجاح.',
    report_lost: 'تم الإبلاغ عن فقدان البطاقة. سيتم إرسال بطاقة جديدة.',
  }

  return { card, action, reason, message_ar: messagesAr[action] ?? 'تم تحديث حالة البطاقة.' }
}

export function fileDispute(
  transactionId: string,
  reason: string,
  contactMethod: string,
): Record<string, unknown> {
  const customer = getCustomer()
  const validIds = new Set(customer.transactions.map((t) => t.id))
  if (!validIds.has(transactionId)) {
    throw new ToolExecutionError('Transaction not found', { transactionId, validIds: [...validIds] })
  }

  const disputeId = `disp-${Math.random().toString(36).slice(2, 10)}`
  const dispute = {
    id: disputeId,
    transaction_id: transactionId,
    reason,
    contact_method: contactMethod,
    customer_id: customer.customer_id,
    filed_at: new Date().toISOString(),
    status: 'pending_review',
  }

  customer.disputes.push(dispute)

  const contactLabels: Record<string, string> = {
    phone: 'اتصال هاتفي',
    email: 'بريد إلكتروني',
    sms: 'رسالة نصية',
  }

  return {
    dispute,
    message: `تم تقديم الشكوى بنجاح. رقم الشكوى: ${disputeId}`,
    message_ar: `تم تقديم الشكوى بنجاح. رقم الشكوى: ${disputeId}. سنتواصل معك عبر ${contactLabels[contactMethod] ?? contactMethod}.`,
  }
}

type ToolArgs = Record<string, unknown>

export function executeTool(functionName: string, args: ToolArgs): Record<string, unknown> {
  switch (functionName) {
    case 'get_account_balance':
      return getAccountBalance(args.account_id as string | undefined)
    case 'get_recent_transactions':
      return getRecentTransactions(
        (args.limit as number) ?? 5,
        args.account_id as string | undefined,
      )
    case 'update_card_status':
      return updateCardStatus(
        args.card_id as string | undefined,
        args.action as 'block' | 'unblock' | 'report_lost',
        args.reason as string | undefined,
      )
    case 'file_dispute':
      return fileDispute(
        args.transaction_id as string,
        args.reason as string,
        args.contact_method as string,
      )
    default:
      throw new ToolExecutionError(`Unknown tool: ${functionName}`, { functionName })
  }
}
