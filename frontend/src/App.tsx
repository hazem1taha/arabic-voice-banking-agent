import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VoiceButton } from './components/VoiceButton'
import { Transcript } from './components/Transcript'
import { LatencyPanel } from './components/LatencyPanel'
import { useAudioRecording } from './hooks/useAudioRecording'
import { useConversation } from './hooks/useConversation'
import { getConversationHistory, type ConversationHistoryResponse } from './lib/api'

export default function App() {
  const { sessionId, isProcessing, isSpeaking, connectionOk, sendAudio, resetConversation, lastResponse } = useConversation()
  const { isRecording, startRecording, stopRecording, audioLevel } = useAudioRecording()

  const [turns, setTurns] = useState<ConversationHistoryResponse['turns']>([])

  const { refetch: refetchHistory } = useQuery({
    queryKey: ['conversation', sessionId],
    queryFn: () => getConversationHistory(sessionId),
    enabled: false,
  })

  const handleAudioReady = useCallback(async (blob: Blob) => {
    try {
      const response = await sendAudio(blob)
      if (response) {
        // Update turns from response
        setTurns((prev) => [
          ...prev,
          {
            turn_id: response.turn_id,
            role: 'user',
            content: response.user_transcript,
            tool_calls: [],
            timestamp: new Date().toISOString(),
            language_detected: response.user_language_detected,
          },
          {
            turn_id: response.turn_id + '_a',
            role: 'assistant',
            content: response.assistant_text,
            tool_calls: response.tool_calls,
            timestamp: new Date().toISOString(),
            language_detected: null,
          },
        ])
      }
    } catch (err) {
      console.error('Failed to send audio:', err)
    }
  }, [sendAudio])

  const handleReset = useCallback(async () => {
    await resetConversation()
    setTurns([])
  }, [resetConversation])

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-emerald-400">نورة</h1>
          <p className="text-xs text-gray-500">المساعد المصرفي الصوتي — بنك الرؤية</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionOk ? 'bg-emerald-400' : 'bg-red-500'}`} />
            <span className="text-gray-500 text-xs">
              {connectionOk ? 'متصل' : 'غير متصل'}
            </span>
          </div>
          <div className="text-gray-600 text-xs font-mono">SESSION: {sessionId}</div>
        </div>
      </header>

      {/* Conversation area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Transcript turns={turns} onCopy={handleCopy} />

        {/* Latency panel */}
        <div className="px-4 py-2">
          <LatencyPanel latency={lastResponse?.latency_ms ?? null} />
        </div>

        {/* Voice button */}
        <div className="flex justify-center py-4">
          <VoiceButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onAudioReady={handleAudioReady}
          />
        </div>

        {/* Footer actions */}
        <div className="flex justify-center gap-4 pb-6">
          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-3 py-1 rounded border border-gray-700 hover:border-gray-600"
          >
            Reset conversation
          </button>
        </div>
      </main>
    </div>
  )
}