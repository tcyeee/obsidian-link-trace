# Share Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat three-row share banner with a richer "direction D" card (icon + title/time + status badge + framed URL + stale-only footer) and make it align to the note's readable content column.

**Architecture:** Pure presentation change inside `src/share-banner.ts` (`render()`) plus a new exported `resolveBannerMount()` helper that picks the content-sizer mount point. New i18n keys in `src/i18n.ts`. New CSS block in `styles.css` using Obsidian theme variables only. Data/hashing/copy/update logic is unchanged.

**Tech Stack:** TypeScript, Obsidian API (`createDiv`/`setIcon`/`setTooltip`), esbuild build, Vitest (node env), pnpm.

---

## File Structure

- `src/share-banner.ts` — add exported `resolveBannerMount()`; rewrite `render()` DOM. (modify)
- `src/share-banner.test.ts` — new unit test for `resolveBannerMount()`. (create)
- `src/i18n.ts` — add/adjust `banner.*` keys for both `zh` and `en`. (modify)
- `styles.css` — replace the `.opal-share-banner*` block. (modify)

Visual styling is verified manually via the vault deploy flow (Task 5); the only logic unit-tested is the mount-point resolution, which is the one piece with branching behavior.

---

### Task 1: Mount-point resolution helper

**Files:**
- Modify: `src/share-banner.ts`
- Test: `src/share-banner.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/share-banner.test.ts`. Tests run in node (no real DOM), so use a
minimal stub exposing only `querySelector`:

```ts
import { describe, expect, it } from "vitest";
import { resolveBannerMount } from "./share-banner";

function fakeEl(matches: Record<string, unknown>): HTMLElement {
	return {
		querySelector: (sel: string) => matches[sel] ?? null,
	} as unknown as HTMLElement;
}

describe("resolveBannerMount", () => {
	it("prefers the reading-view preview sizer", () => {
		const preview = {} as HTMLElement;
		const cm = {} as HTMLElement;
		const contentEl = fakeEl({
			".markdown-preview-sizer": preview,
			".cm-sizer": cm,
		});
		expect(resolveBannerMount(contentEl)).toBe(preview);
	});

	it("falls back to the editor cm-sizer", () => {
		const cm = {} as HTMLElement;
		const contentEl = fakeEl({ ".cm-sizer": cm });
		expect(resolveBannerMount(contentEl)).toBe(cm);
	});

	it("falls back to contentEl when no sizer exists", () => {
		const contentEl = fakeEl({});
		expect(resolveBannerMount(contentEl)).toBe(contentEl);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/share-banner.test.ts`
Expected: FAIL — `resolveBannerMount` is not exported / not defined.

- [ ] **Step 3: Add the helper**

In `src/share-banner.ts`, add this exported function below the `BANNER_CLASS`
constant (above the class):

```ts
/**
 * Pick the element the banner should mount into so it inherits the note's
 * readable content width. Reading view uses `.markdown-preview-sizer`;
 * editing / live preview uses `.cm-sizer`. Falls back to contentEl so the
 * banner never disappears if neither sizer is present.
 */
export function resolveBannerMount(contentEl: HTMLElement): HTMLElement {
	return (
		contentEl.querySelector<HTMLElement>(".markdown-preview-sizer") ??
		contentEl.querySelector<HTMLElement>(".cm-sizer") ??
		contentEl
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/share-banner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/share-banner.ts src/share-banner.test.ts
git commit -m "feat: add resolveBannerMount for content-width alignment"
```

---

### Task 2: i18n keys for the new card

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 1: Update the zh banner block**

In `src/i18n.ts`, replace the existing zh banner block (currently lines ~92-98,
the seven `"banner.*"` entries ending before the closing `};` of `zh`) with:

```ts
	"banner.title": "已发布到网络",
	"banner.published": "发布于 {time}",
	"banner.badge.fresh": "已是最新",
	"banner.badge.stale": "待更新",
	"banner.hint.stale": "内容已修改，建议重新发布",
	"banner.btn.update": "重新发布",
	"banner.copied": "链接已复制",
	"banner.copy": "复制链接",
```

- [ ] **Step 2: Update the en banner block**

In `src/i18n.ts`, replace the existing en banner block (currently lines ~188-194,
the `"banner.*"` entries in the `en` object) with:

```ts
	"banner.title": "Published online",
	"banner.published": "Published {time}",
	"banner.badge.fresh": "Up to date",
	"banner.badge.stale": "Needs update",
	"banner.hint.stale": "Content changed — re-publish recommended",
	"banner.btn.update": "Re-publish",
	"banner.copied": "Link copied",
	"banner.copy": "Copy link",
```

Note: the old `banner.url.label`, `banner.time.label`, `banner.status.fresh`,
and `banner.status.stale` keys are intentionally removed — the new card has no
inline labels and uses badge text instead. They are only consumed by
`share-banner.ts`, which Task 3 rewrites.

- [ ] **Step 3: Verify the project still type-checks / tests pass**

Run: `pnpm vitest run`
Expected: PASS (existing note-hash + analytics tests, plus Task 1's tests).

- [ ] **Step 4: Commit**

```bash
git add src/i18n.ts
git commit -m "feat: i18n keys for redesigned share card"
```

---

### Task 3: Rewrite the banner DOM

**Files:**
- Modify: `src/share-banner.ts` (the `render()` method)

- [ ] **Step 1: Replace the `render()` method body**

In `src/share-banner.ts`, replace the entire `render(...)` method (currently
lines ~53-110) with the version below. The signature is unchanged.

```ts
	private render(
		view: MarkdownView,
		file: TFile,
		shareLink: string,
		shareTime: string,
		stale: boolean
	): void {
		const banner = createDiv({ cls: BANNER_CLASS });
		banner.addClass(stale ? `${BANNER_CLASS}--stale` : `${BANNER_CLASS}--fresh`);

		// Header: icon avatar + title/time + status badge
		const header = banner.createDiv({ cls: "opal-share-banner-header" });
		const icon = header.createDiv({ cls: "opal-share-banner-icon" });
		setIcon(icon, "globe");
		const headText = header.createDiv({ cls: "opal-share-banner-headtext" });
		headText.createDiv({ cls: "opal-share-banner-title", text: t("banner.title") });
		const publishedAt = shareTime ? new Date(shareTime) : null;
		if (publishedAt && !isNaN(publishedAt.getTime())) {
			headText.createDiv({
				cls: "opal-share-banner-subline",
				text: t("banner.published", { time: publishedAt.toLocaleString() }),
			});
		}
		header.createSpan({
			cls: "opal-share-banner-badge",
			text: stale ? t("banner.badge.stale") : t("banner.badge.fresh"),
		});

		// URL row: framed link + copy button
		const urlRow = banner.createDiv({ cls: "opal-share-banner-urlrow" });
		const link = urlRow.createEl("a", {
			cls: "opal-share-banner-url",
			text: shareLink,
			href: shareLink,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");
		const copyBtn = urlRow.createDiv({ cls: "opal-share-banner-copy" });
		setIcon(copyBtn, "copy");
		setTooltip(copyBtn, t("banner.copy"));
		copyBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			await navigator.clipboard.writeText(shareLink);
			new Notice(t("banner.copied"));
		});

		// Footer: hint + re-publish, only when stale
		if (stale) {
			const footer = banner.createDiv({ cls: "opal-share-banner-footer" });
			footer.createSpan({ cls: "opal-share-banner-hint", text: t("banner.hint.stale") });
			const updateBtn = footer.createEl("button", {
				cls: "opal-share-banner-update",
				text: t("banner.btn.update"),
			});
			updateBtn.addEventListener("click", () => {
				void this.plugin.updateNoteFromBanner(file);
			});
		}

		resolveBannerMount(view.contentEl).prepend(banner);
	}
```

- [ ] **Step 2: Verify build compiles**

Run: `pnpm build`
Expected: build succeeds, no TypeScript errors. (`setIcon`, `setTooltip`,
`Notice`, `MarkdownView`, `TFile` are already imported at the top of the file.)

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/share-banner.ts
git commit -m "feat: render redesigned share card DOM"
```

---

### Task 4: Card styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Replace the banner CSS block**

In `styles.css`, replace the entire block from the comment
`/* ── Share banner (in-editor, never exported) ── */` through the end of
`.opal-share-banner-update { ... }` (currently lines ~195-240) with:

```css
/* ── Share banner (in-editor, never exported) ── */
.opal-share-banner {
  margin: 8px 0 16px 0;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  font-size: 13px;
}
.opal-share-banner-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 11px;
}
.opal-share-banner-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
}
.opal-share-banner-icon svg {
  width: 16px;
  height: 16px;
}
.opal-share-banner--fresh .opal-share-banner-icon {
  color: var(--text-success);
  background: var(--background-modifier-success);
}
.opal-share-banner--stale .opal-share-banner-icon {
  color: var(--interactive-accent);
  background: var(--background-modifier-hover);
}
.opal-share-banner-headtext {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.opal-share-banner-title {
  font-weight: 600;
  color: var(--text-normal);
}
.opal-share-banner-subline {
  font-size: 12px;
  color: var(--text-muted);
}
.opal-share-banner-badge {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
}
.opal-share-banner--fresh .opal-share-banner-badge {
  color: var(--text-success);
  background: var(--background-modifier-success);
}
.opal-share-banner--stale .opal-share-banner-badge {
  color: var(--text-warning);
  background: var(--background-modifier-hover);
}
.opal-share-banner-urlrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}
.opal-share-banner-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.opal-share-banner-copy {
  display: flex;
  flex-shrink: 0;
  cursor: pointer;
  color: var(--text-muted);
}
.opal-share-banner-copy:hover {
  color: var(--text-normal);
}
.opal-share-banner-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
}
.opal-share-banner-hint {
  font-size: 12px;
  color: var(--text-muted);
}
.opal-share-banner-update {
  margin-left: auto;
  flex-shrink: 0;
  cursor: pointer;
}
```

- [ ] **Step 2: Lint the CSS**

Invoke the `obsidian-plugin-lint` skill (or eyeball): no `!important`, all colors
are CSS variables (no literal hex), no duplicate selectors. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: redesigned share card styles"
```

---

### Task 5: Build, deploy to vault, verify

**Files:** none (build + manual verification)

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: success; `main.js` and `styles.css` regenerated at project root.

- [ ] **Step 2: Deploy to the local vault**

Per CLAUDE.md, plugin id is `link-trace`. Copy artifacts:

```bash
DEST="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/link-trace"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
```

Expected: three files copied. Hot-reload reloads the enabled plugin
automatically.

- [ ] **Step 3: Manual verification in Obsidian**

Open a shared note and confirm:
- Fresh note → green icon tint + "已是最新" badge, **no** footer/button.
- Edit the body → card flips to stale: amber "待更新" badge + footer hint +
  "重新发布" button appears.
- Copy icon copies the URL and shows the "链接已复制" Notice.
- Card width lines up with the text column (not full editor width).
- Toggle Settings → Editor → "Readable line length" OFF → card still aligns
  with content width.
- Check both reading view and live preview.
- Check a light theme and a dark theme — text/badges legible.

- [ ] **Step 4: Commit the build artifacts**

```bash
git add main.js styles.css
git commit -m "chore: build redesigned share card"
```

---

## Notes on theming choices

- Badge/icon backgrounds use `--background-modifier-success` (fresh) and
  `--background-modifier-hover` (stale, neutral chip) because Obsidian has no
  standard `--background-modifier-warning` token; the amber `--text-warning`
  color carries the stale signal. This keeps the rule set hardcoded-hex-free and
  theme-adaptive.
- Width tracking is achieved purely by the mount point (`resolveBannerMount`);
  the card is `width: auto` and fills whatever sizer it lands in.
