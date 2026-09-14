"""Sprint 11: DevAtlas Activity Intelligence Engine

Add PushEvent enrichment, aggregation tables, activity scores, ecosystem scores, data quality metrics.

Revision ID: sprint11_activity_intelligence
Revises: 0005_pgvector_hnsw
Create Date: 2026-07-24 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'sprint11_activity_intelligence'
down_revision: Union[str, None] = '0005_pgvector_hnsw'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add github_user_id to github_users
    op.add_column('github_users', sa.Column('github_user_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_github_users_github_user_id'), 'github_users', ['github_user_id'], unique=False)

    # 2. Add enrichment fields to github_events
    op.add_column('github_events', sa.Column('state', sa.String(length=255), nullable=True))
    op.add_column('github_events', sa.Column('city', sa.String(length=255), nullable=True))
    op.add_column('github_events', sa.Column('domain', sa.String(length=100), nullable=True))
    op.add_column('github_events', sa.Column('language', sa.String(length=100), nullable=True))
    op.add_column(
        'github_events',
        sa.Column('enrichment_status', sa.String(length=20), nullable=False, server_default='pending'),
    )
    op.add_column('github_events', sa.Column('enriched_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_github_events_state'), 'github_events', ['state'], unique=False)
    op.create_index(op.f('ix_github_events_city'), 'github_events', ['city'], unique=False)
    op.create_index(op.f('ix_github_events_domain'), 'github_events', ['domain'], unique=False)
    op.create_index(op.f('ix_github_events_language'), 'github_events', ['language'], unique=False)
    op.create_index(op.f('ix_github_events_enrichment_status'), 'github_events', ['enrichment_status'], unique=False)

    # 3. Create daily_aggregations table
    op.create_table('daily_aggregations',
        sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
        sa.Column('aggregation_date', sa.Date(), nullable=False),
        sa.Column('dimension', sa.String(length=50), nullable=False),
        sa.Column('dimension_key', sa.String(length=255), nullable=False),
        sa.Column('dimension_value', sa.String(length=255), nullable=True),
        sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('aggregation_date', 'dimension', 'dimension_key', name='uq_daily_agg_date_dim_key'),
    )
    op.create_index('ix_daily_agg_date_dim', 'daily_aggregations', ['aggregation_date', 'dimension'], unique=False)
    op.create_index(
        op.f('ix_daily_aggregations_aggregation_date'),
        'daily_aggregations',
        ['aggregation_date'],
        unique=False,
    )

    # 4. Create hourly_aggregations table
    op.create_table('hourly_aggregations',
        sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
        sa.Column('aggregation_hour', sa.DateTime(timezone=True), nullable=False),
        sa.Column('dimension', sa.String(length=50), nullable=False),
        sa.Column('dimension_key', sa.String(length=255), nullable=False),
        sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('aggregation_hour', 'dimension', 'dimension_key', name='uq_hourly_agg_hour_dim_key'),
    )
    op.create_index('ix_hourly_agg_hour_dim', 'hourly_aggregations', ['aggregation_hour', 'dimension'], unique=False)
    op.create_index(
        op.f('ix_hourly_aggregations_aggregation_hour'),
        'hourly_aggregations',
        ['aggregation_hour'],
        unique=False,
    )

    # 5. Create activity_scores table
    op.create_table('activity_scores',
        sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_key', sa.String(length=255), nullable=False),
        sa.Column('entity_name', sa.String(length=255), nullable=True),
        sa.Column('push_activity', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('developer_presence', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('repository_diversity', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('activity_score', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entity_type', 'entity_key', 'period_start', 'period_end', name='uq_activity_score'),
    )
    op.create_index(
        'ix_activity_scores_entity_period',
        'activity_scores',
        ['entity_type', 'period_start', 'period_end'],
        unique=False,
    )
    op.create_index(op.f('ix_activity_scores_entity_type'), 'activity_scores', ['entity_type'], unique=False)
    op.create_index(op.f('ix_activity_scores_activity_score'), 'activity_scores', ['activity_score'], unique=False)

    # 6. Create ecosystem_scores table
    op.create_table('ecosystem_scores',
        sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_key', sa.String(length=255), nullable=False),
        sa.Column('entity_name', sa.String(length=255), nullable=True),
        sa.Column('developer_activity_score', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('developer_count', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('technology_diversity', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('domain_diversity', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('growth_rate', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('ecosystem_score', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('rank', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entity_type', 'entity_key', 'period_start', 'period_end', name='uq_ecosystem_score'),
    )
    op.create_index(
        'ix_ecosystem_scores_entity_period',
        'ecosystem_scores',
        ['entity_type', 'period_start', 'period_end'],
        unique=False,
    )
    op.create_index(op.f('ix_ecosystem_scores_entity_type'), 'ecosystem_scores', ['entity_type'], unique=False)
    op.create_index(op.f('ix_ecosystem_scores_ecosystem_score'), 'ecosystem_scores', ['ecosystem_score'], unique=False)

    # 7. Create data_quality_metrics table
    op.create_table('data_quality_metrics',
        sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
        sa.Column('metric_name', sa.String(length=100), nullable=False),
        sa.Column('metric_value', sa.FLOAT(), nullable=False, server_default='0'),
        sa.Column('metric_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dq_metrics_name_recorded', 'data_quality_metrics', ['metric_name', 'recorded_at'], unique=False)
    op.create_index(op.f('ix_data_quality_metrics_metric_name'), 'data_quality_metrics', ['metric_name'], unique=False)
    op.create_index(op.f('ix_data_quality_metrics_recorded_at'), 'data_quality_metrics', ['recorded_at'], unique=False)


def downgrade() -> None:
    # 7. Drop data_quality_metrics
    op.drop_index(op.f('ix_data_quality_metrics_recorded_at'), table_name='data_quality_metrics')
    op.drop_index(op.f('ix_data_quality_metrics_metric_name'), table_name='data_quality_metrics')
    op.drop_index('ix_dq_metrics_name_recorded', table_name='data_quality_metrics')
    op.drop_table('data_quality_metrics')

    # 6. Drop ecosystem_scores
    op.drop_index(op.f('ix_ecosystem_scores_ecosystem_score'), table_name='ecosystem_scores')
    op.drop_index(op.f('ix_ecosystem_scores_entity_type'), table_name='ecosystem_scores')
    op.drop_index('ix_ecosystem_scores_entity_period', table_name='ecosystem_scores')
    op.drop_table('ecosystem_scores')

    # 5. Drop activity_scores
    op.drop_index(op.f('ix_activity_scores_activity_score'), table_name='activity_scores')
    op.drop_index(op.f('ix_activity_scores_entity_type'), table_name='activity_scores')
    op.drop_index('ix_activity_scores_entity_period', table_name='activity_scores')
    op.drop_table('activity_scores')

    # 4. Drop hourly_aggregations
    op.drop_index(op.f('ix_hourly_aggregations_aggregation_hour'), table_name='hourly_aggregations')
    op.drop_index('ix_hourly_agg_hour_dim', table_name='hourly_aggregations')
    op.drop_table('hourly_aggregations')

    # 3. Drop daily_aggregations
    op.drop_index(op.f('ix_daily_aggregations_aggregation_date'), table_name='daily_aggregations')
    op.drop_index('ix_daily_agg_date_dim', table_name='daily_aggregations')
    op.drop_table('daily_aggregations')

    # 2. Remove github_events enrichment columns
    op.drop_index(op.f('ix_github_events_enrichment_status'), table_name='github_events')
    op.drop_index(op.f('ix_github_events_language'), table_name='github_events')
    op.drop_index(op.f('ix_github_events_domain'), table_name='github_events')
    op.drop_index(op.f('ix_github_events_city'), table_name='github_events')
    op.drop_index(op.f('ix_github_events_state'), table_name='github_events')
    op.drop_column('github_events', 'enriched_at')
    op.drop_column('github_events', 'enrichment_status')
    op.drop_column('github_events', 'language')
    op.drop_column('github_events', 'domain')
    op.drop_column('github_events', 'city')
    op.drop_column('github_events', 'state')

    # 1. Remove github_user_id from github_users
    op.drop_index(op.f('ix_github_users_github_user_id'), table_name='github_users')
    op.drop_column('github_users', 'github_user_id')
