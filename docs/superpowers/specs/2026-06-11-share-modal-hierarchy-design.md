# Share Modal Hierarchy Design

**Date:** 2026-06-11  
**Status:** Approved

## Problem

When sharing a note that has linked sub-notes, the plugin uploads all sub-notes to OSS but:
1. Only writes `share_link` to the main note's frontmatter (sub-notes get no link)
2. Never deletes sub-notes from OSS when sharing is stopped
3. Shows no confirmation UI — publish and unpublish trigger immediately with no hierarchy preview

## Goals

1. Share dialog shows the note hierarchy so users know what will be uploaded
2. Sub-notes receive `share_link` in their frontmatter after upload
3. Sub-notes already published (have `share_link`) are skipped on re-upload
4. Unpublish dialog shows hierarchy with checkboxes to select which sub-notes to also stop sharing

## Architecture

### New file: `src/share-modal.ts`

A single `ShareModal` class extending Obsidian's `Modal`, controlled by `mode: "publish" | "unpublish"`.

**Constructor signature:**
```ts
new ShareModal(app, plugin, file, mode, onConfirm)
```

**Publish mode UI:**
- Section: "主笔记" — shows the main file name
- Section: "关联的二级笔记 (N)" — lists each linked note with status badge:
  - "已有链接，跳过" for notes that already have `share_link`
  - "将被上传" for notes without `share_link`
- Hidden when no linked notes exist
- Buttons: [取消] [确认发布]

**Unpublish mode UI:**
- Section: "主笔记（将被停止分享）" — shows main file name
- Section: "关联的二级笔记（可选择一并停止）" — checkboxes for sub-notes that have `share_link`; notes without `share_link` shown greyed out and non-interactive
- Hidden when no linked notes have `share_link`
- Buttons: [取消] [确认停止分享]

### Changes to `src/exporter.ts`

Add `collectLinkedNotesWithStatus(app, file)`:
```ts
function collectLinkedNotesWithStatus(app: App, file: TFile): { file: TFile; shareLink: string }[]
```
Returns each linked markdown note alongside its current `share_link` value (empty string if none). Used by the Modal to build the hierarchy display without making multiple separate calls.

### Changes to `src/oss.ts`

`uploadSubNoteToOss` returns `Promise<string>` (the uploaded URL) instead of `Promise<void>`, so the caller can write it to the sub-note's `share_link`.

### Changes to `main.ts`

**New method `doPublish(file, subNotesWithStatus)`:**
- For sub-notes without `share_link`: upload to OSS via `uploadSubNoteToOss`, write returned URL to their `share_link`
- For sub-notes with `share_link`: extract `noteName` from existing URL via `extractNoteName`, add to `subFolderMap` — no re-upload
- Upload main note, rewrite internal links using complete `subFolderMap`, write URL to main note's `share_link`

**New method `doUnpublish(file, subNotesToDelete)`:**
- For each selected sub-note: delete from OSS via `deleteFromOss`, clear `share_link`
- Delete main note from OSS, clear main note's `share_link`

**`showShareMenu` changes:**
- "发布到线上" click → `new ShareModal(app, plugin, file, "publish", onConfirm)` → `onConfirm` calls `doPublish`
- "停止分享" click → `new ShareModal(app, plugin, file, "unpublish", onConfirm)` → `onConfirm` calls `doUnpublish`
- Direct calls to `publishNote` / `unpublishNote` replaced by Modal flow

## Data Flow

### Publish

```
showShareMenu → ShareModal("publish")
  collectLinkedNotesWithStatus(app, file)
    → [{ file: SubA, shareLink: "https://..." }, { file: SubB, shareLink: "" }]
  user clicks 确认发布
  doPublish(mainFile, subNotesWithStatus)
    SubA (has link) → extractNoteName(url) → add to subFolderMap, skip upload
    SubB (no link)  → uploadSubNoteToOss → returns url → setShareLink(SubB, url)
                    → add to subFolderMap
    uploadToOss(mainFile, subFolderMap) → url
    setShareLink(mainFile, url)
```

### Unpublish

```
showShareMenu → ShareModal("unpublish")
  collectLinkedNotesWithStatus(app, file)
    → show only sub-notes with share_link as checkboxes
  user checks SubA, leaves SubB unchecked, clicks 确认停止分享
  doUnpublish(mainFile, [SubA])
    deleteFromOss(SubA noteName) → removeShareLink(SubA)
    deleteFromOss(mainFile noteName) → removeShareLink(mainFile)
```

## Error Handling

- **Sub-note upload fails during publish:** toast error, abort entire publish (main note not uploaded, no `share_link` written)
- **Sub-note delete fails during unpublish:** show individual error notice, continue with remaining deletions; main note deletion proceeds regardless
- **No linked notes:** Modal skips the sub-notes section; behavior identical to current publish/unpublish

## Files Changed

| File | Change |
|------|--------|
| `src/share-modal.ts` | New — ShareModal class |
| `src/exporter.ts` | Add `collectLinkedNotesWithStatus` |
| `src/oss.ts` | `uploadSubNoteToOss` returns `string` |
| `main.ts` | Add `doPublish`, `doUnpublish`; wire menu to Modal |
