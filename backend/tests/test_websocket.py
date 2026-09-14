"""Tests for WebSocket functionality."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.api.websocket import ConnectionManager, WebSocketMessage


class TestConnectionManager:
    """Test ConnectionManager."""

    @pytest.fixture
    def manager(self):
        """Create a fresh ConnectionManager."""
        return ConnectionManager()

    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        ws = AsyncMock()
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        ws.close = AsyncMock()
        return ws

    @pytest.mark.asyncio
    async def test_connect_accepts_websocket(self, manager, mock_websocket):
        """Should accept and register a WebSocket connection."""
        await manager.connect(mock_websocket, "user-123")

        mock_websocket.accept.assert_called_once()
        assert "user-123" in manager._connections
        assert mock_websocket in manager._connections["user-123"]

    @pytest.mark.asyncio
    async def test_disconnect_removes_connection(self, manager, mock_websocket):
        """Should remove a WebSocket connection on disconnect."""
        await manager.connect(mock_websocket, "user-123")
        manager.disconnect(mock_websocket, "user-123")

        assert "user-123" not in manager._connections

    @pytest.mark.asyncio
    async def test_send_personal_message(self, manager, mock_websocket):
        """Should send a message to a specific user."""
        await manager.connect(mock_websocket, "user-123")

        message = {"type": "test", "data": "hello"}
        await manager.send_personal_message(message, "user-123")

        mock_websocket.send_text.assert_called_once()
        call_args = mock_websocket.send_text.call_args[0][0]
        assert '"type": "test"' in call_args

    @pytest.mark.asyncio
    async def test_send_personal_message_user_not_connected(self, manager, mock_websocket):
        """Should not fail when sending to non-existent user."""
        message = {"type": "test"}
        # Should not raise
        await manager.send_personal_message(message, "nonexistent-user")

    @pytest.mark.asyncio
    async def test_broadcast(self, manager, mock_websocket):
        """Should broadcast message to all connections."""
        ws1 = AsyncMock()
        ws1.accept = AsyncMock()
        ws1.send_text = AsyncMock()

        ws2 = AsyncMock()
        ws2.accept = AsyncMock()
        ws2.send_text = AsyncMock()

        await manager.connect(ws1, "user-1")
        await manager.connect(ws2, "user-2")

        message = {"type": "broadcast", "data": "hello all"}
        await manager.broadcast(message)

        ws1.send_text.assert_called_once()
        ws2.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_subscribe_to_repository(self, manager):
        """Should subscribe user to repository updates."""
        manager.subscribe_to_repository("user-123", "repo-456")

        assert "repo-456" in manager._repository_subscriptions
        assert "user-123" in manager._repository_subscriptions["repo-456"]

    @pytest.mark.asyncio
    async def test_unsubscribe_from_repository(self, manager):
        """Should unsubscribe user from repository updates."""
        manager.subscribe_to_repository("user-123", "repo-456")
        manager.unsubscribe_from_repository("user-123", "repo-456")

        assert "repo-456" in manager._repository_subscriptions
        assert "user-123" not in manager._repository_subscriptions["repo-456"]

    @pytest.mark.asyncio
    async def test_broadcast_to_repository(self, manager, mock_websocket):
        """Should broadcast message to repository subscribers."""
        await manager.connect(mock_websocket, "user-123")
        manager.subscribe_to_repository("user-123", "repo-456")

        message = {"type": "repo_update", "repository_id": "repo-456"}
        await manager.broadcast_to_repository("repo-456", message)

        mock_websocket.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_broadcast_to_repository_no_subscribers(self, manager):
        """Should not fail when broadcasting to repository with no subscribers."""
        message = {"type": "test"}
        await manager.broadcast_to_repository("nonexistent-repo", message)

    def test_active_connections_count(self, manager):
        """Should return correct count of active connections."""
        assert manager.active_connections == 0

    def test_connected_users_count(self, manager):
        """Should return correct count of connected users."""
        assert manager.connected_users == 0


class TestWebSocketMessage:
    """Test WebSocketMessage factory methods."""

    def test_sync_started_message(self):
        """Should create sync_started message."""
        msg = WebSocketMessage.sync_started("repo-123", "owner/repo")

        assert msg["type"] == "sync_started"
        assert msg["repository_id"] == "repo-123"
        assert msg["full_name"] == "owner/repo"

    def test_sync_completed_message(self):
        """Should create sync_completed message."""
        stats = {"events": 10, "repositories": 1}
        msg = WebSocketMessage.sync_completed("repo-123", "owner/repo", stats)

        assert msg["type"] == "sync_completed"
        assert msg["stats"] == stats

    def test_sync_failed_message(self):
        """Should create sync_failed message."""
        msg = WebSocketMessage.sync_failed("repo-123", "owner/repo", "Rate limit exceeded")

        assert msg["type"] == "sync_failed"
        assert msg["error"] == "Rate limit exceeded"

    def test_repository_updated_message(self):
        """Should create repository_updated message."""
        msg = WebSocketMessage.repository_updated("repo-123", "owner/repo")

        assert msg["type"] == "repository_updated"

    def test_event_ingested_message(self):
        """Should create event_ingested message."""
        msg = WebSocketMessage.event_ingested("repo-123", "PushEvent", 5)

        assert msg["type"] == "event_ingested"
        assert msg["event_type"] == "PushEvent"
        assert msg["count"] == 5

    def test_classification_completed_message(self):
        """Should create classification_completed message."""
        classification = {"category": "machine-learning", "confidence": 0.95}
        msg = WebSocketMessage.classification_completed("repo-123", "owner/repo", classification)

        assert msg["type"] == "classification_completed"
        assert msg["classification"] == classification

    def test_error_message(self):
        """Should create error message."""
        msg = WebSocketMessage.error("Something went wrong")

        assert msg["type"] == "error"
        assert msg["message"] == "Something went wrong"


class TestWebSocketMessageTypes:
    """Test WebSocket message type constants."""

    def test_message_types_exist(self):
        """Should have all expected message types."""
        assert WebSocketMessage.TYPE_SYNC_STARTED == "sync_started"
        assert WebSocketMessage.TYPE_SYNC_COMPLETED == "sync_completed"
        assert WebSocketMessage.TYPE_SYNC_FAILED == "sync_failed"
        assert WebSocketMessage.TYPE_REPOSITORY_UPDATED == "repository_updated"
        assert WebSocketMessage.TYPE_EVENT_INGESTED == "event_ingested"
        assert WebSocketMessage.TYPE_CLASSIFICATION_COMPLETED == "classification_completed"
        assert WebSocketMessage.TYPE_ERROR == "error"
