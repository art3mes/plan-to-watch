import type { VoroforceCell } from '../types'

export type FilmData = Record<string, string | number | string[] | null>
export type FilmBatch = FilmData[]
export type FilmBatches = Map<number, FilmBatch>

/**
 * One title on the wall.
 *
 * Fields come from the anime pipeline (scripts/anime), not from a film
 * database: `title` is the English name where one exists and the romaji name
 * otherwise, with the other spellings in `alt`. Posters are served from this
 * site by wall position rather than from a remote image host.
 */
export class Film {
  malId?: number
  anilistId?: number
  kitsuId?: number
  title: string
  alt?: string
  year?: number
  showYear: boolean
  type?: string
  episodes?: number
  studios: string[]
  genres: string[]
  synopsis?: string
  rating: number
  ageRating?: string
  poster: string
  cellId?: number

  constructor(data: FilmData, position: number) {
    this.malId = data.mal ? Number(data.mal) : undefined
    this.anilistId = data.anilist ? Number(data.anilist) : undefined
    this.kitsuId = data.kitsu ? Number(data.kitsu) : undefined
    this.title = String(data.title)
    this.alt = data.alt ? String(data.alt) : undefined
    this.year = data.year ? Number(data.year) : undefined
    // Kitsu titles often carry a disambiguating year - "Hunter x Hunter
    // (2011)" - so only append one when it is not already there.
    this.showYear = Boolean(this.year) && !this.title.endsWith(`(${this.year})`)
    this.type = data.type ? String(data.type) : undefined
    this.episodes = data.episodes ? Number(data.episodes) : undefined
    this.studios = Array.isArray(data.studios) ? data.studios : []
    this.genres = Array.isArray(data.genres) ? data.genres : []
    this.synopsis = data.synopsis ? String(data.synopsis) : undefined
    this.rating = data.rating ? Number(data.rating) : 0
    this.ageRating = data.ageRating ? String(data.ageRating) : undefined
    this.poster = `${position}.jpg`
    this.cellId = position
  }
}

/**
 * Stable identity for a title, used to key favourites. Provider ids survive a
 * data rebuild; wall positions do not.
 */
export const favoriteKey = (film: {
  malId?: number
  anilistId?: number
  kitsuId?: number
  cellId?: number
}) =>
  film.malId
    ? `m${film.malId}`
    : film.kitsuId
      ? `k${film.kitsuId}`
      : film.anilistId
        ? `a${film.anilistId}`
        : `c${film.cellId}`

const loadCellFilmBatch = async (batchIndex: number) => {
  const url = `${import.meta.env.VITE_FILM_INFO_BASE_URL}/${batchIndex}.json`
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.log('batchIndex', batchIndex)
    console.error('Error loading JSON:', error)
  }
}

export const getCellFilm = async (
  cell: VoroforceCell,
  filmBatches: FilmBatches,
) => {
  if (!cell) return
  let filmBatch = filmBatches.get(cell.subgrid)
  if (!filmBatch) {
    filmBatch = await loadCellFilmBatch(cell.subgrid)
    filmBatches.set(cell.subgrid, filmBatch ?? [])
  }

  // cell.id is the wall position: the lattice hands out ids chunk by chunk from
  // the centre outwards, which is exactly how the json chunks are cut.
  return filmBatch?.[cell.subgridIndex]
    ? new Film(filmBatch[cell.subgridIndex], cell.id)
    : undefined
}
