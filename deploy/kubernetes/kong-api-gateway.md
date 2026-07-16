# API Gateway Configuration (Kong)

This directory contains the Kong API Gateway configuration for DevAtlas, providing rate limiting, authentication, and routing.

## Overview

- **Gateway**: Kong Gateway 3.6+ (Enterprise or OSS)
- **Deployment**: Kubernetes with Ingress controller
- **Features**: Rate limiting, JWT authentication, request transformation, logging

## Architecture

```
Internet
    │
    ▼
┌─────────────────┐
│  Kong Gateway   │ ──── Rate Limiting (sliding window)
│  (K8s Ingress)  │ ──── JWT Authentication
│                 │ ──── Request/Response Transformation
│                 │ ──── CORS Handling
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Backend     Vercel
(API v1/v2) (Frontend)
```

## Kong Ingress Configuration

```yaml
# deploy/kubernetes/kong-gateway.yaml
apiVersion: configuration.konghq.com/v1
kind: KongIngress
metadata:
  name: devatlas-api
  annotations:
    kubernetes.io/ingress.class: kong
proxy.googleapis.com/load-balance: "round-robin"
```

## Services and Routes

### Backend API Service

```yaml
# Kong configuration for backend API
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit-backend
  namespace: devatlas
plugin: rate-limiting
config:
  minute: 100          # 100 requests per minute per consumer
  hour: 1000            # 1000 requests per hour per consumer
  policy: sliding
  hide_client_headers: false
---
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: jwt-auth-backend
  namespace: devatlas
plugin: jwt
config:
  uri_param_names:
    - jwt
  cookie_names: []
  header_names:
    - Authorization
  claims_to_verify:
    - exp
    - iat
  maximum_expiration: 3600
---
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: cors-backend
  namespace: devatlas
plugin: cors
config:
  origins:
    - "https://devatlas.com"
    - "https://www.devatlas.com"
    - "http://localhost:3000"
  methods:
    - GET
    - POST
    - PUT
    - DELETE
    - PATCH
    - OPTIONS
  headers:
    - Authorization
    - Content-Type
    - X-Request-ID
    - X-Correlation-ID
  exposed_headers:
    - X-RateLimit-Limit
    - X-RateLimit-Remaining
    - X-RateLimit-Reset
  credentials: true
  max_age: 3600
  preflight_continue: false
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devatlas-api
  namespace: devatlas
  annotations:
    kubernetes.io/ingress.class: kong
    konghq.com/plugins: rate-limit-backend,jwt-auth-backend,cors-backend
    konghq.com/strip-path: "true"
spec:
  rules:
    - host: api.devatlas.com
      http:
        paths:
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: devatlas-backend
                port:
                  number: 8000
          - path: /api/v2
            pathType: Prefix
            backend:
              service:
                name: devatlas-backend
                port:
                  number: 8000
```

## Rate Limiting Tiers

### Consumer Groups

```yaml
# kong-consumers.yaml
apiVersion: configuration.konghq.com/v1
kind: KongConsumer
metadata:
  name: free-tier
  namespace: devatlas
  annotations:
    konghq.com/plugins: rate-limit-free
username: free-tier
credentials:
  - name: free-tier-jwt
---
apiVersion: configuration.konghq.com/v1
kind: KongConsumer
metadata:
  name: pro-tier
  namespace: devatlas
  annotations:
    konghq.com/plugins: rate-limit-pro
username: pro-tier
credentials:
  - name: pro-tier-jwt
---
apiVersion: configuration.konghq.com/v1
kind: KongConsumer
metadata:
  name: enterprise-tier
  namespace: devatlas
  annotations:
    konghq.com/plugins: rate-limit-enterprise
username: enterprise-tier
credentials:
  - name: enterprise-tier-jwt
```

### Rate Limit Plugins

```yaml
# kong-rate-limits.yaml
# Free tier: 100 req/min, 1000 req/hour
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit-free
  namespace: devatlas
plugin: rate-limiting
config:
  minute: 100
  hour: 1000
  policy: sliding
  fault_tolerant: true
  sync_rate: 10
  hide_client_headers: false
---
# Pro tier: 1000 req/min, 10000 req/hour
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit-pro
  namespace: devatlas
plugin: rate-limiting
config:
  minute: 1000
  hour: 10000
  policy: sliding
  fault_tolerant: true
  sync_rate: 10
  hide_client_headers: false
---
# Enterprise tier: 10000 req/min, 100000 req/hour
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit-enterprise
  namespace: devatlas
plugin: rate-limiting
config:
  minute: 10000
  hour: 100000
  policy: sliding
  fault_tolerant: true
  sync_rate: 10
  hide_client_headers: false
```

## JWT Authentication

### JWT Plugin Configuration

```yaml
# kong-jwt.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: jwt-verify
  namespace: devatlas
plugin: jwt
config:
  run_on_preflight: true
  is_asymmetric: false
  jwks_uri_parameter_name: jwks_uri
  claims_to_verify:
    - exp
  maximum_expiration: 86400  # 24 hours
```

### JWT Credential (example)

```yaml
# kong-jwt-credential.yaml
apiVersion: configuration.konghq.com/v1
kind: KongCredential
metadata:
  name: free-tier-jwt
  namespace: devatlas
consumerRef: free-tier
type: jwt
jwt:
  rsa_public_key: |
    -----BEGIN PUBLIC KEY-----
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
    -----END PUBLIC KEY-----
  algorithm: RS256
  key: free-tier@devatlas.com
  tags:
    - free
    - tier
```

## Request/Response Transformation

### Request Transformer

```yaml
# kong-request-transformer.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: transform-request
  namespace: devatlas
plugin: request-transformer
config:
  add:
    headers:
      - X-Kong-Upstream-Latency: $(latency.request)
      - X-Kong-Proxy-Latency: $(latency.proxy)
  remove:
    headers:
      - X-Internal-Token
  replace:
    headers:
      - X-Request-ID
  rename:
    headers:
      from: X-Forwarded-User
      to: X-User-ID
```

### Response Transformer

```yaml
# kong-response-transformer.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: transform-response
  namespace: devatlas
plugin: response-transformer
config:
  add:
    headers:
      - X-API-Version: v2
      - X-RateLimit-Policy: $(headers.RateLimit-Limit)
  remove:
    headers:
      - Server
      - X-Powered-By
```

## Logging and Monitoring

### Access Log Configuration

```yaml
# kong-logging.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: access-log
  namespace: devatlas
plugin: http-log
config:
  http_endpoint: https://logs.devatlas.com/kong
  method: POST
  content_type: application/json
  timeout: 10
  keepalive: 10
  flush_limit: 100
  queue_size: 1000
```

### Prometheus Metrics

```yaml
# kong-metrics.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: prometheus-metrics
  namespace: devatlas
plugin: prometheus
config:
  per_consumer: true
  latency: true
  bandwidth: true
  upstream_health: true
```

## Circuit Breaker

```yaml
# kong-circuit-breaker.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: circuit-breaker
  namespace: devatlas
plugin: circuit-breaker
config:
  fault_status_codes:
    - 500
    - 502
    - 503
  fault_threshold: 50      # 50% error rate triggers
  recovery_threshold: 10   # 10 successful requests to close
  half_time: 30            # 30s to half the failure count
```

## IP Restriction

```yaml
# kong-ip-restriction.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: ip-restriction
  namespace: devatlas
plugin: ip-restriction
config:
  allow:
    - 10.0.0.0/8
    - 172.16.0.0/12
    - 192.168.0.0/16
  deny: []
```

## WebSocket Support

```yaml
# kong-websocket.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devatlas-websocket
  namespace: devatlas
  annotations:
    kubernetes.io/ingress.class: kong
    konghq.com/plugins: websocket-handler
spec:
  rules:
    - host: api.devatlas.com
      http:
        paths:
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: devatlas-backend
                port:
                  number: 8000
---
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: websocket-handler
  namespace: devatlas
plugin: websocket-handler
```

## Keycloak/OIDC Integration

For enterprise SSO:

```yaml
# kong-oidc.yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: oidc-auth
  namespace: devatlas
plugin: openid-connect
config:
  issuer: https://keycloak.devatlas.com/realms/devatlas
  client_id: kong-gateway
  client_secret: $(KEYCLOAK_CLIENT_SECRET)
  scopes:
    - openid
    - profile
    - email
  response_type: code
  token_endpoint_auth_method: client_secret_post
  token_exchange_endpoint: true
  session_secret: $(SESSION_SECRET)
  allowed_redirect_uris:
    - https://api.devatlas.com/oauth2/callback
```

## Deploy Kong Gateway

```bash
# Add Kong repo
helm repo add kong https://charts.konghq.com
helm repo update

# Install Kong with PostgreSQL
helm install kong kong/kong \
  --namespace kong \
  --create-namespace \
  --set ingressController.enabled=true \
  --set env.database.postgres.host=postgres-primary.devatlas.svc.cluster.local \
  --set env.database.postgres.port=5432 \
  --set env.database.postgres.user=kong \
  --set env.database.postgres.password=$(kubectl get secret kong-db -o jsonpath='{.data.password}' | base64 -d) \
  --set env.database.postgres.database=kong \
  --set env.proxy.type=LoadBalancer \
  --set env.ssl.protocol=https \
  --values deploy/kubernetes/kong-values.yaml

# Apply configurations
kubectl apply -f deploy/kubernetes/kong-consumers.yaml
kubectl apply -f deploy/kubernetes/kong-rate-limits.yaml
kubectl apply -f deploy/kubernetes/kong-jwt.yaml
```

## Health Check

```bash
# Check Kong status
kubectl exec -n kong deploy/kong -c kong -- kong health

# Check connectivity
kubectl exec -n kong deploy/kong -c kong -- curl -s http://localhost:8001/status

# Test rate limiting
for i in {1..5}; do
  curl -I https://api.devatlas.com/api/v1/health
done
# Should see X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
```

## Troubleshooting

```bash
# View Kong logs
kubectl logs -n kong -l app=kong -c kong

# View Ingress controller logs
kubectl logs -n kong -l app=kong -c ingress-controller

# Test configuration
kubectl exec -n kong deploy/kong -c kong -- kong config parse /usr/local/kong/kong.conf

# Debug plugin issues
kubectl describe KongPlugin rate-limit-backend -n devatlas
```

## Related Documentation

- [Kong Documentation](https://docs.konghq.com/gateway/latest/)
- [Kong Ingress Controller](https://docs.konghq.com/kubernetes-ingress-controller/latest/)
- [Rate Limiting Plugin](https://docs.konghq.com/gateway/latest/reference/plugins/rate-limiting/)
- [JWT Plugin](https://docs.konghq.com/gateway/latest/reference/plugins/jwt/)