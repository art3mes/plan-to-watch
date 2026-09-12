const env = import.meta.env as unknown as {
  VITE_TELEMETRY_ENABLED?: string
  VITE_TELEMETRY_ENDPOINT?: string
  VITE_APP_VERSION?: string
}

export default {
  // Posters are served from this site, by wall position. There is no separate
  // backdrop image: the detail panel blurs the poster instead.
  posterBaseUrl: `${import.meta.env.VITE_TEXTURES_BASE_URL ?? '/media'}/single/`,
  sourceCodeUrl: 'https://github.com/gnovotny/nothing-to-watch',
  malUrl: 'https://myanimelist.net',
  malAnimeBaseUrl: 'https://myanimelist.net/anime/',
  aniListUrl: 'https://anilist.co',
  aniListAnimeBaseUrl: 'https://anilist.co/anime/',
  kitsuUrl: 'https://kitsu.app',
  kitsuAnimeBaseUrl: 'https://kitsu.app/anime/',
  contactEmail: undefined as string | undefined,
  disableUI: false,
  telemetry: {
    enabled:
      env?.VITE_TELEMETRY_ENABLED === '1' ||
      env?.VITE_TELEMETRY_ENABLED === 'true',
    endpoint: env?.VITE_TELEMETRY_ENDPOINT || undefined,
    appVersion: env?.VITE_APP_VERSION || undefined,
  },
}
