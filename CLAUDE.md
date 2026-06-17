# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Link Trace** (manifest id: `link-trace`) is a desktop-only Obsidian plugin that renders a single
Markdown note (optionally plus its directly-linked notes) into a self-contained static HTML page, then
either **exports it to a local folder** or **publishes it to Alibaba Cloud OSS** as a short link and
tracks page views via a self-hosted **GoatCounter** instance (see [Analytics backend](#analytics-backend)).

## Commands

```bash
pnpm dev          # esbuild watch build (inline sourcemap) → main.js
pnpm build        # production build (no sourcemap) → main.js
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (one shot)
pnpm vitest run src/note-hash.test.ts   # run a single test file
```

Per the user's global instructions: **after any code change, run `pnpm build` and deploy** `main.js`,
`manifest.json`, `styles.css` to the local vault at
`/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/link-trace/`.
Enabled plugins hot-reload automatically.

Note: `package.json` `version` (0.1.5) and `manifest.json` `version` (0.1.6) are bumped via the
`/obsidian-publish` flow; `manifest.json` is the source of truth users see.

## Architecture

`main.ts` is the `Plugin` subclass and orchestrator. It owns settings, the status-bar share icon, and
the publish/unpublish/update/export flows. Everything else lives in `src/`.

**The core pipeline** (publish and local export share it):

1. `renderer.ts` `renderNote()` — the heart of the plugin. Strips frontmatter, resolves `.base` embeds,
   then renders Markdown to a **detached DOM element** via Obsidian's own `MarkdownRenderer.render()`.
   It then post-processes that DOM: extracts/restores `$…$`/`$$…$$` math as KaTeX placeholders, polls
   for async renderers (mermaid → SVG), replaces base-embed placeholders, wraps tables, and collects
   image `TFile`s while rewriting `img[src]` to relative `images/{name}` paths. Returns `{ html, css, images }`.
2. `exporter.ts` `prepareExport()` wraps `renderNote` + `buildHtml()` into an `ExportResult`. It also
   owns short-link **name generation** (`generateUniqueName`, base36, auto-widens near saturation) and
   **internal link rewriting** (`rewriteInternalLinks` rewrites `<a data-href>` to point at sibling
   exported pages, or to `#` when the target wasn't exported).
3. Destination:
   - `exporter.ts` `exportToLocal()` writes flat `{name}.html` files + `{name}/images/` folders to a
     user-configured absolute path (uses node `fs`/`path` — outside the vault, so `vault.adapter` can't help).
   - `oss.ts` `uploadToOss` / `uploadSubNoteToOss` / `deleteFromOss` push to Alibaba OSS via `ali-oss`,
     with per-type cache headers and gzip. KaTeX is **self-hosted to OSS once** (`ensureKatexAssets`,
     versioned path, idempotent HEAD check) rather than relying on a CDN.

**Linked-notes ("sub-notes") publishing** is two-pass: render all notes and build the full
basename/path → short-name map *first*, then rewrite links and upload, so cross-links resolve. Already-
published sub-notes are reused (their existing short name is parsed back out of the URL by `extractNoteName`).

**Publish state lives in note frontmatter**, not plugin data: `share_link`, `share_time`, and
`share_hash` (a hash of the body via `note-hash.ts`). The status bar compares the live editor/disk body
hash against `share_hash` to show **published (green) vs stale** state.

### Key modules

- `base-renderer.ts` — **hand-written Obsidian Bases engine**: parses `.base` YAML, evaluates filter
  expressions / formulas, renders list/table/cards to static HTML. Deliberately not replaced by native
  rendering — see `BASES-RENDER-DECISION.md` (native table view is hard-virtualized and can't be
  snapshotted). If touching base logic, read that decision first.
- `imgs-renderer.ts` — renders the [Image Cluster](https://github.com/musSpeaking/obsidian-image-layouts)
  `imgs` code-block gallery format.
- `analytics.ts` / `analytics-client.ts` — tracking-script injection into exported HTML, and reading
  back page-view stats for the share popover. Target the self-hosted **GoatCounter** instance; see
  [Analytics backend](#analytics-backend).
- `i18n.ts` — `t(key, replacements?)` translation; language set from settings. User-facing strings go here.
- `settings.ts` — `ShareOnlineSettings` + settings tab (OSS creds, export path, link length, analytics).
- `share-popover.ts` / `share-modal.ts` — the status-bar popover UI and the sub-note-selection modal.
- `stats-view.ts` — the **share-stats page**: a dedicated `ItemView` (`VIEW_TYPE_SHARE_STATS`, opened
  via a ribbon icon + the `open-share-stats` command) listing every published share page and its
  cumulative views. The page list is the canonical local record — `collectPublishedPages()` scans all
  notes' `share_link` frontmatter (so zero-view pages still appear); view counts come from one bulk
  `fetchAllPathHits()` call, joined by URL pathname. Pure join/sort logic (`buildStatsRows`,
  `parseHitsList`) lives in `analytics.ts` and is unit-tested.

### Analytics backend

Page-view tracking uses a **self-hosted [GoatCounter](https://www.goatcounter.com/)** instance
(privacy-friendly, cookieless, no cross-site tracking):

- **Dashboard / endpoint:** https://stats.viii.me
- **Tracking snippet** embedded in published pages:

  ```html
  <script data-goatcounter="https://stats.viii.me/count"
          async src="//stats.viii.me/count.js"></script>
  ```

- **Hosting:** Docker Compose on the project server (Tencent Cloud, `ubuntu@123.206.216.124`), image
  `arp242/goatcounter:latest`, behind the shared nginx with TLS. Config lives in `~/docker/compose.yml`
  (the `goatcounter` service) and `~/docker/nginx/conf.d/stats.viii.me.conf`; the Let's Encrypt cert
  auto-renews via certbot + a deploy hook. Backed by the shared PostgreSQL with an **isolated
  `goatcounter` database + role** (separate from the other apps). Admin login and DB password live on
  the server only — **never commit them to this repo**.
- **Reading view counts** for the share popover is done via GoatCounter's JSON API
  (`GET /api/v0/stats/hits` with `Authorization: Bearer <token>`, filtered to the page's path via
  `include_paths` + `path_by_name`). GoatCounter reports a single visitor `count` per path — there is
  no pageviews/visitors split, so the popover shows one number. Settings store
  `goatcounterEndpoint` (the count URL, e.g. `https://stats.viii.me/count`; the script src is that
  URL + `.js`, and the API base is its origin + `/api/v0`) and `goatcounterApiToken`.

### Build specifics

- esbuild bundles `main.ts` → `main.js` (CJS, es2018). `obsidian`, electron, `@codemirror/*` and node
  builtins are external.
- `ali-oss` pulls in transitive deps that call `child_process`; these are aliased to no-op **stubs** in
  `src/stubs/` (`address.js`, `win-release.js`) so the bundle works inside Obsidian. `ali-oss.d.ts`
  provides minimal typings.

### Testing

Vitest runs in node env with `obsidian` aliased to the **minimal mock** in `src/__mocks__/obsidian.ts`
(only the symbols imported by tested modules — extend it when a test needs more). Tested units are the
pure logic: `note-hash`, `analytics`, and `base-renderer` (expression/filter evaluation). DOM-rendering
code (`renderNote`) is not unit-tested since it needs a real Obsidian host.
