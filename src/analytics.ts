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

/** 从 share_link 完整 URL 提取 pathname（如 /notes/ab3）；非法返回 null。 */
export function extractPathname(shareLink: string): string | null {
	try {
		return new URL(shareLink).pathname;
	} catch {
		return null;
	}
}

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
