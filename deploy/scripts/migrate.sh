#!/bin/bash
set -e

echo "=== DevAtlas Database Migration Script ==="

# Wait for database to be ready
echo "Waiting for database..."
until PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "devatlas" -c '\q' 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

# Run migrations
echo "Running Alembic migrations..."
alembic upgrade head

echo "=== Migration Complete ==="