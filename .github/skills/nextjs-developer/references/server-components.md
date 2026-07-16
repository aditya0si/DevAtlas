# Server Components

## Server vs Client Components

### Server Components (Default)

```tsx
// app/page.tsx (no 'use client' directive)
async function Page() {
  // Can use async/await directly
  const data = await fetch('https://api.example.com/data')
  const json = await data.json()

  // Can access backend resources directly
  const dbData = await db.query('SELECT * FROM users')

  // Can keep secrets (API keys, DB credentials)
  const secret = process.env.DATABASE_URL

  return (
    <div>
      <h1>Data from server</h1>
      <pre>{JSON.stringify(json)}</pre>
    </div>
  )
}

export default Page
```

**Benefits:**
- Zero client-side JavaScript by default
- Direct backend access (databases, file system)
- Keep secrets secure (never sent to client)
- Automatic code splitting
- Better performance (smaller bundles)

### Client Components

```tsx
// app/components/counter.tsx
'use client' // Required for interactivity

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}
```

**When to use Client Components:**
- Event listeners (`onClick`, `onChange`, etc.)
- State (`useState`, `useReducer`)
- Effects (`useEffect`, `useLayoutEffect`)
- Browser APIs (`window`, `localStorage`, etc.)
- Custom hooks that use the above

## Component Composition Pattern

### Server Component Wrapping Client Component

```tsx
// app/page.tsx (Server Component)
import { ClientCounter } from './counter'

async function Page() {
  const initialCount = await getInitialCount()
  return <ClientCounter initialCount={initialCount} />
}

// app/counter.tsx (Client Component)
'use client'
import { useState } from 'react'

export function Counter({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount)
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>
}
```

### Passing Server Components as Children

```tsx
// app/page.tsx (Server Component)
import { ClientModal } from './modal'

async function Page() {
  const data = await fetchData()
  return (
    <ClientModal>
      <ServerContent data={data} />
    </ClientModal>
  )
}

function ServerContent({ data }: { data: Data }) {
  return <div>{data.title}</div>
}
```

## Streaming with Suspense

### Basic Streaming

```tsx
// app/page.tsx
import { Suspense } from 'react'

async function SlowComponent() {
  const data = await fetchSlowData() // Takes 3 seconds
  return <div>{data.content}</div>
}

export default function Page() {
  return (
    <div>
      <h1>Fast content</h1>
      <Suspense fallback={<p>Loading slow content...</p>}>
        <SlowComponent />
      </Suspense>
    </div>
  )
}
```

### Multiple Suspense Boundaries

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react'

async function RevenueChart() {
  const data = await fetchRevenue()
  return <Chart data={data} />
}

async function RecentOrders() {
  const orders = await fetchOrders()
  return <OrdersList orders={orders} />
}

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* These load independently */}
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>

      <Suspense fallback={<OrdersSkeleton />}>
        <RecentOrders />
      </Suspense>
    </div>
  )
}
```

### Streaming with Error Boundaries

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <div>
      <Suspense fallback={<RevenueSkeleton />}>
        <ErrorBoundary fallback={<RevenueError />}>
          <RevenueChart />
        </ErrorBoundary>
      </Suspense>
    </div>
  )
}
```

## Data Fetching Patterns

### Fetch with Caching

```tsx
// app/posts/page.tsx
async function Posts() {
  // Cache forever (static)
  const res = await fetch('https://api.example.com/posts', {
    cache: 'force-cache',
  })

  // No cache (dynamic)
  const res = await fetch('https://api.example.com/posts', {
    cache: 'no-store',
  })

  // Revalidate every 60 seconds (ISR)
  const res = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60 },
  })

  // Revalidate on-demand
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] },
  })

  const posts = await res.json()
  return <PostList posts={posts} />
}
```

### Parallel Data Fetching

```tsx
// app/dashboard/page.tsx
async function getStats() {
  const [users, orders, revenue] = await Promise.all([
    fetch('https://api.example.com/users').then(r => r.json()),
    fetch('https://api.example.com/orders').then(r => r.json()),
    fetch('https://api.example.com/revenue').then(r => r.json()),
  ])
  return { users, orders, revenue }
}

export default async function DashboardPage() {
  const stats = await getStats()
  return <Dashboard stats={stats} />
}
```

### Sequential Data Fetching

```tsx
// app/posts/[id]/page.tsx
async function getPost(id: string) {
  const res = await fetch(`https://api.example.com/posts/${id}`)
  return res.json()
}

async function getAuthor(authorId: string) {
  const res = await fetch(`https://api.example.com/authors/${authorId}`)
  return res.json()
}

export default async function PostPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id)
  const author = await getAuthor(post.authorId) // Depends on post

  return (
    <article>
      <h1>{post.title}</h1>
      <p>By {author.name}</p>
    </article>
  )
}
```

## Client Boundaries

### Pattern: Server Component + Client Component

```tsx
// app/page.tsx (Server Component)
import { ThemeProvider } from './theme-provider'
import { Header } from './header'
import { Counter } from './counter'

export default function Page() {
  return (
    <ThemeProvider>
      <Header /> {/* Server Component */}
      <Counter /> {/* Client Component */}
    </ThemeProvider>
  )
}
```

### Pattern: Client Component Wrapper

```tsx
// app/components/form-wrapper.tsx
'use client'
import { useState } from 'react'

export function FormWrapper({ children }: { children: React.ReactNode }) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form onSubmit={() => setIsSubmitting(true)}>
      {isSubmitting && <p>Submitting...</p>}
      {children}
    </form>
  )
}

// app/contact/page.tsx (Server Component)
import { FormWrapper } from '@/components/form-wrapper'

export default function ContactPage() {
  return (
    <FormWrapper>
      <input name="email" />
      <button type="submit">Submit</button>
    </FormWrapper>
  )
}
```

## Accessing Backend Resources

### Database Queries

```tsx
// app/posts/page.tsx
import { db } from '@/lib/db'

async function Posts() {
  // Direct database access (no API route needed)
  const posts = await db.post.findMany({
    include: { author: true },
    orderBy: { createdAt: 'desc' },
  })
  return <PostList posts={posts} />
}
```

### File System Access

```tsx
// app/posts/page.tsx
import { readFile } from 'fs/promises'
import path from 'path'

async function Posts() {
  const filePath = path.join(process.cwd(), 'data', 'posts.json')
  const fileContents = await readFile(filePath, 'utf8')
  const posts = JSON.parse(fileContents)
  return <PostList posts={posts} />
}
```

## Environment Variables

### Server vs Client

```tsx
// Server Component (can access all env vars)
const dbUrl = process.env.DATABASE_URL // ✅ OK
const apiKey = process.env.API_KEY // ✅ OK

// Client Component (only NEXT_PUBLIC_*)
'use client'
const publicKey = process.env.NEXT_PUBLIC_API_KEY // ✅ OK
const secret = process.env.SECRET_KEY // ❌ Undefined (not exposed)
```

## Best Practices

### DO

- Keep components Server Components by default
- Use `'use client'` only at the leaf boundary
- Pass Server Components as children to Client Components
- Use Suspense for streaming and loading states
- Fetch data in Server Components (not Client Components)
- Use parallel fetching when data is independent

### DON'T

- Add `'use client'` to the top of every file
- Fetch data in Client Components when Server Components work
- Use `useEffect` for data fetching in Client Components
- Pass large serialized props between Server and Client Components
- Access backend resources from Client Components
