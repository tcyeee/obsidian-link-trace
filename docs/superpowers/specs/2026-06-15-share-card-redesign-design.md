# Share Card Redesign — Design

**Date:** 2026-06-15
**Component:** `src/share-banner.ts` + `.opal-share-banner*` styles in `styles.css`

## Goal

Replace the current three-labeled-row share banner with a richer, more
"product-like" card, and make the card's width track the note's readable
content column instead of spanning the full editor width.

## Background

The banner is injected at runtime into a shared note's `MarkdownView`. It is
never written to the file and never exported. `ShareBanner.refresh()` rebuilds
it on every relevant view/content change. It shows three pieces of data:

- the share URL (with a copy button),
- the publish time (`share_time` frontmatter),
- a fresh/stale status derived from comparing the current body hash against
  `share_hash`, with an "update / re-publish" button when stale.

The redesign changes only presentation and mount point. The data, the
fresh/stale logic, copy behavior, and the update action are unchanged.

## Visual Design (direction D — rich card)

The card has three vertical zones:

1. **Header row**
   - Rounded square **icon avatar** (globe / `globe` icon via `setIcon`).
   - **Title**: `t("banner.title")` — e.g. "已发布到网络" / "Published online".
   - **Subline**: localized publish time (`已发布 {time}`), muted, smaller.
   - **Status badge** (right-aligned): "已是最新" when fresh, "待更新" when stale.

2. **URL row**
   - The share link inside a boxed/framed field (own background + border +
     radius), truncated with ellipsis, opening in a new tab.
   - **Copy icon** at the right of the field. Same click behavior as today
     (writes to clipboard, shows `t("banner.copied")` Notice).

3. **Footer row** — *rendered only when stale*
   - Left: hint text, e.g. "内容已修改，建议重新发布".
   - Right: **re-publish button** → calls `plugin.updateNoteFromBanner(file)`.
   - When fresh, the footer is omitted entirely so the card stays calm.

### State treatment

| Element       | Fresh                       | Stale                        |
|---------------|-----------------------------|------------------------------|
| Icon tint     | success (green) tint        | accent tint                  |
| Badge         | "已是最新", success color    | "待更新", warning color       |
| Footer        | hidden                      | hint + re-publish button     |

### Theming constraints

- All colors use Obsidian CSS variables: `--interactive-accent`,
  `--text-success`, `--text-warning`, `--text-muted`, `--text-normal`,
  `--background-secondary`, `--background-primary`, `--background-modifier-border`.
- Tinted backgrounds for the icon/badge use the existing translucent accent
  variables where available (e.g. `--background-modifier-*`), otherwise a
  layered token — **no hardcoded hex, no `!important`** (passes
  `obsidian-plugin-lint`).
- 6-digit hex only if any literal color is unavoidable (prefer variables).

## Width Matching

**Problem:** the banner is currently `view.contentEl.prepend(banner)`, where
`contentEl` is `.view-content` (full editor width). It does not align with the
text column.

**Approach:** mount the banner into the active mode's **content sizer**, which
already carries Obsidian's readable-line-length geometry:

- Reading view → `.markdown-preview-sizer`
- Editing / live preview → `.cm-sizer`

Resolution order in `render()`:

1. Find the sizer inside `view.contentEl`
   (`.markdown-preview-sizer` or `.cm-sizer`, whichever is present/visible).
2. `prepend` the banner into it so it inherits the content width.
3. **Fallback:** if no sizer is found, `prepend` into `view.contentEl` (current
   behavior) so the banner never disappears.

The card itself is `width: auto` (fills its parent), so width tracking is
entirely a function of the mount point. This also works when "readable line
length" is disabled — the sizer simply fills the available width and the card
follows.

**CodeMirror caveat:** CM6 owns `.cm-sizer` and may remove injected nodes on
some updates. The existing `refresh()` already re-runs on view/content changes
(it is wired in the plugin lifecycle), which re-mounts the banner, so transient
removal self-heals. No new event wiring is required.

## Components / Boundaries

- `ShareBanner.render()` — rebuilt to emit the new DOM structure and to resolve
  the mount point. Signature unchanged.
- `ShareBanner.refresh()` / `remove()` — unchanged.
- `styles.css` — the `.opal-share-banner*` block is replaced with the new card
  styles. Class names extended:
  - `.opal-share-banner` (card), `--stale` / `--fresh` modifiers
  - `-header`, `-icon`, `-title`, `-subline`, `-badge`
  - `-urlrow`, `-url`, `-copy`
  - `-footer`, `-hint`, `-update`
- `i18n.ts` — add/adjust keys: `banner.title`, `banner.published` (time
  template), `banner.status.fresh`, `banner.status.stale`, `banner.hint.stale`,
  `banner.btn.update` (reuse), `banner.copy`, `banner.copied`. Keep both
  `en` and `zh` entries.

## Out of Scope

- No change to share/publish logic, hashing, or exporter.
- No change to the share modal or settings.
- No new settings toggle (existing `shareBannerEnabled` still gates it).

## Testing / Verification

- Existing tests (`note-hash`, `analytics`) remain green.
- Manual verification in the local vault (per project deploy flow):
  - Fresh note → green badge, no footer, width matches text column.
  - Edit body → stale: amber badge + footer + re-publish button appears.
  - Copy button copies URL and shows Notice.
  - Toggle "readable line length" off → card still aligns with content.
  - Reading view and live preview both render and align correctly.
  - Light and dark themes both legible.
