import { useState, useRef, useEffect } from 'react'
import type { ToolCallItem } from '../lib/api'

interface TranscriptProps {
  turns: Array<{
    turn_id: string
    role: 'user' | 'assistant' | 'tool'
    content: string
    tool_calls: ToolCallItem[]
    timestamp: string
    language_detected: string | null
  }>
  onCopy?: (text: string) => void
}

export function Transcript({ turns, onCopy }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  if (turns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        جرب تقول "ما رصيدي؟" أو "What's my balance?"
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
      {turns.map((turn) => {
        if (turn.role === 'tool') return null

        const isUser = turn.role === 'user'
        const isArabic = turn.language_detected === 'ar' || (!turn.language_detected && /[\u0600-\u06FF]/.test(turn.content))

        return (
          <div
            key={turn.turn_id}
            className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={[
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed cursor-pointer',
                'transition-all duration-150 hover:shadow-lg',
                isUser
                  ? 'bg-gray-800 text-gray-100 rounded-bl-md'
                  : 'bg-emerald-900/40 text-emerald-100 rounded-br-md border border-emerald-800/50',
              ].join(' ')}
              dir={isArabic ? 'rtl' : 'ltr'}
              onClick={() => onCopy?.(turn.content)}
              title="انقر للنسخ"
            >
              {/* Speaker label */}
              <div className={`text-xs opacity-60 mb-1 ${isUser ? 'text-right' : 'text-left'}`}>
                {isUser
                  ? <>أنت {turn.language_detected && <span className="ml-1 text-xs">({turn.language_detected})</span>}</>
                  : 'نورة'}
              </div>

              {/* Content */}
              <div>{turn.content}</div>

              {/* Tool calls */}
              {turn.tool_calls.length > 0 && (
                <ToolCallView toolCalls={turn.tool_calls} />
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

function ToolCallView({ toolCalls }: { toolCalls: ToolCallItem[] }) {
  const [expanded, setExpanded] = useState(false)

  if (toolCalls.length === 0) return null

  return (
    <div className="mt-2 border-t border-gray-700/50 pt-2">
      {toolCalls.map((tc, i) => (
        <div key={i} className="mb-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-emerald-400 transition-colors"
          >
            <span className="text-emerald-500">⚙</span>
            <span className="font-mono">{tc.name}</span>
            <span className="text-gray-600">{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div className="mt-1 p-2 bg-gray-900/50 rounded text-xs font-mono text-gray-300">
              {tc.args && Object.keys(tc.args).length > 0 && (
                <div className="mb-1">
                  <span className="text-gray-500">args: </span>
                  {JSON.stringify(tc.args, null, 2)}
                </div>
              )}
              {tc.result && (
                <div>
                  <span className="text-gray-500">result: </span>
                  {(() => {
                    try {
                      const parsed = JSON.parse(tc.result)
                      return JSON.stringify(parsed, null, 2)
                    } catch {
                      return tc.result
                    }
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}