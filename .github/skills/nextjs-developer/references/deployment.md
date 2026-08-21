# Deployment

## Vercel Deployment

### Basic Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

### vercel.json Configuration

```json
{
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1", "sfo1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```

### Environment Variables

```bash
# Set environment variables
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_API_URL production

# Pull environment variables locally
vercel env pull .env.local
```

### Preview Deployments

Every push to a branch creates a preview deployment:
- Automatic: Push to any branch
- Manual: `vercel` (preview) vs `vercel --prod` (production)
- Share preview URLs with team for review

## Self-Hosting

### Node.js Server

```bash
# Build
npm run build

# Start production server
npm run start

# Or with PM2
pm2 start npm --name "nextjs-app" -- start
pm2 save
pm2 startup
```

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

```json
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Docker
}

module.exports = nextConfig
```

```bash
# Build and run
docker build -t nextjs-app .
docker run -p 3000:3000 nextjs-app
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
      - NODE_ENV=production
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres-data:
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/nextjs
server {
  listen 80;
  server_name example.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Performance Optimization

### next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compiler
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.example.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@mui/material', 'lodash'],
    typedRoutes: true,
  },

  // Headers for caching
  async headers() {
    return [
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/old-page',
        destination: '/new-page',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
```

### Bundle Analysis

```bash
# Install @next/bundle-analyzer
npm install --save-dev @next/bundle-analyzer

# Analyze bundle
ANALYZE=true npm run build
```

```js
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // Your Next.js config
})
```

### Image Optimization

```tsx
import Image from 'next/image'

// Remote image
<Image
  src="https://cdn.example.com/image.jpg"
  alt="Description"
  width={800}
  height={600}
  priority // Load immediately (above the fold)
/>

// Local image
<Image
  src="/hero.jpg"
  alt="Hero"
  fill
  style={{ objectFit: 'cover' }}
/>

// With placeholder
<Image
  src="/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

### Font Optimization

```tsx
// app/layout.tsx
import { Inter, Roboto_Mono } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

## Monitoring

### Vercel Analytics

```tsx
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Speed Insights

```tsx
// app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
```

### Custom Monitoring

```tsx
// app/api/monitoring/route.ts
export async function GET() {
  const metrics = {
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    // Add custom metrics
  }

  // Send to monitoring service
  await fetch('https://monitoring.example.com/metrics', {
    method: 'POST',
    body: JSON.stringify(metrics),
  })

  return Response.json({ status: 'ok' })
}
```

## CI/CD

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm run build

      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Environment Configuration

### Production Checklist

```bash
# 1. Set environment variables
NEXT_PUBLIC_API_URL=https://api.example.com
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://example.com

# 2. Run build
npm run build

# 3. Check for errors
npm run lint
npm run type-check

# 4. Test
npm run test

# 5. Deploy
vercel --prod
```

### Edge Runtime

```tsx
// app/api/edge/route.ts
export const runtime = 'edge'

export async function GET() {
  return Response.json({ message: 'Running on Edge Runtime' })
}
```

```json
// next.config.js
module.exports = {
  experimental: {
    runtime: 'edge',
  },
}
```

## Best Practices

### DO

- Use `output: 'standalone'` for Docker deployments
- Enable image optimization (AVIF/WebP)
- Set proper cache headers for static assets
- Use Vercel Preview Deployments for PR reviews
- Monitor with Vercel Analytics and Speed Insights
- Run `next build` locally before deploying

### DON'T

- Deploy without running `next build`
- Ignore bundle size warnings
- Use `img` tags instead of `next/image`
- Forget to set `NEXT_PUBLIC_*` prefix for client-side env vars
- Skip Lighthouse/PageSpeed checks
