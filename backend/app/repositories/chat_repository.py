from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import ChatSession, ChatMessage


class ChatRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_session(self, user_id: Optional[str] = None, title: Optional[str] = None) -> ChatSession:
        session = ChatSession(user_id=user_id, title=title)
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def get_session(self, session_id: str) -> Optional[ChatSession]:
        result = await self.db.execute(
            select(ChatSession)
            .where(ChatSession.id == session_id)
            .options(selectinload(ChatSession.messages))
        )
        return result.scalar_one_or_none()

    async def get_user_sessions(self, user_id: str, limit: int = 20) -> list[ChatSession]:
        result = await self.db.execute(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def add_message(self, session_id: str, role: str, content: str) -> ChatMessage:
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        message = ChatMessage(session_id=session_id, role=role, content=content)
        session.updated_at = datetime.now(timezone.utc)
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)
        return message

    async def update_title(self, session_id: str, title: str) -> None:
        session = await self.get_session(session_id)
        if session:
            session.title = title
            await self.db.flush()

    async def delete_session(self, session_id: str) -> bool:
        session = await self.get_session(session_id)
        if session:
            await self.db.delete(session)
            await self.db.flush()
            return True
        return False
