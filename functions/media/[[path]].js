/**
 * Serves the R2 media bucket from this origin under /media/*.
 *
 * Keeping it same-origin matters: the page is cross-origin isolated (see
 * public/_headers), so cross-origin media would need CORP headers on every
 * object and a custom domain in front of the bucket. This avoids both.
 */

const CONTENT_TYPES = {
  dds: 'image/vnd-ms.dds',
  ktx: 'image/ktx',
  jpg: 'image/jpeg',
  json: 'application/json',
}

export async function onRequestGet({ params, env, request, waitUntil }) {
  const key = Array.isArray(params.path) ? params.path.join('/') : params.path
  if (!key) return new Response('Not found', { status: 404 })

  // Serve from the edge cache when we can - a cache hit costs no R2 operation.
  const cache = caches.default
  const cached = await cache.match(request)
  if (cached) return cached

  const object = await env.MEDIA.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  const extension = key.split('.').pop()?.toLowerCase()
  const headers = new Headers({
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    // Atlas layers and posters are content-addressed by wall position and only
    // change when the data is rebuilt, so cache hard and purge on redeploy.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ETag: object.httpEtag,
  })

  const response = new Response(object.body, { headers })
  waitUntil(cache.put(request, response.clone()))
  return response
}
