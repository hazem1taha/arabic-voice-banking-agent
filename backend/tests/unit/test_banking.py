"""Unit tests for banking service functions — pure logic, no API calls."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

import pytest

from voice_agent.services import banking


class TestGetAccountBalance:
    def test_returns_all_accounts_by_default(self):
        result = banking.get_account_balance()
        assert "accounts" in result
        assert len(result["accounts"]) == 2
        assert result["customer_name"] == "Hazem Taha"

    def test_returns_specific_account(self):
        result = banking.get_account_balance("acc-001")
        assert result["account"]["account_id"] == "acc-001"
        assert result["account"]["balance"] == 12450.75

    def test_unknown_account_raises(self):
        with pytest.raises(Exception):
            banking.get_account_balance("acc-invalid")


class TestGetRecentTransactions:
    def test_returns_up_to_limit(self):
        result = banking.get_recent_transactions(limit=3)
        assert len(result["transactions"]) == 3

    def test_filter_by_account(self):
        result = banking.get_recent_transactions(limit=5, account_id="acc-001")
        for txn in result["transactions"]:
            assert txn["account_id"] == "acc-001"


class TestGetCardStatus:
    def test_returns_default_card(self):
        result = banking.get_card_status()
        assert result["card"]["card_id"] == "card-001"
        assert result["card"]["status"] == "active"
        assert result["card"]["last_four"] == "4521"

    def test_returns_specific_card(self):
        result = banking.get_card_status("card-001")
        assert result["card"]["card_id"] == "card-001"

    def test_unknown_card_raises(self):
        with pytest.raises(Exception):
            banking.get_card_status("card-invalid")


class TestUpdateCardStatus:
    def test_block_card(self):
        result = banking.update_card_status(action="block")
        assert result["card"]["status"] == "blocked"
        assert "حظر" in result["message_ar"]

    def test_unblock_card(self):
        result = banking.update_card_status(action="unblock")
        assert result["card"]["status"] == "active"

    def test_report_lost(self):
        result = banking.update_card_status(action="report_lost", reason="lost my wallet")
        assert result["card"]["status"] == "blocked"


class TestFileDispute:
    def test_valid_dispute(self):
        result = banking.file_dispute(
            transaction_id="tx-001",
            reason="unauthorized",
            contact_method="sms",
        )
        assert result["dispute"]["transaction_id"] == "tx-001"
        assert result["dispute"]["reason"] == "unauthorized"
        assert "تم" in result["message"]

    def test_invalid_transaction_id(self):
        with pytest.raises(Exception):
            banking.file_dispute(
                transaction_id="tx-invalid",
                reason="duplicate",
                contact_method="email",
            )


class TestToolExecution:
    def test_execute_valid_tool(self):
        result = banking.execute_tool("get_account_balance", {})
        assert "accounts" in result

    def test_execute_with_args(self):
        result = banking.execute_tool("get_recent_transactions", {"limit": 3})
        assert len(result["transactions"]) == 3

    def test_unknown_tool_raises(self):
        with pytest.raises(Exception):
            banking.execute_tool("unknown_tool", {})