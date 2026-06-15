# 分享提示框 (Share Banner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a runtime banner at the top of shared notes inside Obsidian (reading + editing) displaying the share URL, publish time, and a fresh/stale indicator with an inline Update button — never written into the file, never exported.

**Architecture:** A pure hash helper detects whether the current note body differs from the body that was last published (stored as a `share_hash` frontmatter field). A `ShareBanner` class injects/refreshes a DOM banner for the active `MarkdownView`. The plugin writes `share_time` + `share_hash` alongside `share_link` on publish/update and strips them on unpublish, and refreshes the banner on leaf/metadata/editor changes.

**Tech Stack:** TypeScript, Obsidian API, esbuild, Vitest (node env, pure-function tests only).

---

## File Structure

- **Create** `src/note-hash.ts` — pure `stripFrontmatter` + `hashBody` helpers (unit-tested).
- **Create** `src/note-hash.test.ts` — Vitest tests for the helpers.
- **Create** `src/share-banner.ts` — `ShareBanner` class (DOM injection/refresh).
- **Modify** `src/renderer.ts:146` — reuse `stripFrontmatter` (single source of truth).
- **Modify** `src/settings.ts` — add `shareBannerEnabled` field + default + toggle.
- **Modify** `src/i18n.ts` — new setting + banner keys (zh + en).
- **Modify** `main.ts` — write/remove share meta; construct + refresh banner; expose update.
- **Modify** `styles.css` — banner styling.

Only `src/note-hash.ts` is unit-testable in the node Vitest env. The Obsidian DOM/`MarkdownView` code (`share-banner.ts`, `main.ts` wiring) is verified manually via the build+deploy step (Task 8), matching how the existing `share-modal.ts` / `main.ts` are verified.

---

### Task 1: Pure hash helpers

**Files:**
- Create: `src/note-hash.ts`
- Test: `src/note-hash.test.ts`
- Modify: `src/renderer.ts:146`

- [ ] **Step 1: Write the failing test**

Create `src/note-hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripFrontmatter, hashBody } from "./note-hash";

describe("stripFrontmatter", () => {
	it("removes a leading frontmatter block", () => {
		const raw = "---\nshare_link: https://x/ab\n---\n# Title\nbody";
		expect(stripFrontmatter(raw)).toBe("# Title\nbody");
	});

	it("returns the input unchanged when there is no frontmatter", () => {
		expect(stripFrontmatter("# Title\nbody")).toBe("# Title\nbody");
	});
});

describe("hashBody", () => {
	it("is stable for identical input", () => {
		expect(hashBody("# Title\nbody")).toBe(hashBody("# Title\nbody"));
	});

	it("changes when the body changes", () => {
		expect(hashBody("# Title\nbody")).not.toBe(hashBody("# Title\nbody!"));
	});

	it("is unaffected by frontmatter-only changes once stripped", () => {
		const a = "---\nshare_link: https://x/ab\n---\n# Title\nbody";
		const b = "---\nshare_link: https://x/ab\nshare_time: 2026-06-15\nshare_hash: zzz\n---\n# Title\nbody";
		expect(hashBody(stripFrontmatter(a))).toBe(hashBody(stripFrontmatter(b)));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./note-hash"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/note-hash.ts`:

```ts
/** Remove a leading YAML frontmatter block — mirrors renderer.ts before render. */
export function stripFrontmatter(raw: string): string {
	return raw.replace(/^---[\s\S]*?---\n?/, "");
}

/**
 * Fast, dependency-free djb2 hash of the note body. Used only to detect whether
 * the local body differs from the body that was last published — not for security.
 */
export function hashBody(body: string): string {
	let h = 5381;
	for (let i = 0; i < body.length; i++) {
		h = ((h << 5) + h + body.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS (all `note-hash` tests green; existing tests still green).

- [ ] **Step 5: Refactor renderer to reuse stripFrontmatter**

In `src/renderer.ts`, add to the existing import block at the top of the file:

```ts
import { stripFrontmatter } from "./note-hash";
```

Then change line 146 from:

```ts
  let content = rawContent.replace(/^---[\s\S]*?---\n?/, "");
```

to:

```ts
  let content = stripFrontmatter(rawContent);
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/note-hash.ts src/note-hash.test.ts src/renderer.ts
git commit -m "feat: add note body hash helpers; reuse in renderer"
```

---

### Task 2: Settings field + toggle

**Files:**
- Modify: `src/settings.ts:7-22` (interface), `src/settings.ts:24-39` (defaults), `src/settings.ts:103-136` (Export section UI)
- Modify: `src/i18n.ts`

- [ ] **Step 1: Add the i18n keys**

In `src/i18n.ts`, add to the `zh` object (near the other `settings.*` keys):

```ts
	"settings.shareBanner.name": "在分享的笔记中显示提示框",
	"settings.shareBanner.desc": "已分享的笔记在 Obsidian 中顶部显示提示框（含链接、发布时间、滞后提醒）。该提示框只存在于编辑器，不会写入文件，也不会被导出。",
```

And the matching keys in the `en` object:

```ts
	"settings.shareBanner.name": "Show banner on shared notes",
	"settings.shareBanner.desc": "Shared notes show a banner at the top inside Obsidian (link, publish time, stale warning). The banner lives only in the editor — it is never written to the file or exported.",
```

- [ ] **Step 2: Add the settings field**

In `src/settings.ts`, in the `ShareOnlineSettings` interface, add after `includeLinkedNotes: boolean;` (line 9):

```ts
	shareBannerEnabled: boolean;
```

In `DEFAULT_SETTINGS`, add after `includeLinkedNotes: false,` (line 26):

```ts
	shareBannerEnabled: false,
```

- [ ] **Step 3: Add the toggle to the Export section**

In `src/settings.ts`, inside `buildUI()`, immediately after the `includeLinkedNotes` Setting block (the one ending at line 113, before the `pageLinkLength` Setting), insert:

```ts
		new Setting(exportDetails)
			.setName(t("settings.shareBanner.name"))
			.setDesc(t("settings.shareBanner.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.shareBannerEnabled)
					.onChange(async (value) => {
						this.plugin.settings.shareBannerEnabled = value;
						await this.plugin.saveSettings();
						void this.plugin.shareBanner.refresh();
					})
			);
```

(`this.plugin.shareBanner` is created in Task 7; this compiles only after Task 7, which is fine — it is committed together at the end. If running tasks strictly in order, run `pnpm typecheck` only after Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts src/i18n.ts
git commit -m "feat: add shareBannerEnabled setting + toggle"
```

---

### Task 3: i18n banner strings

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 1: Add zh keys**

In `src/i18n.ts`, add to the `zh` object:

```ts
	"banner.url.label": "分享链接",
	"banner.time.label": "发布于",
	"banner.status.fresh": "线上版本已是最新",
	"banner.status.stale": "线上版本已滞后",
	"banner.btn.update": "更新",
	"banner.copied": "链接已复制",
```

- [ ] **Step 2: Add en keys**

In `src/i18n.ts`, add to the `en` object:

```ts
	"banner.url.label": "Share link",
	"banner.time.label": "Published",
	"banner.status.fresh": "Online version is up to date",
	"banner.status.stale": "Online version is outdated",
	"banner.btn.update": "Update",
	"banner.copied": "Link copied",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n.ts
git commit -m "feat: add share banner i18n strings"
```

---

### Task 4: Share metadata write/remove in plugin

**Files:**
- Modify: `main.ts:110-120` (frontmatter helpers), `main.ts:274`, `main.ts:287`, `main.ts:311`, `main.ts:324`

- [ ] **Step 1: Import the hash helpers**

In `main.ts`, extend the exporter import (line 3) to also pull the hash helpers, OR add a new import line:

```ts
import { hashBody, stripFrontmatter } from "./src/note-hash";
```

- [ ] **Step 2: Replace setShareLink / removeShareLink with meta-aware versions**

In `main.ts`, replace the existing `setShareLink` (lines 110-114) and `removeShareLink` (lines 116-120) with:

```ts
	private async setShareMeta(file: TFile, url: string): Promise<void> {
		const raw = await this.app.vault.read(file);
		const hash = hashBody(stripFrontmatter(raw));
		const time = new Date().toISOString();
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["share_link"] = url;
			fm["share_time"] = time;
			fm["share_hash"] = hash;
		});
	}

	private async removeShareMeta(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			delete fm["share_link"];
			delete fm["share_time"];
			delete fm["share_hash"];
		});
	}
```

- [ ] **Step 3: Update the call sites**

In `main.ts`, replace each occurrence:
- Line 274 `await this.setShareLink(sn.file, subUrl);` → `await this.setShareMeta(sn.file, subUrl);`
- Line 287 `await this.setShareLink(file, url);` → `await this.setShareMeta(file, url);`
- Line 311 `await this.removeShareLink(sn.file);` → `await this.removeShareMeta(sn.file);`
- Line 324 `await this.removeShareLink(file);` → `await this.removeShareMeta(file);`

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -n "setShareLink\|removeShareLink" main.ts`
Expected: no output (all replaced).

- [ ] **Step 5: Commit**

```bash
git add main.ts
git commit -m "feat: store share_time + share_hash with share_link"
```

---

### Task 5: ShareBanner component

**Files:**
- Create: `src/share-banner.ts`

- [ ] **Step 1: Implement the banner**

Create `src/share-banner.ts`:

```ts
import { MarkdownView, Notice, TFile, setIcon, setTooltip } from "obsidian";
import type ShareOnlinePlugin from "../main";
import { t } from "./i18n";
import { hashBody, stripFrontmatter } from "./note-hash";

const BANNER_CLASS = "opal-share-banner";

/**
 * Injects a runtime banner at the top of a shared note's MarkdownView (reading and
 * editing). The banner lives only in the view DOM — it is never written to the file
 * and therefore never exported. Call refresh() on every relevant view/content change.
 */
export class ShareBanner {
	constructor(private plugin: ShareOnlinePlugin) {}

	/** Remove every banner this plugin has mounted, anywhere in the workspace. */
	remove(): void {
		this.plugin.app.workspace.containerEl
			.querySelectorAll(`.${BANNER_CLASS}`)
			.forEach((el) => el.remove());
	}

	/** Rebuild the banner for the active MarkdownView, or remove it if not applicable. */
	async refresh(): Promise<void> {
		this.remove();
		const { app, settings } = this.plugin;
		if (!settings.shareBannerEnabled) return;

		const view = app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (!view || !file) return;

		const shareLink = this.plugin.getShareLink(file);
		if (!shareLink) return;

		const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const shareTime = (fm["share_time"] as string | undefined) ?? "";
		const shareHash = (fm["share_hash"] as string | undefined) ?? "";

		// Prefer live editor content so the stale state updates while typing;
		// fall back to disk in reading mode where there is no editor.
		const raw = view.editor ? view.editor.getValue() : await app.vault.cachedRead(file);
		const currentHash = hashBody(stripFrontmatter(raw));
		const stale = !shareHash || currentHash !== shareHash;

		this.render(view, file, shareLink, shareTime, stale);
	}

	private render(
		view: MarkdownView,
		file: TFile,
		shareLink: string,
		shareTime: string,
		stale: boolean
	): void {
		const banner = createDiv({ cls: BANNER_CLASS });
		if (stale) banner.addClass(`${BANNER_CLASS}--stale`);

		// URL row
		const urlRow = banner.createDiv({ cls: "opal-share-banner-row" });
		urlRow.createSpan({ cls: "opal-share-banner-label", text: t("banner.url.label") });
		const link = urlRow.createEl("a", {
			cls: "opal-share-banner-url",
			text: shareLink,
			href: shareLink,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");
		const copyBtn = urlRow.createDiv({ cls: "opal-share-banner-copy" });
		setIcon(copyBtn, "copy");
		setTooltip(copyBtn, t("banner.copied"));
		copyBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			await navigator.clipboard.writeText(shareLink);
			new Notice(t("banner.copied"));
		});

		// Time row
		if (shareTime) {
			const timeRow = banner.createDiv({ cls: "opal-share-banner-row" });
			timeRow.createSpan({ cls: "opal-share-banner-label", text: t("banner.time.label") });
			timeRow.createSpan({
				cls: "opal-share-banner-time",
				text: new Date(shareTime).toLocaleString(),
			});
		}

		// Status row
		const statusRow = banner.createDiv({ cls: "opal-share-banner-row" });
		statusRow.createSpan({
			cls: "opal-share-banner-status",
			text: stale ? t("banner.status.stale") : t("banner.status.fresh"),
		});
		if (stale) {
			const updateBtn = statusRow.createEl("button", {
				cls: "opal-share-banner-update",
				text: t("banner.btn.update"),
			});
			updateBtn.addEventListener("click", () => {
				void this.plugin.updateNoteFromBanner(file);
			});
		}

		view.contentEl.prepend(banner);
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/share-banner.ts
git commit -m "feat: add ShareBanner view component"
```

---

### Task 6: Banner styling

**Files:**
- Modify: `styles.css` (append at end)

- [ ] **Step 1: Append banner styles**

Append to `styles.css`:

```css
/* ── Share banner (in-editor, never exported) ── */
.opal-share-banner {
  margin: 8px 0 14px 0;
  padding: 10px 14px;
  border-radius: 6px;
  border-left: 3px solid var(--interactive-accent);
  background: var(--background-secondary);
  font-size: 13px;
}
.opal-share-banner--stale {
  border-left-color: var(--text-warning);
}
.opal-share-banner-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0;
}
.opal-share-banner-label {
  color: var(--text-muted);
  flex-shrink: 0;
}
.opal-share-banner-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.opal-share-banner-copy {
  display: flex;
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
}
.opal-share-banner-copy:hover {
  color: var(--text-normal);
}
.opal-share-banner-time {
  color: var(--text-muted);
}
.opal-share-banner--stale .opal-share-banner-status {
  color: var(--text-warning);
}
.opal-share-banner-update {
  margin-left: auto;
  cursor: pointer;
}
```

- [ ] **Step 2: Lint the CSS**

Use the `obsidian-plugin-lint` skill (or manually verify): no `!important`, full 6-digit hex (none added — only CSS variables and named-free values), no duplicate selectors, no unknown type selectors.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add share banner styles"
```

---

### Task 7: Wire the banner into the plugin

**Files:**
- Modify: `main.ts` (imports, field, onload, updateNote, onunload)

- [ ] **Step 1: Import ShareBanner + debounce**

In `main.ts`, add `debounce` to the existing `obsidian` import (line 1):

```ts
import { Menu, Notice, Plugin, TFile, debounce, setIcon, setTooltip } from "obsidian";
```

Add a new import line near the other `./src/...` imports:

```ts
import { ShareBanner } from "./src/share-banner";
```

- [ ] **Step 2: Add the field**

In `main.ts`, in the class body after `settings: ShareOnlineSettings;` (line 54), add:

```ts
	shareBanner: ShareBanner;
```

- [ ] **Step 3: Construct + register refresh triggers in onload**

In `main.ts` `onload()`, after `this.addSettingTab(...)` (line 60), add:

```ts
		this.shareBanner = new ShareBanner(this);
```

In the same `onload()`, replace the existing `active-leaf-change` registration (lines 83-85) with one that also refreshes the banner:

```ts
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateStatusBar();
				void this.shareBanner.refresh();
			})
		);
```

After the existing `metadataCache.on("changed", ...)` registration (lines 87-92), add:

```ts
		this.registerEvent(
			this.app.workspace.on("layout-change", () => void this.shareBanner.refresh())
		);

		const debouncedBannerRefresh = debounce(() => void this.shareBanner.refresh(), 500, true);
		this.registerEvent(
			this.app.workspace.on("editor-change", () => debouncedBannerRefresh())
		);

		void this.shareBanner.refresh();
```

Also make the existing `metadataCache.changed` handler refresh the banner. Replace lines 87-92:

```ts
		this.registerEvent(
			this.app.metadataCache.on("changed", (changedFile) => {
				const active = this.app.workspace.getActiveFile();
				if (active && changedFile.path === active.path) {
					this.updateStatusBar();
					void this.shareBanner.refresh();
				}
			})
		);
```

- [ ] **Step 4: Refresh after publish/unpublish + expose update for the banner**

In `main.ts`, at the end of `doPublish` success path, after `this.currentToast?.setSuccess(successText);` (line 292), add:

```ts
			void this.shareBanner.refresh();
```

In `doUnpublish`, after `this.currentToast?.setSuccess(t("toast.stopped"));` (line 326), add:

```ts
			void this.shareBanner.refresh();
```

Add a public wrapper for the banner's Update button. After the existing private `updateNote` method (ends line 347), add:

```ts
	async updateNoteFromBanner(file: TFile): Promise<void> {
		await this.updateNote(file);
		void this.shareBanner.refresh();
	}
```

- [ ] **Step 5: Tear down on unload**

In `main.ts` `onunload()` (line 385-387), add before/after the toast dismiss:

```ts
	onunload() {
		this.shareBanner?.remove();
		this.currentToast?.dismiss();
	}
```

- [ ] **Step 6: Typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add main.ts
git commit -m "feat: wire share banner into plugin lifecycle"
```

---

### Task 8: Build, deploy, manual verification

**Files:** none (build + deploy per global CLAUDE.md)

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: build succeeds, `main.js` regenerated.

- [ ] **Step 2: Deploy to vault**

Plugin id from `manifest.json` is `link-trace`. Copy artifacts:

```bash
DEST="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/link-trace"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST"/
```

Expected: files copied; hot-reload reloads the plugin (no manual enable needed — already installed).

- [ ] **Step 3: Manual verification checklist**

In Obsidian:
- Enable the new "在分享的笔记中显示提示框" toggle in settings.
- Publish a note → banner appears at top showing URL + publish time + "线上版本已是最新".
- Edit the body → banner flips to "线上版本已滞后" with an Update button (within ~0.5s).
- Click Update → banner returns to fresh, publish time updates.
- Click the copy icon → "链接已复制" notice; clipboard holds the URL.
- Switch reading ↔ editing mode → banner stays at top in both.
- Unpublish → banner disappears; note frontmatter no longer has `share_link`/`share_time`/`share_hash`.
- Disable the toggle → banner disappears immediately.
- Export the shared note locally → open the exported `.html`: it contains neither the banner DOM nor the `share_*` frontmatter.

- [ ] **Step 4: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore: build share banner"
```
