# DevAtlas Production Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Kubernetes cluster (optional, for K8s deployment)
- kubectl (for K8s deployment)
- Helm (for K8s deployment)
- Domain name configured with DNS

## Quick Start with Docker Compose

1. Clone the repository
2. Copy environment configuration:
   ```bash
   cp deploy/.env.production.example .env
   ```

3. Update `.env` with your production values

4. Start the stack:
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

5. Run migrations:
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

## Kubernetes Deployment

### Prerequisites
- Kubernetes 1.24+
- kubectl configured with cluster access
- Helm 3+

### Steps

1. Create secrets:
   ```bash
   export DATABASE_URL="postgresql+asyncpg://user:pass@postgres:5432/devatlas"
   export GITHUB_TOKEN="ghp_xxx"
   export OPENAI_API_KEY="sk-xxx"
   export JWT_SECRET_KEY="your-secret-key"
   
   ./deploy/scripts/deploy.sh
   ```

2. Verify deployment:
   ```bash
   kubectl get pods -n devatlas
   kubectl get services -n devatlas
   ```

3. Access the application:
   - Frontend: https://devatlas.io
   - API: https://api.devatlas.io
   - Grafana: http://localhost:3001 (local) or https://grafana.devatlas.io
   - Prometheus: http://localhost:9090 (local) or https://prometheus.devatlas.io

## Monitoring Setup

The monitoring stack is included in docker-compose:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Alertmanager: http://localhost:9093

## Database Migrations

Run migrations before starting the application:
```bash
# Docker Compose
docker-compose exec backend alembic upgrade head

# Kubernetes
kubectl exec -it deployment/devatlas-backend -n devatlas -- alembic upgrade head
```

## Health Checks

- Backend health: `GET /api/health`
- Readiness: `GET /api/health/ready`
- Liveness: `GET /api/health/live`

## Troubleshooting

### Backend won't start
1. Check logs: `docker-compose logs backend`
2. Verify database connection
3. Run migrations: `docker-compose exec backend alembic upgrade head`

### Worker not processing jobs
1. Check Redis connection: `docker-compose logs worker`
2. Verify Redis is running: `docker-compose ps redis`
3. Check job queue in Redis

### Frontend 502 errors
1. Check backend is running: `docker-compose ps backend`
2. Check nginx logs: `docker-compose logs nginx`
3. Verify CORS settings

## Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT_SECRET_KEY (32+ characters)
- [ ] Configure TLS certificates
- [ ] Enable rate limiting
- [ ] Set up monitoring alerts
- [ ] Configure firewall rules
- [ ] Enable database SSL connections
- [ ] Use secrets management (Kubernetes secrets, Vault, etc.)