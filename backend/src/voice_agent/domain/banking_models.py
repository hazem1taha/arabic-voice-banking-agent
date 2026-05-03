"""Banking domain models — accounts, cards, transactions, disputes."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Account(BaseModel):
    """A bank account."""

    account_id: str
    type: Literal["checking", "savings", "credit"]
    balance: float
    currency: str = "BHD"


class Card(BaseModel):
    """A debit/credit card."""

    card_id: str
    type: Literal["debit", "credit"]
    last_four: str
    status: Literal["active", "blocked", "expired", "pending_activation"]
    linked_account: str


class Transaction(BaseModel):
    """A single transaction on an account."""

    id: str
    account_id: str
    amount: float
    merchant: str
    date: str
    currency: str = "BHD"
    category: str | None = None


class Dispute(BaseModel):
    """A filed dispute."""

    id: str
    transaction_id: str
    reason: Literal["unauthorized", "duplicate", "amount_incorrect", "not_received"]
    contact_method: Literal["phone", "email", "sms"]
    customer_id: str
    filed_at: str
    status: str = "pending_review"


class Customer(BaseModel):
    """Mock customer data."""

    customer_id: str
    name: str
    name_ar: str
    accounts: list[Account]
    cards: list[Card]
    transactions: list[Transaction]
    disputes: list[Dispute] = Field(default_factory=list)


# Tool argument schemas (used in LLM function calling)

class GetAccountBalanceArgs(BaseModel):
    """Arguments for get_account_balance tool."""

    account_id: str | None = Field(
        default=None,
        description="Optional. If omitted, returns all linked accounts.",
    )


class GetRecentTransactionsArgs(BaseModel):
    """Arguments for get_recent_transactions tool."""

    limit: int = Field(default=5, ge=1, le=20)
    account_id: str | None = Field(default=None, description="Optional. Filter by account.")


class UpdateCardStatusArgs(BaseModel):
    """Arguments for update_card_status tool."""

    card_id: str | None = Field(default=None, description="Optional. Omit to use default card.")
    action: Literal["block", "unblock", "report_lost"] = Field(description="Action to perform.")
    reason: str | None = Field(default=None, description="Optional reason for the action.")


class FileDisputeArgs(BaseModel):
    """Arguments for file_dispute tool."""

    transaction_id: str = Field(description="Transaction reference ID (e.g., tx-001)")
    reason: Literal["unauthorized", "duplicate", "amount_incorrect", "not_received"] = Field(
        description="Reason for dispute"
    )
    contact_method: Literal["phone", "email", "sms"] = Field(description="Preferred contact method")


# Tool schemas for OpenAI function calling (JSON Schema format)
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_account_balance",
            "description": "Returns current balances for all linked accounts (checking, savings, credit). Use for questions about 'balance', 'money', 'accounts', 'رصيد'.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_transactions",
            "description": "Returns recent transactions. Use for 'recent transactions', 'last 5 transactions', 'operations', 'último العمليات'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "default": 5,
                        "ge": 1,
                        "le": 20,
                        "description": "Number of transactions to return (1-20).",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_card_status",
            "description": "Block, unblock, or report a card as lost. Use when user asks to 'block', 'حظر', 'إلغاء تفعيل' card.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["block", "unblock", "report_lost"],
                        "description": "The action to perform on the card.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Optional reason for the action.",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "file_dispute",
            "description": "File a dispute for a specific transaction. Multi-turn: collect transaction_id, reason, and contact_method first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "transaction_id": {
                        "type": "string",
                        "description": "Transaction reference ID (e.g., tx-001).",
                    },
                    "reason": {
                        "type": "string",
                        "enum": ["unauthorized", "duplicate", "amount_incorrect", "not_received"],
                        "description": "Reason for the dispute.",
                    },
                    "contact_method": {
                        "type": "string",
                        "enum": ["phone", "email", "sms"],
                        "description": "How to contact the customer.",
                    },
                },
                "required": ["transaction_id", "reason", "contact_method"],
            },
        },
    },
]