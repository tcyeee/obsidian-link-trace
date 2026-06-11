# Share Modal Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation Modal for publish/unpublish that shows note hierarchy, writes `share_link` to sub-notes, skips re-uploading already-published sub-notes, and lets users choose which sub-notes to stop sharing.

**Architecture:** A single `ShareModal` class (new file `src/share-modal.ts`) handles both publish and unpublish modes. `doPublish` and `doUnpublish` methods in `main.ts` replace the old `publishNote`/`unpublishNote` direct-action methods. `collectLinkedNotesWithStatus` extends the exporter with per-link shareLink data, and `uploadSubNoteToOss` is updated to return the uploaded URL.

**Tech Stack:** TypeScript, Obsidian Plugin API (`Modal`, `App`, `TFile`), ali-oss, pnpm/esbuild

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/share-modal.ts` | **Create** | ShareModal class — hierarchy UI for publish + unpublish |
| `src/exporter.ts` | **Modify** | Add `collectLinkedNotesWithStatus` |
| `src/oss.ts` | **Modify** | `uploadSubNoteToOss` returns `Promise<string>` (uploaded URL) |
| `styles.css` | **Modify** | Modal CSS classes |
| `main.ts` | **Modify** | Add `doPublish`, `doUnpublish`; wire menu to Modal |

---

## Task 1: Add `collectLinkedNotesWithStatus` to `src/exporter.ts`

**Files:**
- Modify: `src/exporter.ts`

- [ ] **Step 1: Add the function after `collectLinkedNotes`**

Open `src/exporter.ts`. After line 19 (end of `collectLinkedNotes`), insert:

```ts
/** Same as collectLinkedNotes but also returns each note's current share_link value. */
export function collectLinkedNotesWithStatus(
    app: App,
    file: TFile
): { file: TFile; shareLink: string }[] {
    const links = app.metadataCache.getFileCache(file)?.links ?? [];
    const seen = new Set<string>();
    const result: { file: TFile; shareLink: string }[] = [];
    for (const link of links) {
        const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
        if (dest && dest.extension === "md" && !seen.has(dest.path)) {
            seen.add(dest.path);
            const shareLink =
                app.metadataCache.getFileCache(dest)?.frontmatter?.share_link ?? "";
            result.push({ file: dest, shareLink });
        }
    }
    return result;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/tcyeee/Documents/Code/obsidian/obsidian-publish-as-link && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/exporter.ts
git commit -m "feat: add collectLinkedNotesWithStatus to exporter"
```

---

## Task 2: Update `uploadSubNoteToOss` to return URL

**Files:**
- Modify: `src/oss.ts`

- [ ] **Step 1: Change return type and add return statement**

In `src/oss.ts`, replace the entire `uploadSubNoteToOss` function (lines 67–88) with:

```ts
export async function uploadSubNoteToOss(
    settings: ShareOnlineSettings,
    vault: Vault,
    subFolderName: string,
    html: string,
    images: Map<string, TFile>
): Promise<string> {
    const client = makeClient(settings);
    const prefix = settings.ossPrefix.replace(/\/$/, "");

    await client.put(`${prefix}/${subFolderName}`, Buffer.from(html, "utf-8"), { mime: "text/html; charset=utf-8" });

    for (const [exportName, imgFile] of images) {
        const data = await vault.readBinary(imgFile);
        await client.put(
            `${prefix}/${subFolderName}/images/${exportName}`,
            Buffer.from(data),
            { mime: getMimeType(imgFile.extension) }
        );
    }

    const base = settings.ossDomain || `https://${settings.ossBucket}.${settings.ossRegion}.aliyuncs.com`;
    return `${base}/${prefix}/${subFolderName}`;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/oss.ts
git commit -m "feat: uploadSubNoteToOss returns uploaded URL"
```

---

## Task 3: Create `src/share-modal.ts`

**Files:**
- Create: `src/share-modal.ts`

- [ ] **Step 1: Create the file with the full ShareModal implementation**

```ts
import { App, Modal, TFile, setIcon } from "obsidian";
import type ShareOnlinePlugin from "../main";
import { collectLinkedNotesWithStatus } from "./exporter";

export type ShareMode = "publish" | "unpublish";

type SubNoteWithStatus = { file: TFile; shareLink: string };

export class ShareModal extends Modal {
    private plugin: ShareOnlinePlugin;
    private file: TFile;
    private mode: ShareMode;
    private onConfirm: (subNotes: SubNoteWithStatus[]) => void;
    private subNotes: SubNoteWithStatus[] = [];
    private checkStates = new Map<string, boolean>();

    constructor(
        app: App,
        plugin: ShareOnlinePlugin,
        file: TFile,
        mode: ShareMode,
        onConfirm: (subNotes: SubNoteWithStatus[]) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        this.mode = mode;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("opal-share-modal");

        this.subNotes = this.plugin.settings.includeLinkedNotes
            ? collectLinkedNotesWithStatus(this.app, this.file)
            : [];

        contentEl.createEl("h2", {
            text: this.mode === "publish" ? "发布笔记" : "停止分享",
            cls: "opal-modal-title",
        });

        // Main note section
        const mainSection = contentEl.createDiv({ cls: "opal-modal-section" });
        mainSection.createEl("p", {
            cls: "opal-modal-section-label",
            text: this.mode === "publish" ? "主笔记" : "主笔记（将被停止分享）",
        });
        this.renderNoteItem(mainSection, this.file.basename + ".md", null);

        // Sub-notes section
        if (this.mode === "publish") {
            this.renderPublishSubNotes(contentEl);
        } else {
            this.renderUnpublishSubNotes(contentEl);
        }

        // Button row
        const btnRow = contentEl.createDiv({ cls: "opal-modal-btn-row" });
        const cancelBtn = btnRow.createEl("button", { text: "取消" });
        cancelBtn.addEventListener("click", () => this.close());

        const confirmBtn = btnRow.createEl("button", {
            text: this.mode === "publish" ? "确认发布" : "确认停止分享",
            cls: "mod-cta",
        });
        confirmBtn.addEventListener("click", () => {
            const result =
                this.mode === "unpublish"
                    ? this.subNotes.filter(
                          (sn) => sn.shareLink && this.checkStates.get(sn.file.path)
                      )
                    : this.subNotes;
            this.close();
            this.onConfirm(result);
        });
    }

    private renderNoteItem(
        parent: HTMLElement,
        label: string,
        badge: string | null
    ) {
        const item = parent.createDiv({ cls: "opal-modal-note-item" });
        const iconEl = item.createDiv({ cls: "opal-modal-note-icon" });
        setIcon(iconEl, "file-text");
        item.createSpan({ text: label, cls: "opal-modal-note-name" });
        if (badge) {
            item.createSpan({ text: badge, cls: "opal-modal-badge" });
        }
    }

    private renderPublishSubNotes(contentEl: HTMLElement) {
        if (this.subNotes.length === 0) return;
        const section = contentEl.createDiv({ cls: "opal-modal-section" });
        section.createEl("p", {
            cls: "opal-modal-section-label",
            text: `关联的二级笔记 (${this.subNotes.length})`,
        });
        for (const sn of this.subNotes) {
            const badge = sn.shareLink ? "已有链接，跳过" : "将被上传";
            this.renderNoteItem(section, sn.file.basename + ".md", badge);
            if (sn.shareLink) {
                section.lastElementChild?.addClass("opal-modal-note-item--skip");
            }
        }
    }

    private renderUnpublishSubNotes(contentEl: HTMLElement) {
        const withLink = this.subNotes.filter((sn) => sn.shareLink);
        if (withLink.length === 0) return;
        const section = contentEl.createDiv({ cls: "opal-modal-section" });
        section.createEl("p", {
            cls: "opal-modal-section-label",
            text: "关联的二级笔记（可选择一并停止）",
        });
        for (const sn of withLink) {
            this.checkStates.set(sn.file.path, true);
            const item = section.createDiv({ cls: "opal-modal-note-item" });
            const checkbox = item.createEl("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.addClass("opal-modal-checkbox");
            checkbox.addEventListener("change", () => {
                this.checkStates.set(sn.file.path, checkbox.checked);
            });
            const iconEl = item.createDiv({ cls: "opal-modal-note-icon" });
            setIcon(iconEl, "file-text");
            item.createSpan({ text: sn.file.basename + ".md", cls: "opal-modal-note-name" });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/share-modal.ts
git commit -m "feat: add ShareModal with publish/unpublish hierarchy UI"
```

---

## Task 4: Add modal CSS to `styles.css`

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append modal styles**

At the end of `styles.css`, add:

```css
/* ── Share Modal ── */
.opal-share-modal .opal-modal-title {
  margin-bottom: 16px;
}
.opal-share-modal .opal-modal-section {
  margin-bottom: 14px;
}
.opal-share-modal .opal-modal-section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin: 0 0 6px 0;
}
.opal-share-modal .opal-modal-note-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.opal-share-modal .opal-modal-note-icon {
  display: flex;
  align-items: center;
  color: var(--text-muted);
  flex-shrink: 0;
}
.opal-share-modal .opal-modal-note-name {
  flex: 1;
  font-size: 13.5px;
}
.opal-share-modal .opal-modal-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--background-modifier-success);
  color: var(--text-on-accent);
  flex-shrink: 0;
}
.opal-share-modal .opal-modal-note-item--skip .opal-modal-badge {
  background: var(--background-modifier-border);
  color: var(--text-muted);
}
.opal-share-modal .opal-modal-note-item--skip .opal-modal-note-name {
  color: var(--text-muted);
}
.opal-share-modal .opal-modal-checkbox {
  flex-shrink: 0;
}
.opal-share-modal .opal-modal-btn-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: add ShareModal CSS"
```

---

## Task 5: Add `doPublish` to `main.ts`

**Files:**
- Modify: `main.ts`

- [ ] **Step 1: Add import for `collectLinkedNotesWithStatus` and `ShareModal`**

In `main.ts` line 3, change:
```ts
import { exportToLocal, prepareExport, collectLinkedNotes, rewriteInternalLinks } from "./src/exporter";
```
to:
```ts
import { exportToLocal, prepareExport, collectLinkedNotes, collectLinkedNotesWithStatus, rewriteInternalLinks } from "./src/exporter";
import { ShareModal } from "./src/share-modal";
```

- [ ] **Step 2: Add `doPublish` method to the plugin class**

Add this method after `extractNoteName` (around line 220):

```ts
private async doPublish(
    file: TFile,
    subNotes: { file: TFile; shareLink: string }[],
    existingName?: string,
    successText = "发布成功，链接已复制到剪贴板",
    copyToClipboard = true
): Promise<void> {
    this.currentToast?.dismiss();
    this.currentToast = new ExportToast("上传中...");
    try {
        const result = await prepareExport(this.app, this.app.vault, file, existingName);
        const subFolderMap = new Map<string, string>();
        let mainHtml = result.html;

        for (const sn of subNotes) {
            if (sn.shareLink) {
                // Already published — reuse existing noteName for link rewriting
                const noteName = this.extractNoteName(sn.shareLink);
                subFolderMap.set(sn.file.basename, noteName);
                subFolderMap.set(sn.file.path.replace(/\.md$/i, ""), noteName);
            } else {
                const subResult = await prepareExport(this.app, this.app.vault, sn.file);
                subFolderMap.set(sn.file.basename, subResult.noteName);
                subFolderMap.set(sn.file.path.replace(/\.md$/i, ""), subResult.noteName);
                const subUrl = await uploadSubNoteToOss(
                    this.settings,
                    this.app.vault,
                    subResult.noteName,
                    subResult.html,
                    subResult.images
                );
                await this.setShareLink(sn.file, subUrl);
            }
        }

        mainHtml = rewriteInternalLinks(mainHtml, subFolderMap);
        const url = await uploadToOss(
            this.settings,
            this.app.vault,
            result.noteName,
            mainHtml,
            result.images
        );
        await this.setShareLink(file, url);
        this.updateStatusBar();
        if (copyToClipboard) {
            await navigator.clipboard.writeText(url);
        }
        this.currentToast?.setSuccess(successText);
    } catch (err) {
        this.currentToast?.setError(`发布失败：${(err as Error).message}`);
        console.error(err);
    }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add main.ts
git commit -m "feat: add doPublish with sub-note share_link writing and skip logic"
```

---

## Task 6: Add `doUnpublish` to `main.ts`

**Files:**
- Modify: `main.ts`

- [ ] **Step 1: Add `doUnpublish` method after `doPublish`**

```ts
private async doUnpublish(
    file: TFile,
    subNotesToDelete: { file: TFile; shareLink: string }[]
): Promise<void> {
    this.currentToast?.dismiss();
    this.currentToast = new ExportToast("停止分享中...");
    try {
        // Delete selected sub-notes first (errors are non-fatal)
        for (const sn of subNotesToDelete) {
            const snName = this.extractNoteName(sn.shareLink);
            try {
                await deleteFromOss(this.settings, snName);
                await this.removeShareLink(sn.file);
            } catch (err) {
                console.error(`删除二级笔记失败 (${sn.file.basename}):`, err);
                new Notice(`删除 ${sn.file.basename} 失败，已保留其分享链接`);
            }
        }

        // Delete main note (fatal on failure)
        const existingUrl = this.getShareLink(file);
        if (existingUrl) {
            const existingName = this.extractNoteName(existingUrl);
            await deleteFromOss(this.settings, existingName);
        }
        await this.removeShareLink(file);
        this.updateStatusBar();
        this.currentToast?.setSuccess("已停止分享");
    } catch (err) {
        this.currentToast?.setError(`停止分享失败：${(err as Error).message}`);
        console.error(err);
    }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add main.ts
git commit -m "feat: add doUnpublish with per-sub-note checkbox deletion"
```

---

## Task 7: Wire share menu to ShareModal and update `updateNote`

**Files:**
- Modify: `main.ts`

- [ ] **Step 1: Replace `publishNote` call in `showShareMenu` with ShareModal**

Find the menu item for "发布到线上" in `showShareMenu` (around line 151):

```ts
menu.addItem((item) =>
    item
        .setTitle("发布到线上")
        .setIcon("upload-cloud")
        .onClick(() => this.publishNote(file))
);
```

Replace with:

```ts
menu.addItem((item) =>
    item
        .setTitle("发布到线上")
        .setIcon("upload-cloud")
        .onClick(() => {
            new ShareModal(this.app, this, file, "publish", (confirmedSubNotes) => {
                this.doPublish(file, confirmedSubNotes);
            }).open();
        })
);
```

Note: sub-notes are collected inside `ShareModal.onOpen()` — no need to collect them here.

- [ ] **Step 2: Replace `unpublishNote` call in `showShareMenu` with ShareModal**

Find the menu item for "停止分享" (around line 184):

```ts
menu.addItem((item) =>
    item
        .setTitle("停止分享")
        .setIcon("eye-off")
        .onClick(() => this.unpublishNote(file))
);
```

Replace with:

```ts
menu.addItem((item) =>
    item
        .setTitle("停止分享")
        .setIcon("eye-off")
        .onClick(() => {
            new ShareModal(this.app, this, file, "unpublish", (selectedSubNotes) => {
                this.doUnpublish(file, selectedSubNotes);
            }).open();
        })
);
```

- [ ] **Step 3: Update `updateNote` to use `doPublish`**

Find `updateNote` (around line 222):

```ts
private async updateNote(file: TFile) {
    const existingUrl = this.getShareLink(file);
    const existingName = existingUrl ? this.extractNoteName(existingUrl) : undefined;
    const url = await this.exportFile(file, true, existingName);
    if (url) {
        await this.setShareLink(file, url);
        this.updateStatusBar();
        this.currentToast?.setSuccess("更新成功");
    }
}
```

Replace with:

```ts
private async updateNote(file: TFile) {
    const existingUrl = this.getShareLink(file);
    const existingName = existingUrl ? this.extractNoteName(existingUrl) : undefined;
    const subNotes = this.settings.includeLinkedNotes
        ? collectLinkedNotesWithStatus(this.app, file)
        : [];
    await this.doPublish(file, subNotes, existingName, "更新成功", false);
}
```

Note: `doPublish` signature already accepts `successText` and `copyToClipboard` params (defined in Task 5). Passing `"更新成功"` avoids the "发布成功" text, and `false` skips the clipboard copy since the URL hasn't changed.

- [ ] **Step 4: Update `export-current-note-to-oss` command to use `doPublish`**

Find the `exportCurrentNote` method:

```ts
private async exportCurrentNote(toOss = false) {
    const file = this.app.workspace.getActiveFile();
    if (!this.isMarkdown(file)) {
        new Notice("只能发布 Markdown 笔记");
        return;
    }
    await this.exportFile(file, toOss);
    this.currentToast?.setSuccess(toOss ? "上传成功" : "导出成功");
}
```

Replace with:

```ts
private async exportCurrentNote(toOss = false) {
    const file = this.app.workspace.getActiveFile();
    if (!this.isMarkdown(file)) {
        new Notice("只能发布 Markdown 笔记");
        return;
    }
    if (toOss) {
        const subNotes = this.settings.includeLinkedNotes
            ? collectLinkedNotesWithStatus(this.app, file)
            : [];
        await this.doPublish(file, subNotes, undefined, "上传成功", false);
    } else {
        await this.exportFile(file, false);
        this.currentToast?.setSuccess("导出成功");
    }
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add main.ts
git commit -m "feat: wire share menu to ShareModal, update updateNote and exportCurrentNote"
```

---

## Task 8: Build and deploy to vault

**Files:**
- Build output: `main.js`

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: no errors, `main.js` updated.

- [ ] **Step 2: Read plugin ID from manifest**

```bash
node -e "const m = require('./manifest.json'); console.log(m.id);"
```

Expected output: `publish-as-link`

- [ ] **Step 3: Deploy to vault**

```bash
PLUGIN_ID="publish-as-link"
VAULT_PLUGINS="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/${PLUGIN_ID}"
mkdir -p "${VAULT_PLUGINS}"
cp main.js manifest.json styles.css "${VAULT_PLUGINS}/"
```

- [ ] **Step 4: Verify files copied**

```bash
ls "/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/publish-as-link/"
```

Expected: `main.js  manifest.json  styles.css`

- [ ] **Step 5: Final commit**

```bash
git add main.js
git commit -m "chore: rebuild main.js for share modal hierarchy feature"
```
