"""WebSocket endpoints for real-time updates."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from app.api.websocket import WebSocketMessage, manager
from app.models.user import User

router = APIRouter(prefix="/ws", tags=["websocket"])


class SubscribeMessage(BaseModel):
    """Message to subscribe to repository updates."""

    action: str
    repository_id: str | None = None


async def get_user_from_token(websocket: WebSocket) -> User | None:
    """Extract user from WebSocket query params (token)."""
    # This would need proper JWT extraction from query params
    # For now, we'll use a simple approach
    token = websocket.query_params.get("token")
    if not token:
        return None
    # In production, decode the token and get the user
    # For now, return a placeholder
    return None


@router.websocket("/connect")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    # Get token from query params
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # In production, validate the token and get user_id
    # For now, use a guest user_id
    user_id = str(uuid4())

    await manager.connect(websocket, user_id)
    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id,
        })

        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "subscribe" and data.get("repository_id"):
                manager.subscribe_to_repository(user_id, data["repository_id"])
                await websocket.send_json({
                    "type": "subscribed",
                    "repository_id": data["repository_id"],
                })

            elif action == "unsubscribe" and data.get("repository_id"):
                manager.unsubscribe_from_repository(user_id, data["repository_id"])
                await websocket.send_json({
                    "type": "unsubscribed",
                    "repository_id": data["repository_id"],
                })

            elif action == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


@router.websocket("/sync/{repository_id}")
async def sync_websocket_endpoint(websocket: WebSocket, repository_id: str):
    """Dedicated WebSocket endpoint for sync progress of a specific repository."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = str(uuid4())
    await manager.connect(websocket, user_id)
    manager.subscribe_to_repository(user_id, repository_id)

    try:
        await websocket.send_json({
            "type": "connected",
            "repository_id": repository_id,
        })

        while True:
            data = await websocket.receive_json()
            if data.get("action") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        manager.unsubscribe_from_repository(user_id, repository_id)


# Helper functions to broadcast from other parts of the application
async def notify_sync_started(repository_id: str, full_name: str) -> None:
    """Notify clients that a sync has started."""
    message = WebSocketMessage.sync_started(repository_id, full_name)
    await manager.broadcast_to_repository(repository_id, message)


async def notify_sync_completed(
    repository_id: str, full_name: str, stats: dict[str, int]
) -> None:
    """Notify clients that a sync has completed."""
    message = WebSocketMessage.sync_completed(repository_id, full_name, stats)
    await manager.broadcast_to_repository(repository_id, message)


async def notify_sync_failed(
    repository_id: str, full_name: str, error: str
) -> None:
    """Notify clients that a sync has failed."""
    message = WebSocketMessage.sync_failed(repository_id, full_name, error)
    await manager.broadcast_to_repository(repository_id, message)


async def notify_repository_updated(repository_id: str, full_name: str) -> None:
    """Notify clients that a repository has been updated."""
    message = WebSocketMessage.repository_updated(repository_id, full_name)
    await manager.broadcast_to_repository(repository_id, message)


async def notify_classification_completed(
    repository_id: str, full_name: str, classification: dict
) -> None:
    """Notify clients that classification has completed."""
    message = WebSocketMessage.classification_completed(
        repository_id, full_name, classification
    )
    await manager.broadcast_to_repository(repository_id, message)
