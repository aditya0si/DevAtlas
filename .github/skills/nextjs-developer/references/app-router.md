# App Router

## File-based Routing Structure

```
app/
├── layout.tsx          # Root layout (required)
├── page.tsx            # Home page (/)
├── loading.tsx         # Root loading UI
├── error.tsx           # Root error boundary
├── not-found.tsx       # Custom 404
├── global-error.tsx    # Global error boundary
├── template.tsx        # Re-rendered layout (no state preserved)
├── providers.tsx       # Client providers (theme, auth, etc.)
│
├── (marketing)/        # Route group (no URL segment)
│   ├── layout.tsx      # Marketing layout
│   ├── about/
│   │   └── page.tsx    # /about
│   └── blog/
│       ├── page.tsx    # /blog
│       └── [slug]/
│           └── page.tsx # /blog/my-post
│
├── (shop)/             # Separate route group
│   ├── layout.tsx      # Shop layout (cart sidebar, etc.)
│   ├── products/
│   │   ├── page.tsx    # /products
│   │   └── [id]/
│   │       └── page.tsx # /products/123
│   └── cart/
│       └── page.tsx    # /cart
│
├── api/                # Route handlers (API routes)
│   └── hello/
│       └── route.ts    # /api/hello
│
└── dashboard/          # Protected routes
    ├── layout.tsx      # Dashboard layout (sidebar, nav)
    ├── page.tsx        # /dashboard
    └── settings/
        └── page.tsx    # /dashboard/settings
```

## Route Conventions

### File Naming

| File | Purpose |
|------|---------|
| `page.tsx` | Page component (makes route public) |
| `layout.tsx` | Shared UI wrapper (preserves state) |
| `loading.tsx` | Loading UI (instant fallback) |
| `error.tsx` | Error boundary (catches errors) |
| `not-found.tsx` | Custom 404 page |
| `global-error.tsx` | Global error boundary |
| `template.tsx` | Re-rendered layout (no state) |
| `route.ts` | API endpoint |

### Route Groups

```
app/
├── (marketing)/about/page.tsx    # URL: /about
├── (shop)/products/page.tsx      # URL: /products
```

- Parentheses create route groups (no URL segment)
- Share layouts across routes
- Organize code without affecting URL structure

## Layouts

### Root Layout (Required)

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'My App',
  description: 'App description',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}
```

### Nested Layouts

```tsx
// app/dashboard/layout.tsx
import { Sidebar } from '@/components/sidebar'
import { Navbar } from '@/components/navbar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        {children}
      </div>
    </div>
  )
}
```

### Template vs Layout

```tsx
// app/template.tsx - Re-renders on every navigation (no state preserved)
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="template">{children}</div>
}

// app/layout.tsx - Preserves state across navigations
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="layout">{children}</div>
}
```

## Loading and Error Boundaries

### Loading UI

```tsx
// app/products/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
```

### Error Boundary

```tsx
// app/products/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Global Error

```tsx
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

## Dynamic Routes

### Basic Dynamic Route

```tsx
// app/products/[id]/page.tsx
interface PageProps {
  params: { id: string }
}

export default async function ProductPage({ params }: PageProps) {
  const product = await getProduct(params.id)
  return <div>{product.name}</div>
}
```

### Catch-all Segments

```tsx
// app/docs/[...slug]/page.tsx
// Matches: /docs, /docs/a, /docs/a/b, /docs/a/b/c
interface PageProps {
  params: { slug?: string[] }
}

export default function DocsPage({ params }: PageProps) {
  return <div>Slug: {params.slug?.join('/')}</div>
}
```

### Optional Catch-all

```tsx
// app/shop/[[...slug]]/page.tsx
// Matches: /shop, /shop/a, /shop/a/b
```

## Parallel Routes

```tsx
// app/dashboard/page.tsx
export default function DashboardPage({
  children,
  team,
  analytics,
}: {
  children: React.ReactNode
  team: React.ReactNode
  analytics: React.ReactNode
}) {
  return (
    <>
      {children}
      {team}
      {analytics}
    </>
  )
}

// app/dashboard/@team/page.tsx
export default function TeamPage() {
  return <div>Team content</div>
}

// app/dashboard/@analytics/page.tsx
export default function AnalyticsPage() {
  return <div>Analytics content</div>
}
```

## Intercepting Routes

```
app/
├── @modal/
│   └── (.)photos/[id]/page.tsx  # Intercepts /photos/[id]
├── photos/
│   └── [id]/page.tsx            # Full page
└── layout.tsx
```

```tsx
// app/@modal/(.)photos/[id]/page.tsx
// Shows modal when navigating from /photos
// Shows full page when refreshing /photos/123
```

## Middleware

```tsx
// middleware.ts (root level)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Auth check
  const token = request.cookies.get('token')
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirects
  if (request.nextUrl.pathname === '/old-page') {
    return NextResponse.redirect(new URL('/new-page', request.url))
  }

  // Headers
  const response = NextResponse.next()
  response.headers.set('x-custom-header', 'value')

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

## Route Handlers (API Routes)

```tsx
// app/api/hello/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Hello' })
}

export async function POST(request: Request) {
  const body = await request.json()
  return NextResponse.json({ received: body }, { status: 201 })
}

// Dynamic route
// app/api/users/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser(params.id)
  return NextResponse.json(user)
}
```

## Metadata API

### Static Metadata

```tsx
// app/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Home',
  description: 'Home page description',
}
```

### Dynamic Metadata

```tsx
// app/products/[id]/page.tsx
export async function generateMetadata({
  params,
}: {
  params: { id: string }
}): Promise<Metadata> {
  const product = await getProduct(params.id)
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      images: [product.imageUrl],
    },
  }
}
```

### Metadata Files

```
app/
├── opengraph-image.tsx   # Generate OG image
├── twitter-image.tsx     # Generate Twitter image
├── icon.tsx              # Favicon
└── apple-icon.tsx        # Apple touch icon
```

```tsx
// app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const alt = 'My App'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        My App
      </div>
    ),
    { ...size }
  )
}
```

## Navigation

### Link Component

```tsx
import Link from 'next/link'

// Basic link
<Link href="/about">About</Link>

// With prefetch control
<Link href="/dashboard" prefetch={false}>
  Dashboard
</Link>

// Dynamic route
<Link href={`/products/${product.id}`}>View</Link>
```

### useRouter (Client-side)

```tsx
'use client'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <button onClick={() => router.push('/dashboard')}>
      Go to Dashboard
    </button>
  )
}
```

### Programmatic Navigation (Server)

```tsx
import { redirect } from 'next/navigation'

export default async function Page() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
}
```

## Search Params

```tsx
// app/search/page.tsx
interface PageProps {
  searchParams: { q?: string; page?: string }
}

export default function SearchPage({ searchParams }: PageProps) {
  const query = searchParams.q || ''
  const page = parseInt(searchParams.page || '1')
  return <div>Search: {query}, Page: {page}</div>
}
```

## Best Practices

### DO

- Use route groups to organize code without affecting URLs
- Add `loading.tsx` and `error.tsx` to all async segments
- Use parallel routes for simultaneous data fetching
- Use intercepting routes for modals
- Keep layouts as shallow as possible (avoid deep nesting)
- Use `template.tsx` for routes that need re-rendering

### DON'T

- Nest layouts more than 3 levels deep
- Use `pages/` directory alongside `app/`
- Fetch data in layouts unless absolutely necessary
- Use client components for data fetching
- Hardcode URLs (use `Link` or `redirect`)
