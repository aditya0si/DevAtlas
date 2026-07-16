# DevAtlas Architecture

## System Overview

DevAtlas is composed of three primary subsystems:

1. Ingestion pipeline
2. Intelligence layer
3. Presentation layer

## Backend

- `app/api` exposes REST endpoints.
- `app/services` contains business logic.
- `app/repositories` encapsulates data access.
- `app/models` defines SQLAlchemy ORM models.
- `app/schemas` defines Pydantic contracts.

## Frontend

- `app` contains Next.js App Router pages.
- `components` contains reusable UI and map components.
- `lib` contains API clients and utilities.

## Data Model

- `repositories` stores normalized repository metadata.
- `github_events` stores event stream data.
- `users` stores application users.
