"""location_intelligence

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-16 15:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = '0004_location_intelligence'
down_revision = '0003_add_email_verification'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create location_cache table
    op.create_table(
        'location_cache',
        sa.Column('normalized_location', sa.String(length=255), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('city', sa.String(length=255), nullable=True),
        sa.Column('state', sa.String(length=255), nullable=True),
        sa.Column('country', sa.String(length=255), nullable=True),
        sa.Column('timezone', sa.String(length=100), nullable=True),
        sa.Column('confidence_score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cached_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('normalized_location')
    )

    # 2. Create github_users table
    op.create_table(
        'github_users',
        sa.Column('login', sa.String(length=255), nullable=False),
        sa.Column('raw_location', sa.String(length=255), nullable=True),
        sa.Column('company', sa.String(length=255), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False, server_default='User'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('public_repos', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('normalized_location', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=255), nullable=True),
        sa.Column('state', sa.String(length=255), nullable=True),
        sa.Column('country', sa.String(length=255), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('confidence_score', sa.Integer(), nullable=True),
        sa.Column('location_source', sa.String(length=100), nullable=True),
        sa.Column('last_verified', sa.DateTime(timezone=True), nullable=True),
        sa.Column('geom', Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
        sa.PrimaryKeyConstraint('login')
    )
    
    op.create_index(op.f('ix_github_users_last_verified'), 'github_users', ['last_verified'], unique=False)
    op.create_index(op.f('ix_github_users_normalized_location'), 'github_users', ['normalized_location'], unique=False)
    op.create_index('idx_github_users_geom', 'github_users', ['geom'], unique=False, postgresql_using='gist')

    # 3. Add github_user_login to repositories
    op.add_column('repositories', sa.Column('github_user_login', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_repositories_github_user_login'), 'repositories', ['github_user_login'], unique=False)
    op.create_foreign_key('fk_repo_github_user', 'repositories', 'github_users', ['github_user_login'], ['login'], ondelete='SET NULL')


def downgrade() -> None:
    # 1. Remove github_user_login from repositories
    op.drop_constraint('fk_repo_github_user', 'repositories', type_='foreignkey')
    op.drop_index(op.f('ix_repositories_github_user_login'), table_name='repositories')
    op.drop_column('repositories', 'github_user_login')

    # 2. Drop github_users table
    op.drop_index('idx_github_users_geom', table_name='github_users', postgresql_using='gist')
    op.drop_index(op.f('ix_github_users_normalized_location'), table_name='github_users')
    op.drop_index(op.f('ix_github_users_last_verified'), table_name='github_users')
    op.drop_table('github_users')

    # 3. Drop location_cache table
    op.drop_table('location_cache')
