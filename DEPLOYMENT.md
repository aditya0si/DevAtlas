# DevAtlas Deployment Guide

## Architecture

```
Browser ──→ Vercel (Frontend, Next.js)
                │
                ├── /api/v1/* ──→ Vercel rewrite ──→ Railway (Backend, FastAPI)
                │
                └── /(static) ──→ Vercel edge cache
```

- **Frontend**: Next.js 14 on Vercel (edge-optimized)
- **Backend**: FastAPI on Railway (Docker-based)
- **Database**: Supabase PostgreSQL 16 + PostGIS
- **Cache/Rate-Limit**: Upstash Redis
- **CI**: GitHub Actions (lint + test + build)

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- A Vercel account
- A Railway account
- A Supabase project (with PostGIS extension enabled)
- An Upstash Redis database

## Environment Variables

### Backend (set on Railway)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase/PostgreSQL connection string with asyncpg driver |
| `REDIS_URL` | No | Upstash Redis connection string (rate limiting disabled if unset) |
| `GITHUB_TOKEN` | Yes | GitHub personal access token (public_repo scope) |
| `OPENAI_API_KEY` | One of | OpenAI API key for embeddings |
| `GEMINI_API_KEY` | One of | Gemini API key (alternative to OpenAI) |
| `JWT_SECRET_KEY` | Yes | Random 32+ char string for JWT signing |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins (include Vercel URL) |
| `ENVIRONMENT` | No | Set to `production` |
| `EMBEDDING_MODEL` | No | Default: `text-embedding-3-small` |
| `EMBEDDING_DIMENSIONS` | No | Default: `1536` |

### Frontend (set on Vercel)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Leave empty to use Vercel proxy (`/api/v1`) |

## Deployment Steps

### 1. Supabase Setup

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

### 2. Backend (Railway)

1. Connect your GitHub repo to Railway
2. Set the root directory to `backend` (or use `railway.json` at repo root)
3. Add all backend environment variables
4. Deploy — Railway auto-detects the Dockerfile

### 3. Frontend (Vercel)

1. Import your GitHub repo to Vercel
2. Framework preset: Next.js
3. Root directory: `frontend`
4. Set `NEXT_PUBLIC_API_URL` to `/api/v1` (or leave empty)
5. The root `vercel.json` handles API rewrites to the backend service

### 4. Database Migrations

Run Alembic migrations manually after the backend is deployed:

```bash
# Install deps and run
cd backend
pip install -r requirements.txt
alembic upgrade head
```

Or execute from Railway via a one-off job / CLI:

```bash
railway run alembic upgrade head
```

### 5. Rate Limiting

Rate limiting requires Redis. If `REDIS_URL` is not set, the middleware disables itself and requests pass through unrestricted.

## CI/CD

The `.github/workflows/ci.yml` runs on every push/PR to `main`:

- **Backend**: Ruff linting + pytest (with PostGIS service container)
- **Frontend**: ESLint + Next.js build

## Health Check

The backend exposes `/api/v1/health` returning:

```json
{
  "status": "healthy",
  "service": "DevAtlas API",
  "version": "0.1.0",
  "database": "healthy",
  "redis": "healthy"
}
```

Railway uses this for container health checks.

## Troubleshooting

- **Backend crashes on startup**: Check `DATABASE_URL` and `REDIS_URL` are reachable from Railway.
- **API returns 404**: Verify Vercel rewrites and `api/index.py` exist.
- **CORS errors**: Ensure `CORS_ORIGINS` includes the exact Vercel deployment URL.
- **AI features fail**: Verify `OPENAI_API_KEY` or `GEMINI_API_KEY` is set.
- **No geospatial data**: Ensure PostGIS extension is enabled on Supabase.
