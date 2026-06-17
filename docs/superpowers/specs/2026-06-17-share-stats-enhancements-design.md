# 分享统计页面增强 — Design

Date: 2026-06-17
Scope: enhance the Share Stats view (`stats-view.ts`) with stat cards, a URL column, and a
per-page detail modal showing all GoatCounter-readable dimensions.

## Goals

1. **Top summary as stat cards** — two prominent cards: 正在分享页数 + 总浏览量 (replacing the
   current inline summary line).
2. **Richer table** — add a **URL** column (short-link path, click-to-open) alongside the existing
   views and published-time columns.
3. **Per-page detail modal** — clicking a table row opens a modal that shows every dimension
   GoatCounter can read for that single page, with an entrance animation and a dimmed background
   mask.

## GoatCounter capability (verified against `/api.json`)

All `/api/v0/stats/<page>` endpoints accept `include_paths` + `path_by_name`, so each dimension is
scopeable to one page:

| Data | Endpoint | Notes |
|---|---|---|
| Overview + daily trend | `stats/hits?daily=true&include_paths=<path>&path_by_name=true` | `hits[0].count` total; `hits[0].stats[]` = `{day, daily}[]` |
| Referrers | `stats/toprefs?include_paths=<path>&path_by_name=true` | ranked `stats[]` = `{name, count}[]` |
| Browsers / Systems / Sizes / Locations / Languages | `stats/<page>?include_paths=<path>&path_by_name=true` | same `stats[]` shape |

Each `<page>` response is `{ stats: [{ name, count, id? }], more }`. The daily trend is limited to
the **last 30 days** for a readable chart.

## Architecture

**Pure layer (`analytics.ts`, unit-tested)** — no `obsidian` import:
- `parseDimensionStats(json): DimensionItem[] | null` — parses the `{ stats: [{name,count}] }`
  shape shared by toprefs/browsers/systems/sizes/locations/languages.
- `parseDailySeries(json): DailyPoint[] | null` — parses `hits[0].stats[]` → `{day, count}[]`.
- New types: `DimensionItem {name, count}`, `DailyPoint {day, count}`, `PageDetail` aggregate.
- A small date helper for the 30-day window start.

**Network layer (`analytics-client.ts`)**:
- `fetchPageDetail(settings, shareLink): Promise<PageDetail | null>` — fires the 7 calls in
  parallel (`Promise.all`), each failure degrading to an empty section (never fails the whole
  modal); returns `null` only when unconfigured / invalid link. Reuses `deriveApiBase`,
  `extractPathname`, `canReadAnalytics`, the `Bearer` header pattern, and `STATS_START`-style
  window logic from the existing client.

**View (`stats-view.ts`)**:
- Header: render two `.opal-stat-card` elements instead of the inline `.opal-stats-summary`.
  When counts are unavailable, the views card shows `—`.
- Table: insert a URL column; make each `<tr>` clickable → `new StatsDetailModal(...).open()`.
  Preserve the in-cell open-note / open-link affordances (stop propagation so they don't also
  trigger the row modal).

**Modal (`src/stats-detail-modal.ts`, extends Obsidian `Modal`)**:
- Obsidian `Modal` provides the dimmed `.modal-bg` mask for free; a CSS class adds a scale+fade
  entrance animation.
- Layout: header (title / clickable URL / 发布时间) → overview number → inline-SVG bar sparkline of
  the daily series → six ranked mini-lists (来源, 浏览器, 系统, 国家地区, 语言, 屏幕尺寸).
- Loading state during the parallel fetch; per-section empty state when a dimension has no data.
- No charting dependency — the sparkline is hand-drawn SVG (desktop-only, keeps the bundle clean).

**Styles (`styles.css`)** — `opal-` prefix, plugin-lint compliant (full 6-digit hex, no
`!important`, theme variables): stat cards, URL column, modal grid + animation keyframes, mini bar
rows.

**i18n (`i18n.ts`)** — new `stats.card.*`, `stats.col.url`, `stats.detail.*` (the six dimension
section titles, overview/trend labels, loading/empty) keys in both zh and en.

## Testing

Unit tests (vitest) for the new pure parsers in `analytics.test.ts`: `parseDimensionStats` and
`parseDailySeries` — happy path, missing/edge fields, structural failure → null. DOM/modal rendering
is not unit-tested (needs a real Obsidian host), matching the existing convention.

## Non-goals

- Per-page time-range selector (fixed 30-day trend; all-time overview number).
- Pageviews/visitors split (GoatCounter exposes a single count).
- Caching detail responses across modal opens (fetch fresh each open — simple, always current).
