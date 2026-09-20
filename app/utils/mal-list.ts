import type { MalStatuses } from '../vf/utils/list-overlay'

/**
 * Talks to the MAL relay (functions/api/mal-list.js) and to the id -> wall
 * position index that `pnpm anime:index` writes next to the title chunks.
 */

export type MalListResponse = {
  user: string
  total: number
  statuses: MalStatuses
}

const ERRORS: Record<string, string> = {
  invalid_username:
    'Usernames are 2-32 characters, letters, numbers, _ and - only.',
  not_found: 'No MyAnimeList profile with that name.',
  private_list: 'That profile keeps its anime list private.',
  not_configured: 'The list lookup is not configured on this server.',
  upstream_error: 'MyAnimeList did not respond. Try again in a moment.',
}

export class MalListError extends Error {
  code: string
  constructor(code: string) {
    super(ERRORS[code] ?? 'Could not load that list.')
    this.code = code
  }
}

export const fetchMalList = async (
  username: string,
  signal?: AbortSignal,
): Promise<MalListResponse> => {
  let response: Response
  try {
    response = await fetch(
      `/api/mal-list?user=${encodeURIComponent(username)}`,
      { signal },
    )
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new MalListError('network')
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new MalListError(body.error ?? 'upstream_error')
  }

  return (await response.json()) as MalListResponse
}

let indexPromise: Promise<number[]> | undefined

/** MAL ids in wall order; 0 where the wall holds a title MAL does not list. */
export const fetchMalIndex = async (): Promise<number[]> => {
  if (!indexPromise) {
    const base = import.meta.env.VITE_FILM_INFO_BASE_URL ?? '/json'
    indexPromise = fetch(`${base}/mal-index.json`)
      .then((response) => {
        if (!response.ok) throw new MalListError('index_missing')
        return response.json() as Promise<{ ids: number[] }>
      })
      .then((data) => data.ids)
      .catch((error) => {
        indexPromise = undefined
        throw error
      })
  }
  return indexPromise
}
