"""Add pgvector extension and HNSW vector index for repositories.

Revision ID: 0005_pgvector_hnsw
Revises: b8b9bd0d046a
Create Date: 2026-07-22 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0005_pgvector_hnsw'
down_revision: Union[str, None] = 'b8b9bd0d046a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # Alter embedding column to vector(1536)
    op.execute(
        "ALTER TABLE repositories ALTER COLUMN embedding TYPE vector(1536) USING embedding::text::vector(1536);"
    )

    # Create HNSW index for high performance cosine similarity search
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_repositories_embedding_hnsw "
        "ON repositories USING hnsw (embedding vector_cosine_ops);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_repositories_embedding_hnsw;")
    op.execute(
        "ALTER TABLE repositories ALTER COLUMN embedding TYPE jsonb USING embedding::text::jsonb;"
    )
