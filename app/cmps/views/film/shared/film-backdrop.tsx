import { type Film, posterStyle } from '@/vf'

// There are no backdrop images for anime, so the poster stands in.
export const FilmBackdrop = ({ film }: { film: Film }) => {
  return (
    <div
      style={posterStyle(film.posterRef)}
      className='aspect-[2/3] h-auto w-full bg-no-repeat'
    />
  )
}
