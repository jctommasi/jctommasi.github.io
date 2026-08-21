# jctommasi.github.io

Juan Cruz Tommasi's personal portfolio — a single-page, Matrix-themed WebGL
scrollytelling site. Built with **Astro 6** (static output), bilingual with
English at `/` and Spanish at `/es/`, and deployed to **GitHub Pages** at
<https://jctommasi.github.io>.

## Requirements

- **Node 22.12.0** — pinned in [`.nvmrc`](.nvmrc) (Astro 6's minimum). Run
  `nvm use` to match it.
- **npm** — this project uses npm only; there is no pnpm/yarn lockfile.

## Local development

```bash
npm ci          # install exactly what package-lock.json pins
npm run dev      # dev server on http://localhost:4321
npm run build    # static build to dist/ (what CI ships)
npm run preview  # serve the production build locally
npm run check    # astro check — typecheck (strict TS)
```

The quality bar for every change is `npm run check` and `npm run build` both
green.

## Deployment

Every push to `main` triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which:

1. checks out the repo,
2. installs Node from `.nvmrc` (22.12.0) with an npm cache,
3. runs `npm ci` then `npm run build` (Astro emits `dist/`, including
   `.nojekyll` and content-hashed `_astro/` assets),
4. uploads `dist/` as a Pages artifact, and
5. deploys it to GitHub Pages.

The build is reproducible locally with `npm ci && npm run build`.

> **One-time setup:** in the repository settings under **Settings → Pages**, set
> **Source** to **GitHub Actions** so this workflow can publish.

### Rollback

GitHub Pages serves the most recent successful deploy. To revert to an earlier
known-good build, **re-run that commit's workflow**:

1. Open the **Actions** tab and select the **Deploy** workflow.
2. Find the run for the last good commit (runs are listed by commit).
3. Click **Re-run all jobs**.

That rebuilds and redeploys that exact commit, making it live again. (No code
change or force-push is needed — the redeploy supersedes the bad one.)

## Launch verification

The v1 launch gate — cross-browser matrix, CI gates, Lighthouse status, CV
download honesty, and the live-deploy checklist — is recorded in
[`LAUNCH.md`](LAUNCH.md). The remaining go-live steps (merge to `main`, set
**Pages Source = "GitHub Actions"**) and the owner-run pins (Lighthouse,
Firefox/Safari/iOS/Android) are listed there.

## Project layout

See [`CLAUDE.md`](CLAUDE.md) for the full directory map and project policies.
The four seed JSON files in `src/data/` are the single source of truth for all
rendered content.
