// Tool schemas for GPT-4o function calling — mirrors Python TOOL_SCHEMAS

export const TOOL_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_account_balance',
      description: 'Get account balance(s) for the customer. Returns all accounts if no account_id provided.',
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Optional. Specific account ID to query.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_recent_transactions',
      description: 'Get recent banking transactions.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Number of transactions to return (default 5, max 50).',
            default: 5,
          },
          account_id: {
            type: 'string',
            description: 'Optional. Filter by account ID.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_card_status',
      description: 'Update a card status (block, unblock, or report it lost/stolen).',
      parameters: {
        type: 'object',
        properties: {
          card_id: {
            type: 'string',
            description: 'Optional. Card ID. Defaults to primary card.',
          },
          action: {
            type: 'string',
            enum: ['block', 'unblock', 'report_lost'],
            description: 'Action to perform.',
          },
          reason: {
            type: 'string',
            description: 'Optional. Reason for the action.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_dispute',
      description: 'File a dispute for a specific transaction.',
      parameters: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'ID of the transaction to dispute.',
          },
          reason: {
            type: 'string',
            enum: ['unauthorized', 'duplicate', 'amount_incorrect', 'not_received'],
            description: 'Reason for the dispute.',
          },
          contact_method: {
            type: 'string',
            enum: ['phone', 'email', 'sms'],
            description: 'Preferred contact method for follow-up.',
          },
        },
        required: ['transaction_id', 'reason', 'contact_method'],
        additionalProperties: false,
      },
    },
  },
]

export type ToolName = 'get_account_balance' | 'get_recent_transactions' | 'update_card_status' | 'file_dispute'

// Re-export tool schemas as JSON for OpenAI SDK
export const TOOL_SCHEMA_JSON = TOOL_SCHEMAS.map((t) => ({
  type: t.type,
  function: t.function,
}))
