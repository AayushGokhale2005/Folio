type Json = Record<string, unknown>
type Secrets = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }
type FolioEnv = Env & Secrets

const json = (value: unknown, status = 200, origin = '*') =>
  Response.json(value, { status, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } })

function cors(request: Request, env: FolioEnv) {
  const origin = request.headers.get('Origin')
  return origin === env.FRONTEND_URL ? origin : env.FRONTEND_URL
}

async function supabase(env: FolioEnv, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('apikey', env.SUPABASE_SERVICE_ROLE_KEY)
  headers.set('Authorization', `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)
  headers.set('Content-Type', 'application/json')
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

async function currentUser(request: Request, env: FolioEnv) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new Response('Sign in required', { status: 401 })
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: authorization } })
  if (!response.ok) throw new Response('Session expired', { status: 401 })
  return response.json<Json>()
}

async function assertBook(bookId: string, userId: string, env: FolioEnv) {
  const books = await supabase(env, `books?id=eq.${bookId}&owner_id=eq.${userId}&select=id`) as Json[]
  if (!books.length) throw new Response('Book not found', { status: 404 })
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ')

export default {
  async fetch(request, env): Promise<Response> {
    const origin = cors(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' } })
    const url = new URL(request.url)
    try {
      if (url.pathname === '/health') return json({ status: 'ok' }, 200, origin)
      if (url.pathname === '/auth/google') return Response.redirect(`${env.SUPABASE_URL}/auth/v1/authorize?${new URLSearchParams({ provider: 'google', redirect_to: `${env.FRONTEND_URL}/auth/callback` })}`, 302)
      const user = await currentUser(request, env)
      const userId = String(user.id)
      if (url.pathname === '/auth/me') return json({ id: userId, email: user.email, full_name: (user.user_metadata as Json | undefined)?.full_name ?? (user.user_metadata as Json | undefined)?.name }, 200, origin)
      if (url.pathname === '/books' && request.method === 'GET') return json(await supabase(env, `books?owner_id=eq.${userId}&select=*&order=updated_at.desc`), 200, origin)
      if (url.pathname === '/books' && request.method === 'POST') { const body = await request.json<Json>(); const rows = await supabase(env, 'books', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title: body.title, owner_id: userId }) }) as Json[]; return json(rows[0], 201, origin) }
      const itemMatch = url.pathname.match(/^\/books\/([^/]+)\/items$/)
      if (itemMatch) { await assertBook(itemMatch[1], userId, env); if (request.method === 'GET') return json(await supabase(env, `manuscript_items?book_id=eq.${itemMatch[1]}&select=*&order=position.asc`), 200, origin); if (request.method === 'POST') { const body = await request.json<Json>(); const rows = await supabase(env, 'manuscript_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...body, book_id: itemMatch[1] }) }) as Json[]; return json(rows[0], 201, origin) } }
      const characters = url.pathname.match(/^\/books\/([^/]+)\/characters$/)
      if (characters) { await assertBook(characters[1], userId, env); if (request.method === 'GET') return json(await supabase(env, `characters?book_id=eq.${characters[1]}&select=*&order=name.asc`), 200, origin); if (request.method === 'POST') { const body = await request.json<Json>(); const rows = await supabase(env, 'characters', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...body, book_id: characters[1] }) }) as Json[]; return json(rows[0], 201, origin) } }
      const character = url.pathname.match(/^\/characters\/([^/]+)$/)
      if (character && request.method === 'PATCH') { const rows = await supabase(env, `characters?id=eq.${character[1]}&select=book_id`) as Json[]; if (!rows.length) throw new Response('Character not found', { status: 404 }); await assertBook(String(rows[0].book_id), userId, env); const updated = await supabase(env, `characters?id=eq.${character[1]}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(await request.json()) }) as Json[]; return json(updated[0], 200, origin) }
      const updateItem = url.pathname.match(/^\/items\/([^/]+)$/)
      if (updateItem && request.method === 'PATCH') { const items = await supabase(env, `manuscript_items?id=eq.${updateItem[1]}&select=book_id`) as Json[]; if (!items.length) throw new Response('Chapter not found', { status: 404 }); await assertBook(String(items[0].book_id), userId, env); const rows = await supabase(env, `manuscript_items?id=eq.${updateItem[1]}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(await request.json()) }) as Json[]; return json(rows[0], 200, origin) }
      const finish = url.pathname.match(/^\/chapters\/([^/]+)\/finish$/)
      if (finish && request.method === 'POST') { const chapters = await supabase(env, `manuscript_items?id=eq.${finish[1]}&kind=eq.chapter&select=*`) as Json[]; if (!chapters.length) throw new Response('Chapter not found', { status: 404 }); const chapter = chapters[0]; await assertBook(String(chapter.book_id), userId, env); const names = text(String(chapter.content ?? '')).match(/\b[A-Z][a-z]{2,}\b/g) ?? []; const ignored = new Set(['The','This','That','With','When','Then','They','She','His','Her','For','And','But','Chapter']); const candidates = [...new Set(names.filter(name => !ignored.has(name) && names.filter(n => n === name).length >= 2))]; const existing = await supabase(env, `characters?book_id=eq.${chapter.book_id}&select=name`) as Json[]; const known = new Set(existing.map(row => String(row.name).toLowerCase())); const detected = candidates.filter(name => !known.has(name.toLowerCase())); for (const name of detected) await supabase(env, 'characters', { method: 'POST', body: JSON.stringify({ book_id: chapter.book_id, name, role: 'Detected from manuscript' }) }); const rows = await supabase(env, 'feed_posts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ book_id: chapter.book_id, chapter_id: finish[1], author_id: userId, title: chapter.title, content_snapshot: chapter.content ?? '' }) }) as Json[]; return json({ post: rows[0], detected_characters: detected }, 201, origin) }
      if (url.pathname === '/feed') return json(await supabase(env, 'feed_posts?select=*&order=published_at.desc&limit=40'), 200, origin)
      if (url.pathname === '/studio') { const posts = await supabase(env, `feed_posts?author_id=eq.${userId}&select=*&order=published_at.desc`) as Json[]; const words = posts.reduce((sum, post) => sum + text(String(post.content_snapshot ?? '')).trim().split(/\s+/).filter(Boolean).length, 0); return json({ posts, post_count: posts.length, words_shared: words }, 200, origin) }
      return json({ detail: 'Not found' }, 404, origin)
    } catch (error) {
      if (error instanceof Response) return json({ detail: await error.text() }, error.status, origin)
      console.error(JSON.stringify({ event: 'api_error', path: url.pathname, error: String(error) }))
      return json({ detail: 'Internal server error' }, 500, origin)
    }
  }
} satisfies ExportedHandler<FolioEnv>
