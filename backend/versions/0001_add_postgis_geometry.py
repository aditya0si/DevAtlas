"""add postgis geometry

Revision ID: 0001_add_postgis_geometry
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa

from alembic import op

revision: str = "0001_add_postgis_geometry"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("repositories", sa.Column("geom", geoalchemy2.Geometry(geometry_type="POINT", srid=4326), nullable=True))
    op.create_index("ix_repositories_geom", "repositories", ["geom"], unique=False, postgresql_using="gist")


def downgrade() -> None:
    op.drop_index("ix_repositories_geom", table_name="repositories", postgresql_using="gist")
    op.drop_column("repositories", "geom")
