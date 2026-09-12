# Deploying Plan to Watch

## Why it is split

`dist/` is ~846 MB across ~21,800 files, almost all of it posters. That runs into
two walls at once:

- Cloudflare Pages allows **20,000 files per deployment** on the free plan (100,000 on paid).
- Every visitor pulls tens of MB of atlases, which on a bandwidth-billed host
  (Netlify charges 20 credits/GB, ~15 GB total on its free plan) is the entire budget.

So the app deploys to Pages (~30 files) and the media lives in **R2**, whose egress
is free. A Pages Function streams the bucket under `/media/*`, which keeps the URLs
same-origin - no custom domain, no CORS, no per-object CORP headers.

## What you need

- A Cloudflare account. R2 requires completing a checkout/subscription step, so
  expect to add a payment method even though the usage below is inside the free tier.
- Free tier covers this comfortably: 10 GB storage (we use ~0.85 GB), 10M Class B
  reads/month, unlimited free egress.

## One-time setup

**1. Create the bucket**

Dashboard → Storage & databases → R2 → complete checkout → Create bucket, named
`plan-to-watch-media`. Leave it private; the Function reads it through a binding.

If you rename it, update `bucket_name` in `wrangler.toml`.

**2. Create an S3 API token for uploads**

R2 → API → Manage API tokens → Create token, Object Read & Write, scoped to that
bucket. Copy the Access Key ID, Secret Access Key, and the account ID from the
endpoint URL. Keep these yourself - they never need to enter the repo or a chat.

**3. Configure rclone**

`wrangler r2 object put` uploads one file per invocation, which is unusable for
21,000 objects. rclone does it in parallel.

```bash
rclone config create r2 s3 provider=Cloudflare \
  access_key_id=YOUR_KEY secret_access_key=YOUR_SECRET \
  endpoint=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  acl=private
```

## Uploading the data

Run after any pipeline rebuild. `--checksum` skips unchanged objects, so repeat
runs only move what changed.

```bash
# posters and atlases (~832 MB, ~21,700 objects)
rclone copy public/media r2:plan-to-watch-media --checksum --transfers=32 --progress

# film data chunks (~13 MB, 101 objects)
rclone copy public/json r2:plan-to-watch-media/json --checksum --transfers=32 --progress
```

Verify the counts match what the build produced:

```bash
rclone size r2:plan-to-watch-media
```

## Deploying the app

```bash
cp .env.production.example .env.production   # first time only
pnpm anime:check                             # chunks and atlases must agree
pnpm deploy                                  # build, prune, upload
```

`pnpm deploy` runs the build, strips `dist/media` and `dist/json` (they come from
R2, and leaving them in would blow the 20,000 file limit), then uploads. It fails
loudly if the pruned output is still over the limit.

The first deploy asks to create the project. Wrangler will prompt for login
(`pnpm wrangler login`) if this machine has not authenticated yet.

**Bind the bucket once**, or the Function returns 404s: Pages project → Settings →
Functions → R2 bucket bindings → add `MEDIA` → `plan-to-watch-media`. The
`wrangler.toml` entry covers local `wrangler pages dev`; the dashboard binding
covers the deployed site.

### Why not deploy from GitHub

`public/media`, `public/json` and `data/` are gitignored, so a git-triggered build
would produce a site with no posters and no titles. Deploy from this machine, where
the built data lives.

## After deploying, check

1. `crossOriginIsolated` is `true` in the console. If it is false the simulation
   silently runs on copied buffers and the wall never moves.
2. A poster request (`/media/high/dds/0.dds`) returns 200 with
   `content-type: image/vnd-ms.dds`, and a second request is a cache hit.
3. iOS: `functions/_middleware.js` upgrades Safari to `require-corp`. Media is
   same-origin here, so it needs no CORP of its own.

## Refreshing the data later

The pipeline writes both halves; they are indexed by wall position and must move
together.

```bash
pnpm anime:kitsu && pnpm anime:mal && pnpm anime:popularity   # refresh sources
pnpm anime:order && pnpm anime:posters && pnpm anime:atlases  # rebuild
pnpm anime:check                                              # fingerprints agree
rclone copy public/media r2:plan-to-watch-media --checksum --transfers=32
rclone copy public/json  r2:plan-to-watch-media/json --checksum --transfers=32
```

No redeploy is needed unless the app itself changed - but bump the layer counts in
`.env.production` and redeploy if `anime:atlases` reports different ones.
