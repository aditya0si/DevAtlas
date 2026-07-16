# Data Fetching

## Fetch API in Next.js

Next.js extends the native `fetch` with caching and revalidation options.

### Cache Strategies

```tsx
// Force cache (static, cached forever)
const res = await fetch('https://api.example.com/data', {
  cache: 'force-cache',
})

// No cache (dynamic, fetches on every request)
const res = await fetch('https://api.example.com/data', {
  cache: 'no-store',
})

// Revalidate (ISR - Incremental Static Regeneration)
const res = await fetch('https://api.example.com/data', {
  next: { revalidate: 60 }, // Revalidate every 60 seconds
})

// Tag-based revalidation
const res = await fetch('https://api.example.com/data', {
  next: { tags: ['posts'] },
})
```

## Caching Strategies

### Static Data (Build Time)

```tsx
// app/posts/page.tsx
async function Posts() {
  // Cached at build time, reused for all requests
  const res = await fetch('https://api.example.com/posts', {
    cache: 'force-cache',
  })
  const posts = await res.json()
  return <PostList posts={posts} />
}
```

### Dynamic Data (Request Time)

```tsx
// app/profile/page.tsx
async function Profile() {
  // Fetched on every request
  const res = await fetch('https://api.example.com/profile', {
    cache: 'no-store',
  })
  const profile = await res.json()
  return <ProfileCard profile={profile} />
}
```

### Incremental Static Regeneration (ISR)

```tsx
// app/posts/page.tsx
async function Posts() {
  // Cached, revalidates every 60 seconds
  const res = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60 },
  })
  const posts = await res.json()
  return <PostList posts={posts} />
}
```

### On-Demand Revalidation

```tsx
// app/posts/page.tsx
async function Posts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] },
  })
  const posts = await res.json()
  return <PostList posts={posts} />
}

// app/actions.ts
'use server'
import { revalidateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get('title') as string } })
  revalidateTag('posts') // Revalidates all 'posts' tagged fetches
}
```

## Parallel Data Fetching

### Independent Requests

```tsx
// app/dashboard/page.tsx
async function getData() {
  // Fetch in parallel (faster)
  const [users, orders, revenue] = await Promise.all([
    fetch('https://api.example.com/users').then(r => r.json()),
    fetch('https://api.example.com/orders').then(r => r.json()),
    fetch('https://api.example.com/revenue').then(r => r.json()),
  ])
  return { users, orders, revenue }
}

export default async function DashboardPage() {
  const data = await getData()
  return <Dashboard {...data} />
}
```

### Sequential Requests (Dependent)

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

## Database Queries

### Direct Database Access

```tsx
// app/posts/page.tsx
import { db } from '@/lib/db'

async function Posts() {
  // Direct database query (no API route needed)
  const posts = await db.post.findMany({
    include: { author: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return <PostList posts={posts} />
}
```

### Prisma Example

```tsx
// app/posts/page.tsx
import { prisma } from '@/lib/prisma'

async function Posts() {
  const posts = await prisma.post.findMany({
    include: {
      author: {
        select: { name: true, email: true },
      },
      tags: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return <PostList posts={posts} />
}
```

### Drizzle ORM Example

```tsx
// app/posts/page.tsx
import { db } from '@/lib/db'
import { posts, authors } from '@/lib/schema'

async function Posts() {
  const allPosts = await db.select()
    .from(posts)
    .leftJoin(authors, posts.authorId.equals(authors.id))
    .orderBy(desc(posts.createdAt))
    .limit(10)

  return <PostList posts={allPosts} />
}
```

## Loading States with Suspense

### Basic Suspense

```tsx
// app/posts/page.tsx
import { Suspense } from 'react'

async function Posts() {
  const posts = await fetchPosts()
  return <PostList posts={posts} />
}

export default function Page() {
  return (
    <Suspense fallback={<PostsSkeleton />}>
      <Posts />
    </Suspense>
  )
}
```

### Streaming with Multiple Boundaries

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react'

async function RevenueChart() {
  const data = await fetchRevenue() // Slow
  return <Chart data={data} />
}

async function RecentOrders() {
  const orders = await fetchOrders() // Fast
  return <OrdersList orders={orders} />
}

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Fast content loads immediately */}
      <Suspense fallback={<OrdersSkeleton />}>
        <RecentOrders />
      </Suspense>

      {/* Slow content streams in */}
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>
    </div>
  )
}
```

## Error Handling

### Error Boundaries

```tsx
// app/posts/error.tsx
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
      <h2>Failed to load posts</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Not Found

```tsx
// app/posts/[id]/page.tsx
import { notFound } from 'next/navigation'

async function getPost(id: string) {
  const post = await db.post.findUnique({ where: { id } })
  if (!post) notFound()
  return post
}

export default async function PostPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id)
  return <article>{post.title}</article>
}

// app/posts/[id]/not-found.tsx
export default function NotFound() {
  return <h2>Post not found</h2>
}
```

## Caching Patterns

### Cache Tags

```tsx
// app/posts/page.tsx
async function Posts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] },
  })
  return <PostList posts={await res.json()} />
}

async function FeaturedPost() {
  const res = await fetch('https://api.example.com/posts/featured', {
    next: { tags: ['posts', 'featured'] },
  })
  return <Featured post={await res.json()} />
}
```

### Revalidate Path

```tsx
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get('title') as string } })
  revalidatePath('/posts') // Revalidate /posts and all children
  revalidatePath('/') // Revalidate root layout
}
```

### Revalidate Tag

```tsx
// app/actions.ts
'use server'
import { revalidateTag } from 'next/cache'

export async function updatePost(id: string) {
  await db.post.update({ where: { id }, data: { title: 'New Title' } })
  revalidateTag('posts') // Revalidate all 'posts' tagged fetches
}
```

## Environment Variables

### Server-side

```tsx
// Server Component or Server Action
const dbUrl = process.env.DATABASE_URL // ✅ OK
const apiKey = process.env.API_KEY // ✅ OK
```

### Client-side

```tsx
// Client Component
const publicKey = process.env.NEXT_PUBLIC_API_KEY // ✅ OK
const secret = process.env.SECRET_KEY // ❌ Undefined (not exposed)
```

## Best Practices

### DO

- Fetch data in Server Components (not Client Components)
- Use parallel fetching for independent requests
- Use Suspense for streaming and loading states
- Use appropriate cache strategies (force-cache, no-store, revalidate)
- Tag fetches for on-demand revalidation
- Handle errors with error.tsx boundaries

### DON'T

- Fetch data in Client Components when Server Components work
- Use `useEffect` for data fetching in Client Components
- Forget to revalidate after mutations
- Fetch the same data multiple times in a single render
- Use `cache: 'force-cache'` for dynamic data
