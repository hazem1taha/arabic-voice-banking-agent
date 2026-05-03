import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  sendConversationTurn,
  getConversationHistory,
  deleteConversation,
  checkHealth,
  getAudioUrl,
  type ConversationTurnResponse,
  type ConversationHistoryResponse,
} from '../lib/api'

const SESSION_KEY = 'voice_banking_session'

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = 'sess_' + Math.random().toString(36).slice(2, 11)
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

interface UseConversationReturn {
  sessionId: string
  isProcessing: boolean
  isSpeaking: boolean
  connectionOk: boolean
  sendAudio: (blob: Blob) => Promise<ConversationTurnResponse | null>
  resetConversation: () => Promise<void>
  lastResponse: ConversationTurnResponse | null
}

export function useConversation(): UseConversationReturn {
  const queryClient = useQueryClient()
  const sessionId = getOrCreateSessionId()
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastResponse, setLastResponse] = useState<ConversationTurnResponse | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 10000,
    retry: 1,
  })

  const connectionOk = healthData?.status === 'ok'

  const sendAudioMutation = useMutation({
    mutationFn: (blob: Blob) => sendConversationTurn(blob, sessionId),
    onSuccess: (data) => {
      setLastResponse(data)
      queryClient.setQueryData(['conversation', sessionId], (old: ConversationHistoryResponse | undefined) => {
        if (!old) return old
        return {
          ...old,
          turns: [...old.turns, {
            turn_id: data.turn_id,
            role: 'user',
            content: data.user_transcript,
            tool_calls: [],
            timestamp: new Date().toISOString(),
            language_detected: data.user_language_detected,
          }, {
            turn_id: data.turn_id + '_a',
            role: 'assistant',
            content: data.assistant_text,
            tool_calls: data.tool_calls,
            timestamp: new Date().toISOString(),
            language_detected: null,
          }],
        }
      })

      // Play audio if available
      if (data.assistant_audio_url) {
        playAudio(data.assistant_audio_url)
      }
    },
  })

  const playAudio = useCallback((audioPath: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(getAudioUrl(audioPath))
    audioRef.current = audio
    audio.onplay = () => setIsSpeaking(true)
    audio.onended = () => setIsSpeaking(false)
    audio.onerror = () => {
      setIsSpeaking(false)
      // Fallback to browser TTS
      if (lastResponse?.assistant_text) {
        fallbackTTS(lastResponse.assistant_text)
      }
    }
    audio.play().catch(() => {
      setIsSpeaking(false)
      if (lastResponse?.assistant_text) {
        fallbackTTS(lastResponse.assistant_text)
      }
    })
  }, [lastResponse])

  function fallbackTTS(text: string) {
    if (!window.speechSynthesis) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'ar-SA'
    utter.rate = 0.95
    utter.onend = () => setIsSpeaking(false)
    speechSynthesis.speak(utter)
  }

  const resetMutation = useMutation({
    mutationFn: () => deleteConversation(sessionId),
    onSuccess: () => {
      setLastResponse(null)
      queryClient.setQueryData(['conversation', sessionId], undefined)
    },
  })

  return {
    sessionId,
    isProcessing: sendAudioMutation.isPending,
    isSpeaking,
    connectionOk: connectionOk ?? false,
    sendAudio: sendAudioMutation.mutateAsync,
    resetConversation: resetMutation.mutateAsync,
    lastResponse,
  }
}