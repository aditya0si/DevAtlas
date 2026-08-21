@echo off
REM DevAtlas Deployment Script for Windows

echo === DevAtlas Deployment Script ===
echo This script deploys DevAtlas to a Kubernetes cluster
echo.

REM Check prerequisites
where kubectl >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo kubectl is required but not installed. Aborting.
    exit /b 1
)

REM Create namespace
echo Creating namespace...
kubectl create namespace devatlas --dry-run=client -o yaml | kubectl apply -f -

REM Create secrets
echo Creating secrets...
kubectl create secret generic devatlas-secrets ^
  --from-literal=database-url="%DATABASE_URL%" ^
  --from-literal=github-token="%GITHUB_TOKEN%" ^
  --from-literal=openai-api-key="%OPENAI_API_KEY%" ^
  --from-literal=jwt-secret-key="%JWT_SECRET_KEY%" ^
  --namespace=devatlas ^
  --dry-run=client -o yaml | kubectl apply -f -

REM Deploy PostgreSQL
echo Deploying PostgreSQL...
kubectl apply -f kubernetes\postgres-deployment.yaml --namespace=devatlas

REM Deploy Redis
echo Deploying Redis...
kubectl apply -f kubernetes\redis-deployment.yaml --namespace=devatlas

REM Wait for databases
echo Waiting for databases to be ready...
kubectl wait --for=condition=available deployment/devatlas-postgres --namespace=devatlas --timeout=120s
kubectl wait --for=condition=available deployment/devatlas-redis --namespace=devatlas --timeout=120s

REM Deploy backend
echo Deploying backend...
kubectl apply -f kubernetes\backend-deployment.yaml --namespace=devatlas

REM Deploy worker
echo Deploying worker...
kubectl apply -f kubernetes\worker-deployment.yaml --namespace=devatlas

REM Deploy frontend
echo Deploying frontend...
kubectl apply -f kubernetes\frontend-deployment.yaml --namespace=devatlas

REM Deploy nginx ingress
echo Deploying nginx ingress...
kubectl apply -f kubernetes\ingress.yaml --namespace=devatlas

REM Wait for deployments
echo Waiting for all deployments to be ready...
kubectl wait --for=condition=available deployment/devatlas-backend --namespace=devatlas --timeout=300s
kubectl wait --for=condition=available deployment/devatlas-worker --namespace=devatlas --timeout=300s
kubectl wait --for=condition=available deployment/devatlas-frontend --namespace=devatlas --timeout=300s

REM Show status
echo.
echo === Deployment Status ===
kubectl get pods --namespace=devatlas
kubectl get services --namespace=devatlas

echo.
echo === Deployment Complete ===
echo Access the application at: https://devatlas.io
echo API available at: https://api.devatlas.io