/**
 * MyAnimeList list relay.
 *
 * MAL's API answers any public profile with just a client id - no visitor
 * login - but sends no CORS headers, so the browser cannot call it directly.
 * This is the only Pages Function on the site; public/_routes.json keeps it off
 * every other request so media and data stay free static hits.
 *
 * GET /api/mal-list?user=<name> -> { user, total, statuses: { <malId>: code } }
 * Status codes are the STATUS_CODE map below; the wall colours by code.
 */

const MAL_API = 'https://api.myanimelist.net/v2'
const PAGE_SIZE = 1000
const MAX_PAGES = 12 // 12k entries; MAL's own cap on a profile is far lower
const CACHE_SECONDS = 600

// Kept in step with LIST_STATUS in app/vf/utils/list-overlay.ts
const STATUS_CODE = {
  completed: 1,
  watching: 2,
  on_hold: 3,
  dropped: 4,
  plan_to_watch: 5,
}

const json = (body, status, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      ...extraHeaders,
    },
  })

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url)
  const user = (url.searchParams.get('user') ?? '').trim()

  if (!/^[A-Za-z0-9_-]{2,32}$/.test(user)) {
    return json({ error: 'invalid_username' }, 400)
  }
  if (!env.MAL_CLIENT_ID) {
    return json({ error: 'not_configured' }, 503)
  }

  const cache = caches.default
  const cacheKey = new Request(`${url.origin}/api/mal-list?user=${user.toLowerCase()}`)
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const statuses = {}
  let total = 0
  let next = `${MAL_API}/users/${encodeURIComponent(user)}/animelist?fields=list_status&limit=${PAGE_SIZE}&nsfw=true`

  for (let page = 0; page < MAX_PAGES && next; page++) {
    const response = await fetch(next, {
      headers: { 'X-MAL-CLIENT-ID': env.MAL_CLIENT_ID },
    })

    if (response.status === 404) return json({ error: 'not_found' }, 404)
    if (response.status === 403) return json({ error: 'private_list' }, 403)
    if (!response.ok) return json({ error: 'upstream_error', status: response.status }, 502)

    const body = await response.json()
    for (const entry of body.data ?? []) {
      const code = STATUS_CODE[entry.list_status?.status]
      const id = entry.node?.id
      if (code && id) {
        statuses[id] = code
        total++
      }
    }
    next = body.paging?.next ?? null
  }

  const result = json({ user, total, statuses }, 200)
  waitUntil(cache.put(cacheKey, result.clone()))
  return result
}
