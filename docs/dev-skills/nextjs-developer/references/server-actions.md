# Server Actions

## What are Server Actions?

Server Actions are async functions that run on the server, enabling mutations and data updates without creating API routes.

```tsx
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  const content = formData.get('content') as string

  await db.post.create({
    data: { title, content },
  })

  revalidatePath('/posts')
  redirect('/posts')
}
```

## Defining Server Actions

### Inline Server Actions

```tsx
// app/posts/new/page.tsx
import { revalidatePath } from 'next/cache'

export default function NewPostPage() {
  async function createPost(formData: FormData) {
    'use server'
    const title = formData.get('title') as string
    await db.post.create({ data: { title } })
    revalidatePath('/posts')
  }

  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Separate Server Actions File

```tsx
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  await db.post.create({ data: { title } })
  revalidatePath('/posts')
  redirect('/posts')
}

export async function deletePost(id: string) {
  await db.post.delete({ where: { id } })
  revalidatePath('/posts')
}

export async function updatePost(id: string, formData: FormData) {
  const title = formData.get('title') as string
  await db.post.update({
    where: { id },
    data: { title },
  })
  revalidatePath(`/posts/${id}`)
}
```

### Using Server Actions in Components

```tsx
// app/posts/[id]/page.tsx
import { deletePost, updatePost } from '@/app/actions'

export default function PostPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id)

  return (
    <div>
      <h1>{post.title}</h1>

      {/* Inline action */}
      <form action={deletePost.bind(null, post.id)}>
        <button type="submit">Delete</button>
      </form>

      {/* With state */}
      <UpdateForm post={post} />
    </div>
  )
}

function UpdateForm({ post }: { post: Post }) {
  async function update(formData: FormData) {
    'use server'
    await updatePost(post.id, formData)
  }

  return (
    <form action={update}>
      <input name="title" defaultValue={post.title} />
      <button type="submit">Update</button>
    </form>
  )
}
```

## Form Handling

### Basic Form

```tsx
// app/contact/page.tsx
import { submitContact } from '../actions'

export default function ContactPage() {
  return (
    <form action={submitContact}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      <button type="submit">Send</button>
    </form>
  )
}

// app/actions.ts
'use server'
export async function submitContact(formData: FormData) {
  const email = formData.get('email') as string
  const message = formData.get('message') as string

  await db.contact.create({
    data: { email, message },
  })

  revalidatePath('/contact')
}
```

### Form with Validation

```tsx
// app/posts/new/page.tsx
import { createPost } from '../actions'
import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1),
})

export default function NewPostPage() {
  async function create(formData: FormData) {
    'use server'
    const validated = PostSchema.safeParse({
      title: formData.get('title'),
      content: formData.get('content'),
    })

    if (!validated.success) {
      return { errors: validated.error.flatten().fieldErrors }
    }

    await db.post.create({
      data: validated.data,
    })

    revalidatePath('/posts')
    redirect('/posts')
  }

  return (
    <form action={create}>
      <input name="title" />
      <textarea name="content" />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Form with useActionState

```tsx
// app/login/page.tsx
'use client'
import { useActionState } from 'react'
import { login } from '../actions'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null)

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Logging in...' : 'Login'}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  )
}

// app/actions.ts
'use server'
import { cookies } from 'next/headers'

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const user = await db.user.findUnique({ where: { email } })

  if (!user || !verifyPassword(password, user.password)) {
    return { error: 'Invalid credentials' }
  }

  cookies().set('session', createSession(user.id))
  redirect('/dashboard')
}
```

## Revalidation

### Revalidate Path

```tsx
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get('title') as string } })
  revalidatePath('/posts') // Revalidate /posts and all children
  revalidatePath('/posts/123') // Revalidate specific post
  revalidatePath('/', 'layout') // Revalidate root layout
}
```

### Revalidate Tag

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
  revalidateTag('posts') // Revalidate all fetch requests tagged with 'posts'
}
```

### Revalidate with Cache Tags

```tsx
// app/posts/page.tsx
async function Posts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'], revalidate: 3600 },
  })
  return <PostList posts={await res.json()} />
}

async function FeaturedPost() {
  const res = await fetch('https://api.example.com/posts/featured', {
    next: { tags: ['posts', 'featured'], revalidate: 3600 },
  })
  return <Featured post={await res.json()} />
}

// app/actions.ts
'use server'
import { revalidateTag } from 'next/cache'

export async function updatePost(id: string, formData: FormData) {
  await db.post.update({
    where: { id },
    data: { title: formData.get('title') as string },
  })
  revalidateTag('posts') // Revalidates both Posts and FeaturedPost
}
```

## Redirects

### Server-side Redirect

```tsx
// app/actions.ts
'use server'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get('title') as string } })
  redirect('/posts') // Permanent redirect (303)
}
```

### Permanent Redirect

```tsx
// app/actions.ts
'use server'
import { permanentRedirect } from 'next/navigation'

export async function completeOnboarding() {
  await db.user.update({
    where: { id: userId },
    data: { onboardingComplete: true },
  })
  permanentRedirect('/dashboard') // 308 Permanent Redirect
}
```

## Cookies and Headers

### Reading Cookies

```tsx
// app/actions.ts
'use server'
import { cookies } from 'next/headers'

export async function getSession() {
  const session = cookies().get('session')?.value
  return session
}

export async function logout() {
  cookies().delete('session')
  redirect('/login')
}
```

### Setting Cookies

```tsx
// app/actions.ts
'use server'
import { cookies } from 'next/headers'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const user = await authenticate(email, password)

  cookies().set('session', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  })

  redirect('/dashboard')
}
```

### Reading Headers

```tsx
// app/actions.ts
'use server'
import { headers } from 'next/headers'

export async function getIp() {
  const headersList = headers()
  const ip = headersList.get('x-forwarded-for') || 'unknown'
  return ip
}
```

## Optimistic Updates

### Client-side Optimistic UI

```tsx
// app/components/like-button.tsx
'use client'
import { useOptimistic } from 'react'
import { likePost } from '../actions'

export function LikeButton({ postId, likes }: { postId: string; likes: number }) {
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    likes,
    (currentLikes) => currentLikes + 1
  )

  async function handleLike() {
    addOptimisticLike(optimisticLikes)
    await likePost(postId)
  }

  return (
    <button onClick={handleLike}>
      ❤️ {optimisticLikes}
    </button>
  )
}

// app/actions.ts
'use server'
export async function likePost(postId: string) {
  await db.post.update({
    where: { id: postId },
    data: { likes: { increment: 1 } },
  })
  revalidateTag('posts')
}
```

## Error Handling

### try/catch in Server Actions

```tsx
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  try {
    const title = formData.get('title') as string
    await db.post.create({ data: { title } })
    revalidatePath('/posts')
    return { success: true }
  } catch (error) {
    return { error: 'Failed to create post' }
  }
}
```

### useActionState for Error Handling

```tsx
// app/posts/new/page.tsx
'use client'
import { useActionState } from 'react'
import { createPost } from '../actions'

export default function NewPostPage() {
  const [state, formAction, isPending] = useActionState(createPost, null)

  return (
    <form action={formAction}>
      <input name="title" />
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
```

## Best Practices

### DO

- Use Server Actions for mutations (create, update, delete)
- Revalidate paths/tags after mutations
- Use `redirect` after successful mutations
- Validate input with Zod or similar
- Use `useActionState` for form state management
- Keep Server Actions in separate files for complex apps

### DON'T

- Use Server Actions for data fetching (use Server Components)
- Forget to revalidate after mutations
- Expose sensitive operations without authentication
- Use Client Components for mutations when Server Actions work
- Forget to handle errors in Server Actions
