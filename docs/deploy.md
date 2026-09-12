# Deploying Plan to Watch

Everything ships with the site - app, atlases, poster sheets and film data.
No object storage, CDN account or payment method is involved.

## Why sheets exist

Cloudflare Pages allows **20,000 files per deployment** on the free plan. One
poster image per title is 21,472 files on its own, which is over the limit
before anything else is counted. Packing them 9x6 into 1980x1980 sheets turns
that into ~400 files, and the whole deployment lands around 700 files.

The same sheets serve two consumers. The detail panel crops a poster out with
`background-position` (`posterStyle()` in `app/vf/utils/films.ts`), and the wall's
full-resolution layer for the focused cell uploads a whole sheet to the GPU at
once - the engine already arranged single posters in exactly this 9x6 layout, so
the shader is unchanged. Either way a visitor downloads one sheet rather than one
file per poster.

## Deploying

```bash
cp .env.production.example .env.production   # first time only
pnpm anime:check                             # chunks and atlases must agree
pnpm run deploy                                  # build, check file count, upload
```

`pnpm run deploy` refuses to upload if `dist/` is over the file limit, so the
failure is a message rather than a rejected deploy.

The first run prompts to create the Pages project, and `pnpm wrangler login`
if this machine has not authenticated yet.

### Deploy from this machine, not from GitHub

`public/media`, `public/json` and `data/` are gitignored - they are build
output, not source. A git-triggered build would deploy a wall with no posters
and no titles.

## After deploying, check

1. `crossOriginIsolated` is `true` in the console. If it is false the workers
   run on copied buffers and the wall renders but never moves. The headers come
   from `public/_headers`, plus `functions/_middleware.js` for iOS Safari.
2. A poster sheet loads (`/media/poster-sheets/0.jpg`) and the detail panel
   shows the right poster for the right title.
3. The wall itself draws - that is `/media/{low,mid,high}/dds/*.dds`.

## Refreshing the data

Both halves are indexed by wall position and must move together.

```bash
pnpm anime:kitsu && pnpm anime:mal && pnpm anime:popularity   # refresh sources
pnpm anime:order && pnpm anime:posters && pnpm anime:atlases  # rebuild
pnpm anime:check                                              # fingerprints agree
pnpm run deploy
```

`pnpm anime:atlases --sheets-only` rebuilds just the poster sheets, leaving the
compressed atlases alone - useful when only the sheet layout changed.

If `anime:atlases` reports different layer counts, update
`VITE_MEDIA_VERSION_*_LAYERS` in `.env.production` before deploying.

## If you outgrow the free plan

The deployment is ~600 MB and Cloudflare does not meter Pages bandwidth, so
this should hold for a personal site. If it ever needs to scale:

- **Workers Paid ($5/mo)** raises the Pages file limit to 100,000, which would
  allow going back to one file per poster.
- **R2** (object storage, free egress, ~£0 at this size) can host `public/media`
  and `public/json` instead. Point `VITE_TEXTURES_BASE_URL` and
  `VITE_FILM_INFO_BASE_URL` at a bucket on a custom domain, and give the objects
  `Cross-Origin-Resource-Policy: cross-origin` - cross-origin isolation blocks
  them otherwise. Note that R2 requires a payment method even inside its free
  tier, and that the `r2.dev` URL is rate limited and documented as
  non-production.
