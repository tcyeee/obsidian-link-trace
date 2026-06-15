# Umami 访问统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在导出/发布的 HTML 中嵌入 Umami Cloud 埋点脚本，并通过 Umami Cloud API 把每篇笔记的浏览量/访客数拉回，展示在 ShareModal 里。

**Architecture:** 纯逻辑（脚本标签生成、URL 路径提取、API 响应解析、注入配置）集中在无 obsidian 依赖的 `src/analytics.ts`，可用 vitest 直接单测；带 obsidian `requestUrl` 的网络读取放在 `src/analytics-client.ts`。埋点注入点在 `buildHtml`（发布与本地导出共用），读取展示点在 `ShareModal`。鉴权用 Umami Cloud 的 `x-umami-api-key`，打到 `https://api.umami.is`。

**Tech Stack:** TypeScript 4.7、esbuild、Obsidian API（`requestUrl`/`Setting`/`Modal`）、vitest（新增，仅用于纯函数单测）。

---

## File Structure

- **Create `src/analytics.ts`** — 纯函数，零 obsidian 依赖：类型定义、`getUmamiScriptTag`、`extractPathname`、`parseStatsResponse`、`getAnalyticsInjectConfig`。
- **Create `src/analytics-client.ts`** — `fetchPageViews`，用 obsidian `requestUrl` 调 Umami Cloud API，复用 `analytics.ts` 的解析。
- **Create `src/analytics.test.ts`** — vitest 单测，覆盖 `analytics.ts` 的全部纯函数。
- **Create `vitest.config.ts`** — 最小 vitest 配置。
- **Modify `package.json`** — 加 `vitest` devDep 与 `test` 脚本。
- **Modify `src/settings.ts`** — `ShareOnlineSettings` 新增字段、`DEFAULT_SETTINGS` 默认值、设置页「访问统计」折叠区。
- **Modify `src/i18n.ts`** — 新增中英文文案 key。
- **Modify `src/renderer.ts`** — `buildHtml` 增加可选 `analytics` 参数并注入 `<script>`。
- **Modify `src/exporter.ts`** — `prepareExport` / `exportToLocal` 透传 analytics 配置。
- **Modify `main.ts`** — 发布与本地导出调用方传入 analytics 配置。
- **Modify `src/share-modal.ts`** — 笔记条目异步展示浏览量。

> 注：esbuild 只打包 `main.ts` 入口，测试文件不会进产物。`import type` 在编译期被擦除，故 `analytics.ts` 引用 `ShareOnlineSettings` 不会在测试运行时拉入 obsidian。

---

## Task 1: 接入 vitest 并实现 `getUmamiScriptTag`

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/analytics.ts`
- Test: `src/analytics.test.ts`

- [ ] **Step 1: 加 vitest 依赖与脚本**

Run:
```bash
pnpm add -D vitest
```
然后在 `package.json` 的 `scripts` 中，把：
```json
    "typecheck": "tsc --noEmit"
```
改为：
```json
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
```

- [ ] **Step 2: 写最小 vitest 配置**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
});
```

- [ ] **Step 3: 写失败测试**

Create `src/analytics.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getUmamiScriptTag } from "./analytics";

describe("getUmamiScriptTag", () => {
	it("生成带 src 和 data-website-id 的 defer 脚本", () => {
		const tag = getUmamiScriptTag({
			scriptUrl: "https://cloud.umami.is/script.js",
			websiteId: "abc-123",
		});
		expect(tag).toBe(
			'<script defer src="https://cloud.umami.is/script.js" data-website-id="abc-123"></script>'
		);
	});

	it("对属性值中的双引号做转义，避免破坏 HTML", () => {
		const tag = getUmamiScriptTag({
			scriptUrl: 'https://x/script.js"onerror="alert(1)',
			websiteId: 'id"evil',
		});
		expect(tag).not.toContain('"onerror="');
		expect(tag).toContain("&quot;");
	});
});
```

- [ ] **Step 4: 运行测试，确认失败**

Run: `pnpm test`
Expected: FAIL，报 `getUmamiScriptTag` 无法从 `./analytics` 导入（模块不存在）。

- [ ] **Step 5: 实现 `analytics.ts` 与 `getUmamiScriptTag`**

Create `src/analytics.ts`:
```ts
// 纯函数模块：禁止 import obsidian，保证可被 vitest 直接单测。
import type { ShareOnlineSettings } from "./settings";

/** Umami 埋点脚本注入所需的最小配置。 */
export interface UmamiInjectConfig {
	scriptUrl: string;
	websiteId: string;
}

/** 转义 HTML 属性值中的双引号与 & ，防止配置串破坏标签结构。 */
function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** 生成 Umami 埋点 <script> 标签。 */
export function getUmamiScriptTag(cfg: UmamiInjectConfig): string {
	const src = escapeAttr(cfg.scriptUrl);
	const id = escapeAttr(cfg.websiteId);
	return `<script defer src="${src}" data-website-id="${id}"></script>`;
}
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `pnpm test`
Expected: PASS（2 个用例）。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/analytics.ts src/analytics.test.ts
git commit -m "test: add vitest and getUmamiScriptTag"
```

---

## Task 2: `extractPathname` —— 从 share_link 提取 URL 路径

**Files:**
- Modify: `src/analytics.ts`
- Test: `src/analytics.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `src/analytics.test.ts` 末尾追加：
```ts
import { extractPathname } from "./analytics";

describe("extractPathname", () => {
	it("从完整 URL 提取 pathname", () => {
		expect(extractPathname("https://cdn.example.com/notes/ab3")).toBe("/notes/ab3");
	});

	it("忽略 query 与 hash", () => {
		expect(extractPathname("https://x.com/notes/ab3?a=1#h")).toBe("/notes/ab3");
	});

	it("非法或空输入返回 null", () => {
		expect(extractPathname("")).toBeNull();
		expect(extractPathname("not a url")).toBeNull();
	});
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test`
Expected: FAIL，`extractPathname` 未导出。

- [ ] **Step 3: 实现 `extractPathname`**

在 `src/analytics.ts` 追加：
```ts
/** 从 share_link 完整 URL 提取 pathname（如 /notes/ab3）；非法返回 null。 */
export function extractPathname(shareLink: string): string | null {
	try {
		return new URL(shareLink).pathname;
	} catch {
		return null;
	}
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test`
Expected: PASS（含新增 3 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/analytics.ts src/analytics.test.ts
git commit -m "feat: add extractPathname for share_link"
```

---

## Task 3: `parseStatsResponse` —— 解析 Umami stats 响应

**Files:**
- Modify: `src/analytics.ts`
- Test: `src/analytics.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `src/analytics.test.ts` 末尾追加：
```ts
import { parseStatsResponse } from "./analytics";

describe("parseStatsResponse", () => {
	it("提取 pageviews.value 与 visitors.value", () => {
		const json = {
			pageviews: { value: 123, prev: 0 },
			visitors: { value: 45, prev: 0 },
			visits: { value: 50 },
		};
		expect(parseStatsResponse(json)).toEqual({ pageviews: 123, visitors: 45 });
	});

	it("字段缺失或结构异常时返回 null", () => {
		expect(parseStatsResponse(null)).toBeNull();
		expect(parseStatsResponse({})).toBeNull();
		expect(parseStatsResponse({ pageviews: {} })).toBeNull();
	});
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test`
Expected: FAIL，`parseStatsResponse` 未导出。

- [ ] **Step 3: 实现 `parseStatsResponse`**

在 `src/analytics.ts` 追加：
```ts
/** 浏览量读取结果。 */
export interface PageViewStats {
	pageviews: number;
	visitors: number;
}

/** 解析 Umami /websites/:id/stats 的响应；结构不符返回 null。 */
export function parseStatsResponse(json: unknown): PageViewStats | null {
	if (!json || typeof json !== "object") return null;
	const obj = json as Record<string, unknown>;
	const pv = obj.pageviews as Record<string, unknown> | undefined;
	const uv = obj.visitors as Record<string, unknown> | undefined;
	if (typeof pv?.value !== "number" || typeof uv?.value !== "number") return null;
	return { pageviews: pv.value, visitors: uv.value };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/analytics.ts src/analytics.test.ts
git commit -m "feat: add parseStatsResponse"
```

---

## Task 4: `getAnalyticsInjectConfig` —— 由设置推导注入配置

**Files:**
- Modify: `src/analytics.ts`
- Test: `src/analytics.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `src/analytics.test.ts` 末尾追加：
```ts
import { getAnalyticsInjectConfig } from "./analytics";

describe("getAnalyticsInjectConfig", () => {
	it("启用且字段齐全时返回注入配置", () => {
		expect(
			getAnalyticsInjectConfig({
				analyticsEnabled: true,
				umamiScriptUrl: "https://cloud.umami.is/script.js",
				umamiWebsiteId: "abc-123",
			})
		).toEqual({ scriptUrl: "https://cloud.umami.is/script.js", websiteId: "abc-123" });
	});

	it("未启用返回 undefined", () => {
		expect(
			getAnalyticsInjectConfig({
				analyticsEnabled: false,
				umamiScriptUrl: "https://cloud.umami.is/script.js",
				umamiWebsiteId: "abc-123",
			})
		).toBeUndefined();
	});

	it("启用但缺 websiteId 返回 undefined", () => {
		expect(
			getAnalyticsInjectConfig({
				analyticsEnabled: true,
				umamiScriptUrl: "https://cloud.umami.is/script.js",
				umamiWebsiteId: "  ",
			})
		).toBeUndefined();
	});
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test`
Expected: FAIL，`getAnalyticsInjectConfig` 未导出。

- [ ] **Step 3: 实现 `getAnalyticsInjectConfig`**

在 `src/analytics.ts` 追加（接受窄类型，避免依赖完整 settings）：
```ts
/** 注入判定所需的设置子集。 */
type InjectSettings = Pick<
	ShareOnlineSettings,
	"analyticsEnabled" | "umamiScriptUrl" | "umamiWebsiteId"
>;

/** 启用且 scriptUrl/websiteId 均非空时返回注入配置，否则 undefined。 */
export function getAnalyticsInjectConfig(s: InjectSettings): UmamiInjectConfig | undefined {
	if (!s.analyticsEnabled) return undefined;
	const scriptUrl = s.umamiScriptUrl.trim();
	const websiteId = s.umamiWebsiteId.trim();
	if (!scriptUrl || !websiteId) return undefined;
	return { scriptUrl, websiteId };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test`
Expected: PASS。

> 注：此步引用了 `ShareOnlineSettings` 上尚不存在的字段，`pnpm test` 用 esbuild 擦除类型不受影响并通过；`pnpm typecheck` 此刻会因缺字段报错，将在 Task 5 补齐。先不跑 typecheck。

- [ ] **Step 5: 提交**

```bash
git add src/analytics.ts src/analytics.test.ts
git commit -m "feat: add getAnalyticsInjectConfig"
```

---

## Task 5: 设置字段、默认值、文案与设置页 UI

**Files:**
- Modify: `src/settings.ts:7-30`（interface + DEFAULT_SETTINGS）
- Modify: `src/settings.ts`（buildUI 末尾追加折叠区）
- Modify: `src/i18n.ts`（zh 与 en 两处）

- [ ] **Step 1: 扩展 `ShareOnlineSettings` 接口**

在 `src/settings.ts` 的 `ShareOnlineSettings` 接口中，`language: Language;` 之前追加：
```ts
	analyticsEnabled: boolean;
	umamiScriptUrl: string;
	umamiWebsiteId: string;
	umamiApiKey: string;
```

- [ ] **Step 2: 补 `DEFAULT_SETTINGS` 默认值**

在 `DEFAULT_SETTINGS` 中，`language: "zh",` 之前追加：
```ts
	analyticsEnabled: false,
	umamiScriptUrl: "https://cloud.umami.is/script.js",
	umamiWebsiteId: "",
	umamiApiKey: "",
```

- [ ] **Step 3: 加中文文案**

在 `src/i18n.ts` 的 `zh` 对象里，`"settings.urlPreview.label"` 那一行之后追加：
```ts
	"settings.analytics.heading": "访问统计",
	"settings.analytics.callout.item1": "基于 Umami Cloud 免费档，需先在 cloud.umami.is 注册站点并获取 Website ID 与 API Key",
	"settings.analytics.callout.item2": "脚本由 cloud.umami.is 提供，国内访客加载可能不稳定，统计或有遗漏",
	"settings.analyticsEnabled.name": "启用访问统计",
	"settings.analyticsEnabled.desc": "在发布/导出的页面中嵌入 Umami 埋点脚本",
	"settings.umamiScriptUrl.name": "埋点脚本地址",
	"settings.umamiScriptUrl.desc": "Umami 的 script.js 地址，Cloud 默认 https://cloud.umami.is/script.js",
	"settings.umamiWebsiteId.name": "Website ID",
	"settings.umamiWebsiteId.desc": "Umami 后台站点的 UUID（用作 data-website-id）",
	"settings.umamiApiKey.name": "API Key",
	"settings.umamiApiKey.desc": "用于读取浏览量的 Umami Cloud API Key",
	"modal.views.loading": "浏览 …",
	"modal.views.value": "👁 浏览 {pv} · 访客 {uv}",
	"modal.views.fail": "👁 —",
```

- [ ] **Step 4: 加英文文案**

在 `src/i18n.ts` 的 `en` 对象里找到对应 `"settings.urlPreview.label"` 一行，在其后追加（键名与 zh 完全一致）：
```ts
	"settings.analytics.heading": "Analytics",
	"settings.analytics.callout.item1": "Uses the free Umami Cloud tier — register a site at cloud.umami.is to get the Website ID and API Key",
	"settings.analytics.callout.item2": "The script is served from cloud.umami.is; loading may be unreliable for mainland-China visitors, so counts can be undercounted",
	"settings.analyticsEnabled.name": "Enable analytics",
	"settings.analyticsEnabled.desc": "Embed the Umami tracking script into published/exported pages",
	"settings.umamiScriptUrl.name": "Tracking script URL",
	"settings.umamiScriptUrl.desc": "Umami script.js URL; Cloud default is https://cloud.umami.is/script.js",
	"settings.umamiWebsiteId.name": "Website ID",
	"settings.umamiWebsiteId.desc": "The Umami site UUID (used as data-website-id)",
	"settings.umamiApiKey.name": "API Key",
	"settings.umamiApiKey.desc": "Umami Cloud API Key used to read page views",
	"modal.views.loading": "Views …",
	"modal.views.value": "👁 {pv} views · {uv} visitors",
	"modal.views.fail": "👁 —",
```

> 若 `en` 对象里没有 `"settings.urlPreview.label"` 键，则追加到 `en` 对象内任意位置（紧挨 `"settings.ossDomain.desc"` 之后）即可，只要在 `en` 对象内。

- [ ] **Step 5: 在设置页追加「访问统计」折叠区**

在 `src/settings.ts` 的 `buildUI()` 方法里，OSS 折叠区代码块之后、`buildUI()` 结束前，追加：
```ts
		// ── 访问统计 / Analytics ─ collapsible ──
		const analyticsDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		analyticsDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.analytics.heading"),
		});

		const analyticsCallout = analyticsDetails.createDiv({ cls: "opal-oss-callout" });
		const analyticsCalloutList = analyticsCallout.createEl("ul");
		analyticsCalloutList.createEl("li", { text: t("settings.analytics.callout.item1") });
		analyticsCalloutList.createEl("li", { text: t("settings.analytics.callout.item2") });

		new Setting(analyticsDetails)
			.setName(t("settings.analyticsEnabled.name"))
			.setDesc(t("settings.analyticsEnabled.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.analyticsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.analyticsEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(analyticsDetails)
			.setName(t("settings.umamiScriptUrl.name"))
			.setDesc(t("settings.umamiScriptUrl.desc"))
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.umamiScriptUrl)
					.setValue(this.plugin.settings.umamiScriptUrl)
					.onChange(async (value) => {
						this.plugin.settings.umamiScriptUrl =
							value.trim() || DEFAULT_SETTINGS.umamiScriptUrl;
						await this.plugin.saveSettings();
					})
			);

		new Setting(analyticsDetails)
			.setName(t("settings.umamiWebsiteId.name"))
			.setDesc(t("settings.umamiWebsiteId.desc"))
			.addText((text) =>
				text
					.setPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
					.setValue(this.plugin.settings.umamiWebsiteId)
					.onChange(async (value) => {
						this.plugin.settings.umamiWebsiteId = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(analyticsDetails)
			.setName(t("settings.umamiApiKey.name"))
			.setDesc(t("settings.umamiApiKey.desc"))
			.addText((text) => {
				text
					.setPlaceholder("api_xxx")
					.setValue(this.plugin.settings.umamiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.umamiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});
```

- [ ] **Step 6: 类型检查与单测**

Run: `pnpm typecheck && pnpm test`
Expected: 均通过（Task 4 引用的字段现已补齐）。

- [ ] **Step 7: 提交**

```bash
git add src/settings.ts src/i18n.ts
git commit -m "feat: add Umami analytics settings and i18n"
```

---

## Task 6: 在 `buildHtml` 注入埋点脚本并透传配置

**Files:**
- Modify: `src/renderer.ts:270`（buildHtml 签名与 `<head>`）
- Modify: `src/exporter.ts`（prepareExport、exportToLocal 签名）
- Modify: `main.ts`（发布路径与本地导出路径调用方）

- [ ] **Step 1: 给 `buildHtml` 加 analytics 参数并注入**

在 `src/renderer.ts` 顶部已有的 import 中，从 `./analytics` 引入类型与函数。在文件现有 import 区追加：
```ts
import { getUmamiScriptTag, type UmamiInjectConfig } from "./analytics";
```
将 `buildHtml` 签名（`src/renderer.ts:270`）：
```ts
export function buildHtml(title: string, htmlBody: string, css: string, katexBase?: string): string {
```
改为：
```ts
export function buildHtml(title: string, htmlBody: string, css: string, katexBase?: string, analytics?: UmamiInjectConfig): string {
```
在 `buildHtml` 内、`return \`<!DOCTYPE html>` 之前，加入：
```ts
  const analyticsTag = analytics ? `\n  ${getUmamiScriptTag(analytics)}` : "";
```
再把 `<head>` 模板中的这一行：
```ts
  <title>${title}</title>${katexCssTag}
```
改为：
```ts
  <title>${title}</title>${katexCssTag}${analyticsTag}
```

- [ ] **Step 2: `prepareExport` 透传 analytics**

在 `src/exporter.ts` 顶部 import 区追加：
```ts
import type { UmamiInjectConfig } from "./analytics";
```
将 `prepareExport` 签名：
```ts
export async function prepareExport(
	app: App,
	vault: Vault,
	file: TFile,
	noteName: string,
	katexBase?: string
): Promise<ExportResult> {
```
改为：
```ts
export async function prepareExport(
	app: App,
	vault: Vault,
	file: TFile,
	noteName: string,
	katexBase?: string,
	analytics?: UmamiInjectConfig
): Promise<ExportResult> {
```
并把其内部的：
```ts
	const html = buildHtml(file.basename, htmlBody, css, katexBase).replace(/src="images\//g, `src="${noteName}/images/`);
```
改为：
```ts
	const html = buildHtml(file.basename, htmlBody, css, katexBase, analytics).replace(/src="images\//g, `src="${noteName}/images/`);
```

- [ ] **Step 3: `exportToLocal` 透传 analytics**

将 `src/exporter.ts` 中 `exportToLocal` 签名：
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
改为：
```ts
export async function exportToLocal(
	app: App,
	vault: Vault,
	file: TFile,
	exportRoot: string,
	includeLinkedNotes = false,
	pageLinkLength = 3,
	analytics?: UmamiInjectConfig
): Promise<ExportResult> {
```
并把其内部两处 `prepareExport(...)` 调用补上 analytics 实参：
第一处（主笔记）：
```ts
	const result = await prepareExport(app, vault, file, generateUniqueName(usedNames, pageLinkLength), undefined, analytics);
```
第二处（子笔记，循环内）：
```ts
			const subResult = await prepareExport(app, vault, linkedFile, generateUniqueName(usedNames, pageLinkLength), undefined, analytics);
```

- [ ] **Step 4: 发布路径传入 analytics**

在 `main.ts` 顶部 import（`./src/exporter` 那一行附近）追加：
```ts
import { getAnalyticsInjectConfig } from "./src/analytics";
```
在 `main.ts:241`（`const katexBase = katexBaseUrl(this.settings);`）之后追加：
```ts
				const analytics = getAnalyticsInjectConfig(this.settings);
```
把 `main.ts:249` 的主笔记调用：
```ts
				const result = await prepareExport(this.app, this.app.vault, file, mainName, katexBase);
```
改为：
```ts
				const result = await prepareExport(this.app, this.app.vault, file, mainName, katexBase, analytics);
```
把 `main.ts:261` 的子笔记调用：
```ts
						const subResult = await prepareExport(this.app, this.app.vault, sn.file, generateUniqueName(usedNames, this.settings.pageLinkLength), katexBase);
```
改为：
```ts
						const subResult = await prepareExport(this.app, this.app.vault, sn.file, generateUniqueName(usedNames, this.settings.pageLinkLength), katexBase, analytics);
```

- [ ] **Step 5: 本地导出路径传入 analytics**

查看 `main.ts:368` 附近的 `exportToLocal(...)` 调用，在其最后一个实参后补上 analytics 配置。把调用：
```ts
			await exportToLocal(
```
对应的实参列表末尾（`pageLinkLength` 之后）追加一个实参：
```ts
				getAnalyticsInjectConfig(this.settings)
```
即调用形如：
```ts
			await exportToLocal(
				this.app,
				this.app.vault,
				file,
				this.settings.exportPath,
				this.settings.includeLinkedNotes,
				this.settings.pageLinkLength,
				getAnalyticsInjectConfig(this.settings)
			);
```
（以现有实参为准，仅在末尾追加该实参；若现有调用省略了中间默认参数，则补全为上述完整形式。）

- [ ] **Step 6: 类型检查与单测**

Run: `pnpm typecheck && pnpm test`
Expected: 均通过。

- [ ] **Step 7: 提交**

```bash
git add src/renderer.ts src/exporter.ts main.ts
git commit -m "feat: inject Umami script into exported HTML"
```

---

## Task 7: `fetchPageViews` 客户端

**Files:**
- Create: `src/analytics-client.ts`

- [ ] **Step 1: 实现客户端**

Create `src/analytics-client.ts`:
```ts
import { requestUrl } from "obsidian";
import type { ShareOnlineSettings } from "./settings";
import { parseStatsResponse, extractPathname, type PageViewStats } from "./analytics";

/** Umami Cloud API 基址。后续若迁自托管，改这里即可。 */
const UMAMI_API_BASE = "https://api.umami.is/v1";
/** 统计起点：取一个足够早的固定时刻，等效“全部累计”。 */
const STATS_START_AT = Date.parse("2020-01-01T00:00:00Z");

/**
 * 读取某个已发布页面的累计浏览量/访客数。
 * 任意失败（未配置 / 非法链接 / 网络 / 鉴权 / 结构异常）都返回 null，调用方降级展示。
 */
export async function fetchPageViews(
	settings: ShareOnlineSettings,
	shareLink: string
): Promise<PageViewStats | null> {
	const apiKey = settings.umamiApiKey.trim();
	const websiteId = settings.umamiWebsiteId.trim();
	if (!settings.analyticsEnabled || !apiKey || !websiteId) return null;

	const urlPath = extractPathname(shareLink);
	if (!urlPath) return null;

	const endAt = Date.now();
	const query =
		`?startAt=${STATS_START_AT}&endAt=${endAt}` +
		`&url=${encodeURIComponent(urlPath)}`;
	const url = `${UMAMI_API_BASE}/websites/${encodeURIComponent(websiteId)}/stats${query}`;

	try {
		const res = await requestUrl({
			url,
			method: "GET",
			headers: { "x-umami-api-key": apiKey, accept: "application/json" },
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) return null;
		return parseStatsResponse(res.json);
	} catch {
		return null;
	}
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

> 该模块依赖 obsidian `requestUrl`，不写 vitest 单测；其纯解析逻辑已由 Task 3 的 `parseStatsResponse` 覆盖。实际取数在 Task 9 的真机验证中确认（含 Cloud API `/v1` 路径核实）。

- [ ] **Step 3: 提交**

```bash
git add src/analytics-client.ts
git commit -m "feat: add fetchPageViews Umami client"
```

---

## Task 8: 在 ShareModal 展示浏览量

**Files:**
- Modify: `src/share-modal.ts`

- [ ] **Step 1: 引入依赖**

在 `src/share-modal.ts` 顶部 import 区追加：
```ts
import { fetchPageViews } from "./analytics-client";
```

- [ ] **Step 2: 给主笔记与已发布子笔记挂载浏览量**

在 `onOpen()` 中，主笔记渲染行：
```ts
        this.renderNoteItem(mainSection, this.file.basename + ".md", null);
```
改为捕获返回的元素并附加统计：
```ts
        const mainItem = this.renderNoteItem(mainSection, this.file.basename + ".md", null);
        this.showViews(mainItem, this.mainShareLink());
```
在 `renderPublishSubNotes` 中，对已有链接的子笔记也附加。把：
```ts
            const item = this.renderNoteItem(section, sn.file.basename + ".md", badge);
            if (sn.shareLink) {
                item.addClass("opal-modal-note-item--skip");
            }
```
改为：
```ts
            const item = this.renderNoteItem(section, sn.file.basename + ".md", badge);
            if (sn.shareLink) {
                item.addClass("opal-modal-note-item--skip");
                this.showViews(item, sn.shareLink);
            }
```

- [ ] **Step 3: 新增 `mainShareLink` 与 `showViews` 方法**

在 `ShareModal` 类内（`onClose()` 之前）追加：
```ts
    /** 当前主笔记的 share_link（未发布时为空串）。 */
    private mainShareLink(): string {
        return (
            (this.app.metadataCache.getFileCache(this.file)?.frontmatter?.["share_link"] as
                | string
                | undefined) ?? ""
        );
    }

    /**
     * 异步在条目右侧展示浏览量。未启用统计或无链接则不渲染；
     * 加载中显示占位，失败显示降级文案，绝不阻塞弹窗。
     */
    private showViews(item: HTMLElement, shareLink: string) {
        if (!this.plugin.settings.analyticsEnabled || !shareLink) return;
        const span = item.createSpan({
            cls: "opal-modal-views",
            text: t("modal.views.loading"),
        });
        fetchPageViews(this.plugin.settings, shareLink)
            .then((stats) => {
                span.setText(
                    stats
                        ? t("modal.views.value", {
                              pv: String(stats.pageviews),
                              uv: String(stats.visitors),
                          })
                        : t("modal.views.fail")
                );
            })
            .catch(() => span.setText(t("modal.views.fail")));
    }
```

- [ ] **Step 4: 类型检查与单测**

Run: `pnpm typecheck && pnpm test`
Expected: 均通过。

- [ ] **Step 5: 提交**

```bash
git add src/share-modal.ts
git commit -m "feat: show page views in share modal"
```

---

## Task 9: 构建、部署与真机验证

**Files:**
- 无源码改动（除非验证中发现问题）

- [ ] **Step 1: 全量检查与构建**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 三者均成功，生成 `main.js`。

- [ ] **Step 2: 部署到本地 vault**（遵循全局 CLAUDE.md）

从 `manifest.json` 读取 `id`（为 `link-trace`），复制产物：
```bash
PLUGIN_DIR="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/link-trace"
mkdir -p "$PLUGIN_DIR"
cp main.js manifest.json styles.css "$PLUGIN_DIR"/
```
（已启用插件由 hot-reload 自动重载。）

- [ ] **Step 3: 真机验证清单**

在 Obsidian 中人工确认：
1. 设置页出现「访问统计」折叠区，可填 scriptUrl / Website ID / API Key 并持久化。
2. 启用后发布一篇笔记，用浏览器打开发布链接，查看页面源码 `<head>` 含 `data-website-id` 的 `<script>`。
3. 在 Umami 后台确认该次访问被记录（路径为 `/{prefix}/{noteName}`）。
4. 在 Obsidian 重新打开该笔记的 ShareModal，条目右侧显示「👁 浏览 N · 访客 M」。
5. 关闭统计或留空 API Key 时，ShareModal 不显示浏览量、且不报错。

> 若第 3/4 步取数失败，重点核对 Cloud API 的版本前缀（`src/analytics-client.ts` 的 `UMAMI_API_BASE`，必要时对照 https://docs.umami.is/docs/api 调整 `/v1`）与 stats 响应字段名（`parseStatsResponse`）。

- [ ] **Step 4: 最终提交（如验证期有微调）**

```bash
git add -A
git commit -m "chore: build and deploy Umami analytics"
```

---

## 完成标准

- `pnpm typecheck && pnpm test && pnpm build` 全绿。
- 发布页面 `<head>` 注入了 Umami 埋点脚本。
- ShareModal 能展示每篇已发布笔记的累计浏览量/访客数，失败优雅降级。
- 未配置/未启用时行为与改动前一致（无注入、无展示、无报错）。
