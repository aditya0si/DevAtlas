"""WebSocket connection manager for real-time updates."""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self) -> None:
        """Initialize the connection manager."""
        # Map of user_id -> set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}
        # Map of repository_id -> set of user_ids subscribed
        self._repository_subscriptions: dict[str, set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        """Remove a WebSocket connection."""
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
        # Clean up repository subscriptions
        for repo_id in list(self._repository_subscriptions.keys()):
            self._repository_subscriptions[repo_id].discard(user_id)
            if not self._repository_subscriptions[repo_id]:
                del self._repository_subscriptions[repo_id]

    async def send_personal_message(self, message: dict[str, Any], user_id: str) -> None:
        """Send a message to a specific user."""
        if user_id not in self._connections:
            return
        message_json = json.dumps(message)
        disconnected = set()
        for websocket in self._connections[user_id]:
            try:
                await websocket.send_text(message_json)
            except Exception:
                disconnected.add(websocket)
        # Clean up disconnected sockets
        for ws in disconnected:
            self._connections[user_id].discard(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast a message to all connected clients."""
        message_json = json.dumps(message)
        for user_id, connections in list(self._connections.items()):
            for websocket in connections:
                try:
                    await websocket.send_text(message_json)
                except Exception:
                    pass

    async def broadcast_to_repository(
        self, repository_id: str, message: dict[str, Any]
    ) -> None:
        """Broadcast a message to all users subscribed to a repository."""
        if repository_id not in self._repository_subscriptions:
            return
        message_json = json.dumps(message)
        for user_id in self._repository_subscriptions[repository_id]:
            if user_id in self._connections:
                for websocket in self._connections[user_id]:
                    try:
                        await websocket.send_text(message_json)
                    except Exception:
                        pass

    def subscribe_to_repository(self, user_id: str, repository_id: str) -> None:
        """Subscribe a user to repository updates."""
        if repository_id not in self._repository_subscriptions:
            self._repository_subscriptions[repository_id] = set()
        self._repository_subscriptions[repository_id].add(user_id)

    def unsubscribe_from_repository(self, user_id: str, repository_id: str) -> None:
        """Unsubscribe a user from repository updates."""
        if repository_id in self._repository_subscriptions:
            self._repository_subscriptions[repository_id].discard(user_id)

    @property
    def active_connections(self) -> int:
        """Get the count of active connections."""
        return sum(len(conns) for conns in self._connections.values())

    @property
    def connected_users(self) -> int:
        """Get the count of connected users."""
        return len(self._connections)


# Global connection manager instance
manager = ConnectionManager()


class WebSocketMessage:
    """WebSocket message types."""

    # Message types
    TYPE_SYNC_STARTED = "sync_started"
    TYPE_SYNC_COMPLETED = "sync_completed"
    TYPE_SYNC_FAILED = "sync_failed"
    TYPE_REPOSITORY_UPDATED = "repository_updated"
    TYPE_EVENT_INGESTED = "event_ingested"
    TYPE_CLASSIFICATION_COMPLETED = "classification_completed"
    TYPE_ERROR = "error"

    # Factory methods
    @classmethod
    def sync_started(cls, repository_id: str, full_name: str) -> dict[str, Any]:
        """Create a sync started message."""
        return {
            "type": cls.TYPE_SYNC_STARTED,
            "repository_id": repository_id,
            "full_name": full_name,
        }

    @classmethod
    def sync_completed(
        cls, repository_id: str, full_name: str, stats: dict[str, int]
    ) -> dict[str, Any]:
        """Create a sync completed message."""
        return {
            "type": cls.TYPE_SYNC_COMPLETED,
            "repository_id": repository_id,
            "full_name": full_name,
            "stats": stats,
        }

    @classmethod
    def sync_failed(cls, repository_id: str, full_name: str, error: str) -> dict[str, Any]:
        """Create a sync failed message."""
        return {
            "type": cls.TYPE_SYNC_FAILED,
            "repository_id": repository_id,
            "full_name": full_name,
            "error": error,
        }

    @classmethod
    def repository_updated(cls, repository_id: str, full_name: str) -> dict[str, Any]:
        """Create a repository updated message."""
        return {
            "type": cls.TYPE_REPOSITORY_UPDATED,
            "repository_id": repository_id,
            "full_name": full_name,
        }

    @classmethod
    def event_ingested(cls, repository_id: str, event_type: str, count: int) -> dict[str, Any]:
        """Create an event ingested message."""
        return {
            "type": cls.TYPE_EVENT_INGESTED,
            "repository_id": repository_id,
            "event_type": event_type,
            "count": count,
        }

    @classmethod
    def classification_completed(
        cls, repository_id: str, full_name: str, classification: dict[str, Any]
    ) -> dict[str, Any]:
        """Create a classification completed message."""
        return {
            "type": cls.TYPE_CLASSIFICATION_COMPLETED,
            "repository_id": repository_id,
            "full_name": full_name,
            "classification": classification,
        }

    @classmethod
    def error(cls, message: str) -> dict[str, Any]:
        """Create an error message."""
        return {
            "type": cls.TYPE_ERROR,
            "message": message,
        }
