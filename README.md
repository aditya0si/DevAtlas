# DevAtlas

AI-powered Developer Ecosystem Intelligence Platform.

## Overview

DevAtlas analyzes public GitHub activity to visualize developer ecosystems through interactive maps, AI-driven repository classification, geospatial analytics, and trend analysis.

## Architecture

- Backend: FastAPI + SQLAlchemy + PostgreSQL/PostGIS
- Frontend: Next.js 14 + MapLibre + Tailwind
- Data ingestion: GitHub Events API + incremental sync
- AI: OpenAI embeddings + classification

## Getting Started

1. Copy `.env.example` files in `backend/` and `frontend/` and fill in secrets.
2. Start dependencies: `docker compose up -d db redis`
3. Install backend dependencies: `pip install -r backend/requirements.txt`
4. Run backend: `uvicorn app.main:app --reload` from `backend/`
5. Install frontend dependencies: `npm install` from `frontend/`
6. Run frontend: `npm run dev` from `frontend/`

## Documentation

See `docs/` for architecture notes and operational runbooks.
