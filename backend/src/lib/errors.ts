export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

export class STTError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STT_ERROR', details)
    this.name = 'STTError'
  }
}

export class LLMError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LLM_ERROR', details)
    this.name = 'LLMError'
  }
}

export class TTSError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TTS_ERROR', details)
    this.name = 'TTSError'
  }
}

export class SessionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SESSION_ERROR', details)
    this.name = 'SessionError'
  }
}

export class ToolExecutionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TOOL_EXECUTION_ERROR', details)
    this.name = 'ToolExecutionError'
  }
}
