# 分享提示框 (Share Banner) — Design

**Date:** 2026-06-15
**Status:** Approved (design)

## Goal

When a note is currently shared (has a `share_link`), and the feature is enabled
in settings, show a banner at the top of that note's view inside Obsidian. The
banner displays the share URL and the publish time, and detects whether the live
(online) version is stale relative to the current note body — offering an inline
**更新 / Update** button when it is.

The banner is a **runtime DOM element injected into the Obsidian view**. It is
never written into the `.md` file, so it can never leak into the exported /
published HTML. This satisfies the "导出时要避开这个窗口" requirement structurally,
with no special export-time handling.

## Non-Goals

- No close/dismiss button — the banner always shows for shared notes when enabled.
- No new persistence beyond the three frontmatter fields below.
- No change to the OSS upload / export pipeline itself.

## Decisions (confirmed)

| Topic | Decision |
|-------|----------|
| Banner mechanism | Runtime DOM injection (never in file) |
| View modes | Reading **and** editing (live-preview + source) |
| Metadata storage | Frontmatter fields on the note |
| State refresh | Real-time while editing, debounced (~500ms) |
| Closable | No — always visible for shared notes when enabled |

## Data Model

Three frontmatter fields, written together on publish/update, removed together on
unpublish:

- `share_link` — already exists today.
- `share_time` — ISO-8601 timestamp of the most recent successful publish/update.
- `share_hash` — short hash of the note **body**.

### What gets hashed

The hash is computed over the post-frontmatter body, using the same strip the
renderer already applies (`renderer.ts:146`):

```ts
const body = raw.replace(/^---[\s\S]*?---\n?/, "");
const hash = hashBody(body); // djb2/FNV-1a, hex string — no crypto dependency
```

Hashing the body (not the frontmatter) is deliberate: writing `share_time` /
`share_hash` into frontmatter changes the frontmatter but **not** the body, so the
freshly-written hash still matches the current body. No self-invalidation, no
update loop. It also mirrors exactly what the publish pipeline ships (the renderer
strips frontmatter before rendering), so "hash matches" ⇔ "online body matches
local body".

A small pure helper lives next to the exporter:

```ts
// stable, fast, dependency-free
export function hashBody(body: string): string { /* djb2 → base36/hex */ }
export function stripFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\n?/, "");
}
```

`renderer.ts:146` is refactored to call `stripFrontmatter` so the strip logic has
one source of truth.

## Settings

New field on `ShareOnlineSettings`:

```ts
shareBannerEnabled: boolean; // default false
```

Rendered as a toggle in the **导出设置 / Export Settings** section of
`settings.ts`, below the existing toggles:

- name: "在分享的笔记中显示提示框" / "Show banner on shared notes"
- desc: explains it appears at the top of shared notes inside Obsidian and is never
  exported.

When the toggle changes, the plugin re-renders the banner for the active view
immediately.

## Components

### `src/share-banner.ts` — `ShareBanner`

A small class owned by the plugin, responsible only for mounting/refreshing/
removing the banner DOM for the active markdown view. Public surface:

- `refresh()` — recompute and (re)render the banner for the currently active
  `MarkdownView`. Removes any existing banner first; mounts a fresh one only if
  `settings.shareBannerEnabled` **and** the active file has a `share_link`.
- `remove()` — tear down any mounted banner (used on unload).

Responsibilities:

- **Mount point:** insert the banner element as the first child of the view's
  content container so it sits above the note in both reading and editing modes.
  Re-applied on `active-leaf-change` and `layout-change` (mode switches recreate
  the view content, so the banner is re-mounted by `refresh()`).
- **Rendering:** build banner DOM (Obsidian `createDiv`/`createSpan`/`setIcon`),
  no innerHTML. All styling via classes in `styles.css`.
- **Content:**
  - URL row — the `share_link`, clickable (opens externally) + copy icon.
  - Time row — `share_time`, human-formatted.
  - Status:
    - current body hash === `share_hash` → muted "已是最新 / Up to date".
    - mismatch → warning "线上版本已滞后 / Online version is outdated" + an
      **更新 / Update** button that calls the plugin's update flow, then refreshes
      the banner.

### `main.ts` wiring

- Construct one `ShareBanner` in `onload`.
- Call `banner.refresh()` from:
  - `active-leaf-change` (already registered for the status bar).
  - `metadataCache.changed` for the active file (already registered).
  - a debounced (~500ms) editor-change listener (`editor-change` workspace event)
    so the stale/fresh status updates live as the user types.
  - the settings toggle's `onChange`.
  - after `doPublish` / `updateNote` / `doUnpublish` succeed.
- `updateNote(file)` is made callable by the banner (e.g. a public
  `updateNoteFromBanner(file)` wrapper, or widen visibility) so the Update button
  reuses the exact existing update path.
- `doPublish` and `updateNote` write `share_time` + `share_hash` alongside
  `share_link` (extend `setShareLink` → a `setShareMeta(file, url, time, hash)`).
- `doUnpublish` / `removeShareLink` also strips `share_time` + `share_hash`.

## i18n

New keys (zh + en) in `src/i18n.ts`:

- `settings.shareBanner.name` / `settings.shareBanner.desc`
- `banner.url.label`, `banner.time.label`
- `banner.status.fresh` ("已是最新" / "Up to date")
- `banner.status.stale` ("线上版本已滞后" / "Online version is outdated")
- `banner.btn.update` ("更新" / "Update")
- `banner.copied` (copy-confirmation notice/tooltip)

## Styling

New classes in `styles.css` (must pass the obsidian-plugin-lint skill: no
`!important`, full 6-digit hex, no duplicate selectors, theme variables where
possible):

- `.opal-share-banner` — container (top of view, subtle background via theme vars).
- `.opal-share-banner-url`, `.opal-share-banner-time`.
- `.opal-share-banner--stale` modifier — warning accent.
- `.opal-share-banner-update` — the update button.

Banner uses Obsidian CSS variables (`--background-secondary`, `--text-muted`,
`--text-warning`, etc.) so it adapts to themes.

## Error Handling / Edge Cases

- Note has `share_link` but missing `share_time`/`share_hash` (published before this
  feature existed): render URL row; show status as "未知 → treat as stale" so the
  user can re-publish to backfill the hash. (Simplest correct behavior; uses the
  stale branch.)
- Active file is not markdown / has no `share_link` / feature disabled → no banner.
- View content container not found (rare race during layout change) → no-op, next
  `refresh()` recovers.
- Banner element from a previous file must be removed before mounting a new one to
  avoid duplicates on rapid leaf changes.

## Export Safety

No export code changes are required: the banner is injected into the live view DOM
only, never into the note file, and `prepareExport` reads the raw file from disk.
The new frontmatter fields are stripped by `renderer.ts:146` before rendering, so
they do not appear in published pages.

## Testing

- Unit: `hashBody` stability (same body → same hash; body change → different hash;
  frontmatter-only change → same hash). `stripFrontmatter` correctness.
- Manual (per CLAUDE.md deploy step): publish a note → banner shows URL + time +
  "已是最新"; edit body → banner flips to "线上版本已滞后" with Update button; click
  Update → banner returns to fresh, time updates; unpublish → banner disappears and
  frontmatter fields removed; disable setting → banner disappears; export a shared
  note → published HTML contains neither the banner nor the share_* fields.
