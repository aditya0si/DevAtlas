# CDN Invalidation Automation

This directory contains workflows and scripts for automating CloudFront cache invalidation during deployments.

## Overview

- **Static Assets**: Cached for 1 year (immutable), invalidated only on version changes
- **API Responses**: Not cached by CDN (Cache-Control: no-store)
- **SSR Pages**: Cached for 5 minutes at CDN, invalidated on content updates
- **Invalidation Triggers**: Deployment, content update, emergency purge

## CloudFront Invalidation Strategy

### Cache Key Configuration

```json
{
  "CachePolicyConfig": {
    "Name": "devatlas-cache-policy",
    "ParametersInCacheKeyAndForwardedToOrigin": {
      "HeadersConfig": {
        "HeaderBehavior": "none"
      },
      "QueryStringsConfig": {
        "QueryStringBehavior": "all"
      },
      "CookiesConfig": {
        "CookieBehavior": "none"
      }
    },
    "DefaultTTL": 300,
    "MaxTTL": 31536000,
    "MinTTL": 0
  }
}
```

### Invalidation Paths

| Path Pattern | TTL | Invalidation Trigger |
|-------------|-----|---------------------|
| `/static/js/*` | 31536000 | Versioned filenames, no invalidation needed |
| `/static/css/*` | 31536000 | Versioned filenames, no invalidation needed |
| `/api/*` | 0 | Never cached |
| `/_next/static/*` | 86400 | On deployment |
| `/_next/data/*` | 300 | On content update |
| `/` | 300 | On content update |

## GitHub Actions Workflow

### Automatic Invalidation on Deploy

```yaml
# .github/workflows/cdn-invalidate.yml
name: CDN Invalidation

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      paths:
        description: 'Paths to invalidate (comma-separated)'
        required: false
        default: ''
      reason:
        description: 'Reason for invalidation'
        required: false
        default: 'Manual purge'

jobs:
  invalidate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Invalidate CloudFront
        run: |
          # Get distribution ID
          DISTRIBUTION_ID=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?Comment=='DevAtlas'] | [0].Id" \
            --output text)
          
          # Default paths to invalidate
          PATHS='["/*"]'
          
          # Use custom paths if provided
          if [ -n "${{ github.event.inputs.paths }}" ]; then
            PATHS='["${{ github.event.inputs.paths }}"]'
          fi
          
          # Create invalidation
          aws cloudfront create-invalidation \
            --distribution-id $DISTRIBUTION_ID \
            --paths $PATHS \
            -- CallerReference ${{ github.sha }}-${{ github.run_id }}
          
          echo "Invalidation created for paths: $PATHS"
```

### Selective Invalidation Based on Changes

```yaml
# .github/workflows/deploy-with-invalidation.yml
name: Deploy and Invalidate

on:
  push:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      invalidate_static: ${{ steps.changes.outputs.static }}
      invalidate_api: ${{ steps.changes.outputs.api }}
      invalidate_all: ${{ steps.changes.outputs.all }}
    steps:
      - uses: actions/checkout@v4

      - id: changes
        uses: dorny/paths-filter@v2
        with:
          filters: |
            static:
              - 'frontend/**'
              - 'public/**'
            api:
              - 'backend/app/api/**'
            docs:
              - 'docs/**'

  deploy-frontend:
    needs: detect-changes
    if: needs.detect-changes.outputs.invalidate_static == 'true'
    steps:
      - name: Deploy to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}

      - name: Invalidate Vercel Edge
        run: |
          # Vercel automatically invalidates on deploy
          # For manual invalidation:
          curl -X DELETE "https://api.vercel.com/v1/cache?path=/" \
            -H "Authorization: Bearer ${{ secrets.VERCEL_TOKEN }}"

  invalidate-cdn:
    needs: [deploy-frontend]
    if: needs.detect-changes.outputs.invalidate_all == 'true'
    steps:
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*" \
            --caller-reference ${{ github.sha }}
```

## Manual Invalidation Script

```bash
#!/bin/bash
# deploy/scripts/invalidate-cdn.sh

set -e

DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID}"
PATHS="${1:-/*}"
REASON="${2:-Manual purge}"

if [ -z "$DISTRIBUTION_ID" ]; then
  echo "Error: CLOUDFRONT_DISTRIBUTION_ID not set"
  exit 1
fi

echo "Creating CloudFront invalidation..."
echo "  Distribution: $DISTRIBUTION_ID"
echo "  Paths: $PATHS"
echo "  Reason: $REASON"

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "$PATHS" \
  --caller-reference "$(date +%s)-$RANDOM" \
  --query 'Invalidation.Id' \
  --output text)

echo "Invalidation created: $INVALIDATION_ID"

# Wait for completion
echo "Waiting for invalidation to complete..."
aws cloudfront wait invalidation-completed \
  --distribution-id "$DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"

echo "Invalidation completed successfully"
```

## Emergency Purge

For critical security updates or data corrections:

```bash
# Immediate full cache purge
./deploy/scripts/invalidate-cdn.sh "/*" "Emergency: Security update"

# Selective purge for specific paths
./deploy/scripts/invalidate-cdn.sh "/api/*" "API endpoint update"
./deploy/scripts/invalidate-cdn.sh "/_next/data/*" "Content update"

# Purge specific static assets
./deploy/scripts/invalidate-cdn.sh "/static/js/main.js,/static/css/styles.css" "Asset update"
```

## Vercel Configuration

```json
// frontend/vercel.json
{
  "headers": [
    {
      "source": "/static/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-CDN-Cache-Status",
          "value": "{{ cdn }}"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/api/v1/(.*)",
      "destination": "https://api.devatlas.com/api/v1/$1"
    },
    {
      "source": "/api/v2/(.*)",
      "destination": "https://api.devatlas.com/api/v2/$1"
    }
  ]
}
```

## Monitoring Invalidation Status

```bash
# Check invalidation status
aws cloudfront get-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --id $INVALIDATION_ID

# List recent invalidations
aws cloudfront list-invalidations \
  --distribution-id $DISTRIBUTION_ID \
  --query 'InvalidationList.Items[*].[Id,Status,CreateTime]' \
  --output table
```

## Cost Optimization

- **Batch invalidations**: Create one invalidation with multiple paths
- **Avoid `/*`**: Only use full invalidation for emergencies
- **Use versioning**: Immutable assets with versioned filenames avoid invalidation
- **Set appropriate TTLs**: Don't cache longer than necessary

## Related Documentation

- [CloudFront Configuration](../cdn/cloudfront-config.json)
- [Vercel Edge Configuration](../frontend/vercel.json)
- [Deployment Scripts](../scripts/deploy.sh)