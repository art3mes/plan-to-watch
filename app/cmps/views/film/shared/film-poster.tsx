import type { PointerEventHandler } from 'react'
import { cn } from '../../../../utils/tw'
import { type Film, posterStyle } from '../../../../vf'

/**
 * One poster, cropped out of its sheet. Posters are packed 9x6 per sheet, so
 * this is a background-position offset rather than its own image request.
 */
export const FilmPoster = ({
  film,
  onPointerOver,
  className = '',
}: {
  film: {
    title: Film['title']
    posterRef?: Film['posterRef']
  }
  onPointerOver?: PointerEventHandler<HTMLDivElement>
  className?: string
}) => {
  if (!film.posterRef) return null
  return (
    <div
      role='img'
      aria-label={film.title}
      style={posterStyle(film.posterRef)}
      className={cn('aspect-[2/3] bg-no-repeat', className)}
      onPointerOver={onPointerOver}
    />
  )
}
