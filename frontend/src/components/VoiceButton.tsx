import { useCallback, useRef } from 'react'

interface VoiceButtonProps {
  isRecording: boolean
  isProcessing: boolean
  isSpeaking: boolean
  audioLevel: number
  onStartRecording: () => Promise<void>
  onStopRecording: () => Promise<Blob | null>
  onAudioReady: (blob: Blob) => void
}

export function VoiceButton({
  isRecording,
  isProcessing,
  isSpeaking,
  audioLevel,
  onStartRecording,
  onStopRecording,
  onAudioReady,
}: VoiceButtonProps) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseDown = useCallback(async () => {
    try {
      await onStartRecording()
    } catch {
      console.error('Failed to start recording')
    }
  }, [onStartRecording])

  const handleMouseUp = useCallback(async () => {
    const blob = await onStopRecording()
    if (blob && blob.size > 0) {
      onAudioReady(blob)
    }
  }, [onStopRecording, onAudioReady])

  const handleMouseLeave = useCallback(async () => {
    if (isRecording) {
      await handleMouseUp()
    }
  }, [isRecording, handleMouseUp])

  // Touch support
  const handleTouchStart = useCallback(async (e: React.TouchEvent) => {
    e.preventDefault()
    await handleMouseDown()
  }, [handleMouseDown])

  const handleTouchEnd = useCallback(async (e: React.TouchEvent) => {
    e.preventDefault()
    await handleMouseUp()
  }, [handleMouseUp])

  const buttonClass = [
    'relative w-28 h-28 rounded-full border-2 flex items-center justify-center cursor-pointer select-none',
    'transition-all duration-200',
    isRecording
      ? 'border-red-500 animate-[pulse-ring_1.5s_infinite] bg-red-500/10'
      : isSpeaking
        ? 'border-emerald-400 animate-[speak-pulse_0.8s_infinite] bg-emerald-500/10'
        : isProcessing
          ? 'border-gray-500 bg-gray-500/10 cursor-not-allowed'
          : 'border-gray-600 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
  ].join(' ')

  const micFill = isRecording ? '#ef4444' : isSpeaking ? '#10b981' : '#9ca3af'

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Audio level ring */}
      {isRecording && (
        <div
          className="w-32 h-32 rounded-full border-2 border-red-400/30 animate-ping"
          style={{ opacity: 0.3 + audioLevel * 0.5 }}
        />
      )}

      <button
        className={buttonClass}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={isProcessing || isSpeaking}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-12 h-12 transition-colors"
          fill={micFill}
        >
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </button>

      <span className="text-xs text-gray-400">
        {isRecording
          ? 'جاري التسجيل...'
          : isProcessing
            ? 'جاري المعالجة...'
            : isSpeaking
              ? 'نورة تتحدث...'
              : 'اضغط وتحدث'}
      </span>
    </div>
  )
}