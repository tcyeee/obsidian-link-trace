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
