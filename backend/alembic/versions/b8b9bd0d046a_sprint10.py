"""sprint10

Revision ID: b8b9bd0d046a
Revises: 0004_location_intelligence
Create Date: 2026-07-16 11:11:37.729947
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b8b9bd0d046a'
down_revision: Union[str, None] = '0004_location_intelligence'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('analytics_snapshots',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('snapshot_date', sa.Date(), nullable=False),
    sa.Column('snapshot_type', sa.String(length=50), nullable=False),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('snapshot_date', 'snapshot_type', name='uq_snapshot_date_type')
    )
    op.create_index('ix_analytics_snapshots_date_type', 'analytics_snapshots', ['snapshot_date', 'snapshot_type'], unique=False)
    
    op.create_table('sync_state',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('sync_type', sa.String(length=50), nullable=False),
    sa.Column('last_github_id', sa.Integer(), nullable=False),
    sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_etag', sa.String(length=255), nullable=True),
    sa.Column('total_processed', sa.Integer(), nullable=False),
    sa.Column('total_skipped', sa.Integer(), nullable=False),
    sa.Column('total_errors', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('state_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_state_sync_type'), 'sync_state', ['sync_type'], unique=False)
    
    op.create_table('worker_runs',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('worker_name', sa.String(length=100), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('items_processed', sa.Integer(), nullable=False),
    sa.Column('items_failed', sa.Integer(), nullable=False),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('duration_seconds', sa.FLOAT(), nullable=True),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_worker_runs_name_status', 'worker_runs', ['worker_name', 'status'], unique=False)
    
    op.add_column('github_users', sa.Column('followers', sa.Integer(), nullable=True))
    op.add_column('github_users', sa.Column('following', sa.Integer(), nullable=True))
    op.add_column('github_users', sa.Column('organizations', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('github_users', sa.Column('avatar_url', sa.String(length=255), nullable=True))
    op.add_column('github_users', sa.Column('html_url', sa.String(length=255), nullable=True))
    op.add_column('github_users', sa.Column('twitter_username', sa.String(length=255), nullable=True))
    op.add_column('github_users', sa.Column('hireable', sa.Boolean(), nullable=True))
    op.add_column('github_users', sa.Column('enrichment_status', sa.String(length=20), nullable=True))
    op.add_column('github_users', sa.Column('enrichment_error', sa.Text(), nullable=True))
    op.add_column('github_users', sa.Column('enriched_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_github_users_country', 'github_users', ['country'], unique=False)
    op.create_index(op.f('ix_github_users_enrichment_status'), 'github_users', ['enrichment_status'], unique=False)
    
    op.add_column('repositories', sa.Column('license', sa.String(length=50), nullable=True))
    op.add_column('repositories', sa.Column('has_wiki', sa.Boolean(), nullable=True))
    op.add_column('repositories', sa.Column('archived', sa.Boolean(), nullable=True))
    op.add_column('repositories', sa.Column('size', sa.Integer(), nullable=True))
    op.add_column('repositories', sa.Column('subscribers_count', sa.Integer(), nullable=True))
    op.add_column('repositories', sa.Column('has_pages', sa.Boolean(), nullable=True))
    op.add_column('repositories', sa.Column('homepage', sa.String(length=255), nullable=True))
    op.create_index('ix_repositories_classification_updated_at', 'repositories', ['classification_updated_at'], unique=False)
    op.create_index('ix_repositories_stargazers_count', 'repositories', ['stargazers_count'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_repositories_stargazers_count', table_name='repositories')
    op.drop_index('ix_repositories_classification_updated_at', table_name='repositories')
    op.drop_column('repositories', 'homepage')
    op.drop_column('repositories', 'has_pages')
    op.drop_column('repositories', 'subscribers_count')
    op.drop_column('repositories', 'size')
    op.drop_column('repositories', 'archived')
    op.drop_column('repositories', 'has_wiki')
    op.drop_column('repositories', 'license')
    
    op.drop_index(op.f('ix_github_users_enrichment_status'), table_name='github_users')
    op.drop_index('ix_github_users_country', table_name='github_users')
    op.drop_column('github_users', 'enriched_at')
    op.drop_column('github_users', 'enrichment_error')
    op.drop_column('github_users', 'enrichment_status')
    op.drop_column('github_users', 'hireable')
    op.drop_column('github_users', 'twitter_username')
    op.drop_column('github_users', 'html_url')
    op.drop_column('github_users', 'avatar_url')
    op.drop_column('github_users', 'organizations')
    op.drop_column('github_users', 'following')
    op.drop_column('github_users', 'followers')
    
    op.drop_index('ix_worker_runs_name_status', table_name='worker_runs')
    op.drop_table('worker_runs')
    
    op.drop_index(op.f('ix_sync_state_sync_type'), table_name='sync_state')
    op.drop_table('sync_state')
    
    op.drop_index('ix_analytics_snapshots_date_type', table_name='analytics_snapshots')
    op.drop_table('analytics_snapshots')
