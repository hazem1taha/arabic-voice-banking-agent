import { useState, useCallback, useRef } from 'react'

interface UseAudioRecordingReturn {
  isRecording: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  audioLevel: number
}

export function useAudioRecording(): UseAudioRecordingReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const analyzerRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up audio analyzer for level visualization
      const ctx = new AudioContext()
      analyzerRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyzer = ctx.createAnalyser()
      analyzer.fftSize = 256
      source.connect(analyzer)

      const dataArray = new Uint8Array(analyzer.frequencyBinCount)

      const updateLevel = () => {
        analyzer.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAudioLevel(avg / 255)
        animationRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start(100)  // Collect data every 100ms
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access error:', err)
      throw err
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder) {
        resolve(null)
        return
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        resolve(blob)
      }

      recorder.stop()

      // Clean up
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (analyzerRef.current) {
        analyzerRef.current.close()
      }

      setAudioLevel(0)
      setIsRecording(false)
    })
  }, [])

  return { isRecording, startRecording, stopRecording, audioLevel }
}