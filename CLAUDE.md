# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

**Plan to Watch** - a WebGL wall of 21,474 anime series and films rendered as a force-directed voronoi diagram. Forked from [gnovotny/nothing-to-watch](https://github.com/gnovotny/nothing-to-watch), which does the same for films. The engine (`voroforce/`) is upstream's and is largely untouched; this fork replaces the data, the texture pipeline and the anime-specific parts of the app.

## Ground rules

- **No features upstream does not have.** Swap data, text, credits and branding; do not add new UI. A search feature was proposed and explicitly rejected on these grounds.
- **Ecchi, Chinese and Korean titles stay in.** The only content filter is hentai.
- **Non-commercial only** - the shaders are CC BY-NC-SA 3.0 and MyAnimeList's API licence agrees.
- Upstream's MIT copyright line stays in `LICENSE`; additions go alongside it.

## Development commands

Use **pnpm**. bun is not installed and the project no longer carries a `bun.lock`.

- `pnpm dev` - dev server on port 3000
- `pnpm build` - `tsc -b` then vite build
- `pnpm check` - Biome lint and format
- `pnpm run test` - unit tests (Vitest)
- `pnpm test:e2e` - end-to-end tests (Playwright)
- `pnpm run deploy` - build, check the file count, upload to Cloudflare Pages (`pnpm deploy` is pnpm's own workspace command, hence `run`)

All settings live in one gitignored `.env.local` (template: `.env.local.example`), used by both `pnpm dev` and `pnpm build`. `MAL_CLIENT_ID` in it is read only by the data scripts; Vite never exposes non-`VITE_` variables to the site. Shaders are minified on every `vite build`, so there is no separate production env file.

**Known noise, not worth "fixing":**

- This checkout is CRLF (`core.autocrlf=true`) while Biome expects LF, so `pnpm check` reports format errors on files nobody touched. Do not mass-reformat the repo. `pnpm biome lint <files>` is the useful signal.

The error-boundary snapshot used to capture a real stack trace and jsdom user agent, so it only passed on upstream's machine. The test now pins both; all 58 tests should pass.

## Data pipeline (`scripts/anime/`)

Run in order; each crawl is resumable and skips what it already has.

| Command | Does | Time |
|---|---|---|
| `pnpm anime:catalog` | manami dump -> `data/build/catalog.json` | instant |
| `pnpm anime:kitsu` | Kitsu crawl, 20 titles per request | ~30 min |
| `pnpm anime:popularity` | MAL popularity ranking, 500 per request | ~1 min |
| `pnpm anime:mal` | MAL details for titles Kitsu lacks | ~1-2 h |
| `pnpm anime:order` | merge, group franchises, order, cut json chunks | instant |
| `pnpm anime:posters` | one poster per title into `data/raw/posters/` | ~20 min, ~1 GB |
| `pnpm anime:atlases` | pack and compress atlases into `public/media/` | ~5 min |

Sources: **Kitsu** (primary, no key), **MyAnimeList** (needs `MAL_CLIENT_ID` in `.env.local`), **manami-project/anime-offline-database** (catalogue backbone and ID cross-referencing). **AniList is deliberately unused** - its terms forbid mass collection of media data.

Key invariants:

- Poster files are keyed by provider id (`m<mal>`, `k<kitsu>`, `a<anilist>`), never by wall position. Re-running the merge reshuffles positions; downloads must survive that.
- Json chunks hold 216 titles, matching one high-res atlas page and one lattice subgrid. Position 0 is the centre of the wall.
- Order is each franchise's most popular entry first (MAL member count), then all remaining sequels and films.
- After `anime:atlases`, update `VITE_MEDIA_VERSION_*_LAYERS` in `.env.local` with the layer counts it prints.
- Detail-panel posters are packed 9x6 into sheets under `public/media/poster-sheets/`, not one file per title: 21,472 individual images exceed Cloudflare Pages' 20,000 file limit on their own. `posterStyle()` in `app/vf/utils/films.ts` crops one out with `background-position`; the geometry must match `SHEET` in step 7.
- The focused cell's full-resolution layer (`VITE_EXPERIMENTAL_MEDIA_VERSION_3_ENABLED`) reads the same sheets. Upstream loaded one image per title and packed them into 9x6 virtual GPU layers; with `cols: 9, rows: 6` in its media config the engine's layer index becomes the sheet number, and `VirtualMediaGridArrayTexture` uploads a whole sheet when `sheets: true`. Turning this layer off makes the selected poster a stretched 110x165 DXT1 tile - visibly blocky, so keep it on.
- `pnpm anime:atlases --sheets-only` rebuilds sheets without re-encoding the 105 atlas layers.
- The repo commits a sample so a fresh clone runs: `public/json/0.json`, page `0` of each atlas level and poster sheets `0-3`, matched by the layer counts in `.env.local.example` (1/1/1/4). A data rebuild changes these files - commit them together or the sample drifts out of step.

### Texture encoding

`scripts/anime/encode.mjs` implements DXT1 (DDS, desktop) and ETC1 (KTX labelled ETC2, phones) directly. `texture-compressor` is a dead end - it ships no binaries and shells out to PVRTexToolCLI/crunch, which are not available.

The ETC selector bit mapping is `(msb,lsb)`: `(0,0)` = small positive, `(1,1)` = large negative - msb is the sign bit. This was recovered by decoding upstream's `public/media/low/ktx/0.ktx` against its `low/dds/0.dds` twin and scoring all 24 permutations; the intuitive guess is inverted and scores four times worse. Do not "correct" it from memory.

## Architecture

- `app/` - React 19, TypeScript, Vite, Tailwind, Radix, Zustand
  - `app/store/` - store slices (ui, voroforce, film data)
  - `app/vf/` - integration layer between React and the engine; `app/vf/utils/films.ts` defines `Film` and `favoriteKey`
  - `app/cmps/` - components (common, ui, views)
- `voroforce/` - upstream's vanilla-JS simulation and WebGL renderer (OGL + GLSL), multi-threaded via SharedArrayBuffer, which is why the dev server sets COOP/COEP headers

### Film data shape

`Film` carries `posterRef` (sheet index plus column/row), `malId`/`anilistId`/`kitsuId`, `title` (English where available, else romaji), `alt` (the other spellings), `synopsis`, `type`, `episodes`, `studios`, `genres`, `rating` (0-100, MAL first) and `ageRating`. There are **no backdrop images** - the detail panel blurs the poster instead. Favourites are keyed by `favoriteKey()` so rebuilt data does not orphan them.

## Code style

Biome: single quotes, 2-space indent, semicolons only as needed, sorted Tailwind classes.
