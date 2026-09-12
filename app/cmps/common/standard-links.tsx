import config from '../../config'
import { cn } from '../../utils/tw'
import type { Film } from '../../vf'
import { Button } from '../ui/button'

/**
 * Outbound links for a title. MyAnimeList and AniList are the two most people
 * want; Kitsu stands in when a title is on neither.
 */
export const StdLinks = ({
  film,
  buttonClassName = '',
}: {
  film: {
    title: Film['title']
    malId?: Film['malId']
    anilistId?: Film['anilistId']
    kitsuId?: Film['kitsuId']
  }
  buttonClassName?: string
}) => {
  const links: Array<{ label: string; href: string }> = []

  if (film.malId) {
    links.push({ label: 'MAL', href: `${config.malAnimeBaseUrl}${film.malId}` })
  }
  if (film.anilistId) {
    links.push({
      label: 'AniList',
      href: `${config.aniListAnimeBaseUrl}${film.anilistId}`,
    })
  }
  if (!links.length && film.kitsuId) {
    links.push({
      label: 'Kitsu',
      href: `${config.kitsuAnimeBaseUrl}${film.kitsuId}`,
    })
  }

  return (
    <>
      {links.map(({ label, href }) => (
        <Button
          key={label}
          asChild
          variant='outline'
          className={cn(
            'rounded-lg border-foreground md:backdrop-blur-lg',
            buttonClassName,
          )}
        >
          <a href={href} target='_blank' rel='noreferrer'>
            {label}
          </a>
        </Button>
      ))}
    </>
  )
}
