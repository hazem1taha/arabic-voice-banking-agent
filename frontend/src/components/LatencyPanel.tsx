import type { LatencyMs } from '../lib/api'

interface LatencyPanelProps {
  latency: LatencyMs | null
}

export function LatencyPanel({ latency }: LatencyPanelProps) {
  if (!latency) {
    return (
      <div className="text-xs text-gray-600 font-mono">
        latency: —
      </div>
    )
  }

  const stages: Array<{ key: keyof LatencyMs; label: string }> = [
    { key: 'stt', label: 'STT' },
    { key: 'llm', label: 'LLM' },
    { key: 'tools', label: 'Tools' },
    { key: 'tts', label: 'TTS' },
    { key: 'total', label: 'Total' },
  ]

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 font-mono text-xs">
      <div className="text-gray-400 mb-2">latency breakdown</div>
      <div className="grid grid-cols-5 gap-2">
        {stages.map(({ key, label }) => {
          const value = latency[key]
          const pct = latency.total > 0 ? (value / latency.total) * 100 : 0
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <div className="text-gray-500">{label}</div>
              <div className="text-white font-medium">{Math.round(value)}ms</div>
              <div className="w-full bg-gray-700 rounded-full h-1">
                <div
                  className="bg-emerald-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(pct, 5)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}