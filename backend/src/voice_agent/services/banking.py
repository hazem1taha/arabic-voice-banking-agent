"""Banking service — mock banking actions for the four tool functions."""

import json
from pathlib import Path
from typing import Any

from voice_agent.lib.errors import ToolExecutionError


DATA_PATH = Path(__file__).parent.parent.parent / "data" / "mock_banking.json"

_CACHED_DATA: dict[str, Any] | None = None


def _load_data() -> dict[str, Any]:
    """Load and cache mock banking data."""
    global _CACHED_DATA
    if _CACHED_DATA is None:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            _CACHED_DATA = json.load(f)
    return _CACHED_DATA


def get_customer(customer_id: str = "cust-001") -> dict[str, Any]:
    """Get customer data."""
    data = _load_data()
    customer = data["customers"].get(customer_id)
    if not customer:
        raise ToolExecutionError(f"Customer not found: {customer_id}", details={"customer_id": customer_id})
    return customer


def get_account_balance(account_id: str | None = None) -> dict[str, Any]:
    """Return balances for all accounts, or a specific account."""
    customer = get_customer()
    if account_id:
        acc = next((a for a in customer["accounts"] if a["account_id"] == account_id), None)
        if not acc:
            raise ToolExecutionError(f"Account not found: {account_id}", details={"account_id": account_id})
        return {"account": acc, "customer_name": customer["name"]}
    return {
        "accounts": customer["accounts"],
        "customer_name": customer["name"],
        "customer_name_ar": customer["name_ar"],
    }


def get_recent_transactions(limit: int = 5, account_id: str | None = None) -> dict[str, Any]:
    """Return recent transactions, optionally filtered by account."""
    customer = get_customer()
    txns = customer["transactions"]
    if account_id:
        txns = [t for t in txns if t["account_id"] == account_id]
    return {
        "transactions": txns[:limit],
        "customer_id": customer["customer_id"],
    }


def get_card_status(card_id: str | None = None) -> dict[str, Any]:
    """Return card status (default card if card_id omitted)."""
    customer = get_customer()
    if card_id:
        card = next((c for c in customer["cards"] if c["card_id"] == card_id), None)
        if not card:
            raise ToolExecutionError(f"Card not found: {card_id}", details={"card_id": card_id})
    else:
        card = customer["cards"][0] if customer["cards"] else None

    if not card:
        raise ToolExecutionError("No cards found for customer", details={"customer_id": customer["customer_id"]})

    status_labels = {
        "active": "مفعلة" if True else "active",  # Arabic labels below
        "blocked": "محظورة",
        "expired": "منتهية الصلاحية",
        "pending_activation": "في انتظار التفعيل",
    }

    # We need to determine language from context — but this is pure domain, so return both
    return {
        "card": card,
        "status_label_ar": status_labels.get(card["status"], card["status"]),
        "customer_name": customer["name"],
    }


def _update_card_status(card_id: str | None, action: str, reason: str | None = None) -> dict[str, Any]:
    """Internal: update card status. Returns updated card."""
    # For the mock, we track status changes in memory only
    customer = get_customer()
    if card_id:
        card = next((c for c in customer["cards"] if c["card_id"] == card_id), None)
    else:
        card = customer["cards"][0] if customer["cards"] else None

    if not card:
        raise ToolExecutionError("No card found", details={"card_id": card_id or "default"})

    if action == "block":
        card["status"] = "blocked"
    elif action == "unblock":
        card["status"] = "active"
    elif action == "report_lost":
        card["status"] = "blocked"

    return {
        "card": card,
        "action": action,
        "reason": reason,
        "message_ar": {
            "block": "تم حظر البطاقة بنجاح.",
            "unblock": "تم تفعيل البطاقة بنجاح.",
            "report_lost": "تم الإبلاغ عن فقدان البطاقة. سيتم إرسال بطاقة جديدة.",
        }.get(action, "تم تحديث حالة البطاقة."),
    }


def update_card_status(card_id: str | None = None, action: str = "block", reason: str | None = None) -> dict[str, Any]:
    """Tool: update card status (block/unblock/report_lost)."""
    return _update_card_status(card_id, action, reason)


def file_dispute(transaction_id: str, reason: str, contact_method: str) -> dict[str, Any]:
    """File a dispute. Appends to customer's disputes list."""
    import uuid
    from datetime import datetime, timezone

    customer = get_customer()

    # Validate transaction exists
    valid_ids = {t["id"] for t in customer["transactions"]}
    if transaction_id not in valid_ids:
        raise ToolExecutionError(
            "Transaction not found",
            details={"transaction_id": transaction_id, "valid_ids": list(valid_ids)},
        )

    dispute = {
        "id": f"disp-{uuid.uuid4().hex[:8]}",
        "transaction_id": transaction_id,
        "reason": reason,
        "contact_method": contact_method,
        "customer_id": customer["customer_id"],
        "filed_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending_review",
    }

    customer["disputes"].append(dispute)

    # Persist back to JSON (simple file write for mock)
    _persist_data(_CACHED_DATA)

    reason_labels = {
        "unauthorized": "غير مصرح بها",
        "duplicate": "مكررة",
        "amount_incorrect": "مبلغ غير صحيح",
        "not_received": "لم استلم المنتج",
    }

    contact_labels = {
        "phone": "اتصال هاتفي",
        "email": "بريد إلكتروني",
        "sms": "رسالة نصية",
    }

    return {
        "dispute": dispute,
        "message": f"تم تقديم الشكوى بنجاح. رقم الشكوى: {dispute['id']}",
        "message_ar": f"تم تقديم الشكوى بنجاح. رقم الشكوى: {dispute['id']}. سنتواصل معك عبر {contact_labels.get(contact_method, contact_method)}.",
    }


def _persist_data(data: dict[str, Any]) -> None:
    """Write data back to the JSON file (mock persistence)."""
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# Tool handlers map — maps function name to (function, needs_args_validation)
TOOL_HANDLERS = {
    "get_account_balance": get_account_balance,
    "get_recent_transactions": get_recent_transactions,
    "update_card_status": update_card_status,
    "file_dispute": file_dispute,
}


def execute_tool(function_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute a banking tool by name with arguments dict."""
    handler = TOOL_HANDLERS.get(function_name)
    if not handler:
        raise ToolExecutionError(f"Unknown tool: {function_name}", details={"function_name": function_name})

    # Filter to only known args for each handler
    result = handler(**arguments)
    return result