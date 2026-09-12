# Plan to Watch

Your plan-to-watch list was never going to get shorter. Here is all of it at once.

An interactive WebGL wall of **21,474 anime series and films**, rendered as a force-directed voronoi diagram of poster art.

A fork of [gnovotny/nothing-to-watch](https://github.com/gnovotny/nothing-to-watch), which does the same thing for films. The engine is theirs; the data pipeline, the texture encoders and the anime-specific app changes are what this fork adds.

## What is in the wall

| Rule | Detail |
|---|---|
| Types | TV, movies, OVA, ONA, plus specials that stand on their own |
| Excluded | Hentai only |
| Included on purpose | Ecchi, Chinese and Korean animation, and every sequel as its own entry |
| Order | Each franchise's most popular entry first, by MyAnimeList member count, spiralling out from the centre; sequels, films and OVAs fill the outer rings |
| Titles | English where one exists, romaji otherwise, with the other spellings underneath |

## Data sources

- **[Kitsu](https://kitsu.app)** - titles, synopses, posters, ratings, popularity, franchise links. No API key needed.
- **[MyAnimeList](https://myanimelist.net)** - member counts for ordering, plus synopses and English titles for the ~4.3k titles Kitsu has not mapped. Needs a free client ID (see below).
- **[manami-project/anime-offline-database](https://github.com/manami-project/anime-offline-database)** - the catalogue backbone and cross-provider ID mapping.

AniList is deliberately **not** used: its terms forbid mass collection of media data, which is exactly what building a static dataset is.

## Rebuilding the data

Requires `MAL_CLIENT_ID` in `.env.local`, from [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig) (register an app as `other` / non-commercial).

```bash
pnpm anime:catalog      # manami dump -> data/build/catalog.json     (instant)
pnpm anime:kitsu        # Kitsu crawl, 20 titles per request         (~30 min)
pnpm anime:popularity   # MAL popularity ranking, 500 per request    (~1 min)
pnpm anime:mal          # MAL details for titles Kitsu lacks         (~1-2 h)
pnpm anime:order        # merge, group franchises, order, cut chunks (instant)
pnpm anime:posters      # download one poster per title              (~20 min, ~1 GB)
pnpm anime:atlases      # pack and compress the texture atlases      (~5 min)
```

Every crawl is resumable - rerun after an interruption and it continues. Poster files are keyed by provider ID, not by wall position, so re-ordering the wall never re-downloads anything.

The first step needs `data/raw/anime-offline-database-minified.json` from the [dataset releases](https://github.com/manami-project/anime-offline-database/releases).

### Texture encoding

The engine wants DXT1 inside DDS for desktop GPUs and ETC inside KTX for phones. `texture-compressor` only shells out to binaries that are not available here, so `scripts/anime/encode.mjs` implements both formats directly - about 400 lines, no native dependencies. The ETC selector bit order was recovered empirically by decoding upstream's own `low/ktx/0.ktx` against its `low/dds/0.dds` twin.

## Development

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev                # http://localhost:3000
```

`bun` works too, but is not required; `pnpm` is what this fork is developed against.

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Typecheck and production build |
| `pnpm check` | Biome lint and format |
| `pnpm run test` | Unit tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright) |

Note that this checkout uses CRLF line endings on Windows while Biome expects LF, so `pnpm check` reports formatting differences on files nobody has touched.

## Deployment

Cloudflare Pages for the app, Cloudflare R2 for the media. The 21,474 single posters alone exceed the Pages per-site file limit, so `VITE_TEXTURES_BASE_URL` should point at R2 rather than shipping media with the site.

Cross-origin isolation headers are required for the multi-threaded simulation (`functions/_middleware.js` handles this on Pages).

## Licence

- Code: MIT, as inherited from the upstream project - the original copyright notice stays.
- WebGL fragment shaders: Creative Commons BY-NC-SA 3.0, so **non-commercial use only**.
- Anime metadata: from Kitsu, MyAnimeList and anime-offline-database, each under its own terms. MyAnimeList's API licence also restricts this to non-commercial use.
- Poster art: property of the respective studios and licensors, used here for identification only.
