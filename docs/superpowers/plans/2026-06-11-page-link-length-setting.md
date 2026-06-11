# 页面名称长度设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在插件设置页面新增下拉菜单，让用户控制生成的页面路径名长度（2–6，默认 3），并在选项中显示对应可生成的唯一页面数量。

**Architecture:** 三处改动串联：① `settings.ts` 新增字段+UI；② `exporter.ts` 的 `prepareExport` / `exportToLocal` 接收长度参数；③ `main.ts` 的调用处透传 `this.settings.pageLinkLength`。

**Tech Stack:** TypeScript, Obsidian Plugin API

---

### Task 1: 在 settings 中增加 `pageLinkLength` 字段与下拉 UI

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: 在 `ShareOnlineSettings` 接口中添加字段**

在 `ossDomain: string;` 后追加一行：

```ts
// src/settings.ts — ShareOnlineSettings 接口
export interface ShareOnlineSettings {
	exportPath: string;
	includeLinkedNotes: boolean;
	ossRegion: string;
	ossBucket: string;
	ossAccessKeyId: string;
	ossAccessKeySecret: string;
	ossPrefix: string;
	ossDomain: string;
	pageLinkLength: number;
}
```

- [ ] **Step 2: 在 `DEFAULT_SETTINGS` 中添加默认值**

在 `ossDomain: "",` 后追加：

```ts
export const DEFAULT_SETTINGS: ShareOnlineSettings = {
	exportPath: path.join(os.homedir(), "Desktop"),
	includeLinkedNotes: false,
	ossRegion: "",
	ossBucket: "",
	ossAccessKeyId: "",
	ossAccessKeySecret: "",
	ossPrefix: "notes",
	ossDomain: "",
	pageLinkLength: 3,
};
```

- [ ] **Step 3: 在「导出设置」分组下添加下拉菜单**

在 `display()` 方法中，`包含二级笔记` 的 Setting 之后插入新 Setting（即 `// ── 本地导出` 注释之前）：

```ts
new Setting(containerEl)
    .setName("页面名称长度")
    .setDesc("生成分享链接时的路径长度，越长碰撞概率越低")
    .addDropdown((dropdown) => {
        const capacities: Record<number, string> = {
            2: "约 1,296 个唯一页面",
            3: "约 46,656 个唯一页面",
            4: "约 1,679,616 个唯一页面",
            5: "约 60,466,176 个唯一页面",
            6: "约 2,176,782,336 个唯一页面",
        };
        for (const len of [2, 3, 4, 5, 6]) {
            dropdown.addOption(String(len), `${len} — ${capacities[len]}`);
        }
        dropdown
            .setValue(String(this.plugin.settings.pageLinkLength ?? 3))
            .onChange(async (value) => {
                this.plugin.settings.pageLinkLength = parseInt(value, 10);
                await this.plugin.saveSettings();
            });
    });
```

- [ ] **Step 4: 类型检查**

```bash
pnpm typecheck
```

期望：无报错（或仅有与本次改动无关的已有警告）。

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add pageLinkLength setting with dropdown UI"
```

---

### Task 2: `prepareExport` / `exportToLocal` 接收长度参数

**Files:**
- Modify: `src/exporter.ts`

- [ ] **Step 1: 为 `prepareExport` 增加 `pageLinkLength` 参数**

将第 84 行的函数签名和第 87 行的生成逻辑改为：

```ts
export async function prepareExport(
	app: App,
	vault: Vault,
	file: TFile,
	existingName?: string,
	pageLinkLength = 3
): Promise<ExportResult> {
	const raw = await vault.read(file);
	const { html: htmlBody, css, images } = await renderNote(app, file, raw);
	const folderName = existingName ?? Math.random().toString(36).slice(2, 2 + pageLinkLength);
	const html = buildHtml(file.basename, htmlBody, css).replace(/src="images\//g, `src="${folderName}/images/`);
	return { noteName: folderName, html, css, images };
}
```

- [ ] **Step 2: 为 `exportToLocal` 增加 `pageLinkLength` 参数并透传**

将第 94–99 行的函数签名改为：

```ts
export async function exportToLocal(
	app: App,
	vault: Vault,
	file: TFile,
	exportRoot: string,
	includeLinkedNotes = false,
	pageLinkLength = 3
): Promise<ExportResult> {
```

将第 101 行的调用改为：

```ts
const result = await prepareExport(app, vault, file, undefined, pageLinkLength);
```

将第 112 行（循环内的子笔记调用）改为：

```ts
const subResult = await prepareExport(app, vault, linkedFile, undefined, pageLinkLength);
```

- [ ] **Step 3: 类型检查**

```bash
pnpm typecheck
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add src/exporter.ts
git commit -m "feat: pass pageLinkLength through prepareExport and exportToLocal"
```

---

### Task 3: `main.ts` 调用处透传设置值

**Files:**
- Modify: `main.ts`

- [ ] **Step 1: `doPublish` 中的两处 `prepareExport` 调用传入长度**

第 224 行（主笔记）：

```ts
const result = await prepareExport(this.app, this.app.vault, file, existingName, this.settings.pageLinkLength);
```

第 235 行（子笔记，无 existingName）：

```ts
const subResult = await prepareExport(this.app, this.app.vault, sn.file, undefined, this.settings.pageLinkLength);
```

- [ ] **Step 2: `exportFile` 中的 `exportToLocal` 调用传入长度**

第 340–345 行改为：

```ts
await exportToLocal(
    this.app,
    this.app.vault,
    file,
    this.settings.exportPath || DEFAULT_SETTINGS.exportPath,
    this.settings.includeLinkedNotes,
    this.settings.pageLinkLength
);
```

- [ ] **Step 3: 类型检查**

```bash
pnpm typecheck
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add main.ts
git commit -m "feat: wire pageLinkLength from settings into publish and export calls"
```

---

### Task 4: 构建并部署到本地 vault

**Files:**
- Build output: `main.js`

- [ ] **Step 1: 构建**

```bash
pnpm build
```

期望：无 TypeScript 编译错误，生成新的 `main.js`。

- [ ] **Step 2: 读取插件 ID**

```bash
cat manifest.json | grep '"id"'
```

记录输出中的 id 值（例如 `obsidian-publish-as-link`）。

- [ ] **Step 3: 部署到 vault**

```bash
PLUGIN_ID=$(node -e "console.log(require('./manifest.json').id)")
DEST="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/${PLUGIN_ID}"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
```

期望：命令无报错，三个文件已复制。

- [ ] **Step 4: 验证**

在 Obsidian 中打开插件设置，确认「导出设置」分组出现「页面名称长度」下拉菜单，选项为 `2 — 约 1,296 个唯一页面` 到 `6 — 约 2,176,782,336 个唯一页面`，默认选中 `3`。

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "chore: rebuild after pageLinkLength setting"
```
