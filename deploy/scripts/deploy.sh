#!/bin/bash
set -e

echo "=== DevAtlas Deployment Script ==="
echo "This script deploys DevAtlas to a Kubernetes cluster"
echo ""

# Check prerequisites
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed. Aborting."; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "helm is required but not installed. Aborting."; exit 1; }

# Get cluster credentials (adjust for your cluster)
echo "Checking cluster connectivity..."
kubectl cluster-info

# Create namespace
echo "Creating namespace..."
kubectl create namespace devatlas --dry-run=client -o yaml | kubectl apply -f -

# Create secrets (you'll need to update these)
echo "Creating secrets..."
kubectl create secret generic devatlas-secrets \
  --from-literal=database-url="$DATABASE_URL" \
  --from-literal=github-token="$GITHUB_TOKEN" \
  --from-literal=openai-api-key="$OPENAI_API_KEY" \
  --from-literal=jwt-secret-key="$JWT_SECRET_KEY" \
  --namespace=devatlas \
  --dry-run=client -o yaml | kubectl apply -f -

# Deploy PostgreSQL
echo "Deploying PostgreSQL..."
kubectl apply -f kubernetes/postgres-deployment.yaml --namespace=devatlas

# Deploy Redis
echo "Deploying Redis..."
kubectl apply -f kubernetes/redis-deployment.yaml --namespace=devatlas

# Wait for databases
echo "Waiting for databases to be ready..."
kubectl wait --for=condition=available deployment/devatlas-postgres --namespace=devatlas --timeout=120s
kubectl wait --for=condition=available deployment/devatlas-redis --namespace=devatlas --timeout=120s

# Deploy backend
echo "Deploying backend..."
kubectl apply -f kubernetes/backend-deployment.yaml --namespace=devatlas

# Deploy worker
echo "Deploying worker..."
kubectl apply -f kubernetes/worker-deployment.yaml --namespace=devatlas

# Deploy frontend
echo "Deploying frontend..."
kubectl apply -f kubernetes/frontend-deployment.yaml --namespace=devatlas

# Deploy nginx ingress
echo "Deploying nginx ingress..."
kubectl apply -f kubernetes/ingress.yaml --namespace=devatlas

# Wait for deployments
echo "Waiting for all deployments to be ready..."
kubectl wait --for=condition=available deployment/devatlas-backend --namespace=devatlas --timeout=300s
kubectl wait --for=condition=available deployment/devatlas-worker --namespace=devatlas --timeout=300s
kubectl wait --for=condition=available deployment/devatlas-frontend --namespace=devatlas --timeout=300s

# Show status
echo ""
echo "=== Deployment Status ==="
kubectl get pods --namespace=devatlas
kubectl get services --namespace=devatlas

echo ""
echo "=== Deployment Complete ==="
echo "Access the application at: https://devatlas.io"
echo "API available at: https://api.devatlas.io"