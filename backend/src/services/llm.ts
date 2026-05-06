import OpenAI from 'openai'
import { LLMError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { TOOL_SCHEMA_JSON } from '../domain/banking-models.js'
import { executeTool } from './banking.js'
import type { Turn } from '../domain/conversation.js'
import type { ChatCompletionMessageParam } from 'openai/resources'

export interface LLMResult {
  text: string
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>
  languageDetected: string | null
  timingMs: number
}

function buildSystemPrompt(languageDetected: string | null): string {
  if (languageDetected === 'ar') {
    return `أنت مساعد مصرفي صوتي عربي ودي. تتحدث فقط العربية الفصحى السليمة.

مهمتك:
- الإجابة على أسئلة العملاء حول حساباتهم المصرفية
- عرض أرصدة الحسابات والحركات الأخيرة
- المساعدة في block/unblock البطاقات
- تقديم شكوى على معاملة
- التواصل بوضوح وبساطة

القواعد:
- أجب دائمًا بالعربية الفصحى
- لا تخترع معلومات — استخدم الأدوات المتاحة فقط
- إذا لم تفهم، اطلب التكرار بلباقة
- كن ودودًا واحترافيًا`
  }
  return `You are a friendly Arabic bilingual voice banking assistant.

Your role:
- Answer customer questions about their bank accounts
- Show account balances and recent transactions
- Help block/unblock cards
- File disputes on transactions
- Communicate clearly and simply

Rules:
- Respond in the same language the customer used (Arabic or English)
- Never invent information — use available tools only
- If you don't understand, ask politely to repeat
- Be friendly and professional`
}

function buildMessages(
  systemPrompt: string,
  conversationTurns: Turn[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]
  for (const turn of conversationTurns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.content })
    } else if (turn.role === 'assistant') {
      const msg: ChatCompletionMessageParam = { role: 'assistant', content: turn.content }
      if (turn.tool_calls.length > 0) {
        (msg as ChatCompletionMessageParam & { tool_calls: unknown[] }).tool_calls = turn.tool_calls.map((tc, i) => ({
          id: `call_${tc.name}_${i}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }))
      }
      messages.push(msg)
    }
  }
  return messages
}

export class LLMService {
  constructor(private client: OpenAI | null) {}

  async generate(
    userTranscript: string,
    conversationTurns: Turn[],
    languageDetected: string | null = null,
    _sttTimingMs: number = 0,
  ): Promise<LLMResult> {
    if (!this.client) throw new LLMError('OpenAI client not configured')

    const systemPrompt = buildSystemPrompt(languageDetected)
    const messages = buildMessages(systemPrompt, conversationTurns)
    messages.push({ role: 'user', content: userTranscript })

    const start = performance.now()

    // First call
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: TOOL_SCHEMA_JSON,
      tool_choice: 'auto',
    })

    const choice = response.choices[0]
    const assistantMessage = choice.message

    let finalText = assistantMessage.content ?? ''
    const toolCallsResult: Array<{ name: string; args: Record<string, unknown>; result: string }> = []

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: ChatCompletionMessageParam[] = []

      for (const tc of assistantMessage.tool_calls) {
        const funcName = tc.function.name
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* use empty */ }

        try {
          const result = executeTool(funcName, args)
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result, null, 2),
          })
          toolCallsResult.push({ name: funcName, args, result: JSON.stringify(result) })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: errMsg }),
          })
          toolCallsResult.push({ name: funcName, args, result: JSON.stringify({ error: errMsg }) })
        }
      }

      const assistantMsgForSecondCall: ChatCompletionMessageParam = {
        role: 'assistant',
        content: assistantMessage.content ?? '',
      }
      if (assistantMessage.tool_calls.length > 0) {
        (assistantMsgForSecondCall as ChatCompletionMessageParam & { tool_calls: unknown[] }).tool_calls =
          assistantMessage.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }))
      }

      messages.push(assistantMsgForSecondCall)
      messages.push(...toolResults)

      // Second call
      const followUp = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: TOOL_SCHEMA_JSON,
      })
      finalText = followUp.choices[0].message.content ?? assistantMessage.content ?? ''
    }

    const timingMs = performance.now() - start
    return { text: finalText, toolCalls: toolCallsResult, languageDetected, timingMs }
  }
}

export function createLLMService(apiKey: string | null): LLMService | null {
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — LLM unavailable')
    return null
  }
  return new LLMService(new OpenAI({ apiKey }))
}
