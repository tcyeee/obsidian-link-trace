// 纯函数模块：禁止 import obsidian，保证可被 vitest 直接单测。
import type { ShareOnlineSettings } from "./settings";

/** GoatCounter 埋点脚本注入所需的最小配置。 */
export interface GoatCounterInjectConfig {
	/** count 端点，例如 https://stats.viii.me/count（脚本地址在其后加 .js）。 */
	endpoint: string;
}

/** 转义 HTML 属性值（双引号上下文）中的 & 与 " ；不处理 < >，故勿用于文本节点。 */
function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * 生成 GoatCounter 埋点 <script> 标签。
 * 形如：<script data-goatcounter="<endpoint>" async src="<endpoint>.js"></script>
 * data-goatcounter 指向 count 端点，脚本本体就是该端点 + ".js"。
 */
export function getGoatCounterScriptTag(cfg: GoatCounterInjectConfig): string {
	const endpoint = escapeAttr(cfg.endpoint);
	const scriptSrc = escapeAttr(cfg.endpoint + ".js");
	return `<script data-goatcounter="${endpoint}" async src="${scriptSrc}"></script>`;
}

/** 从 share_link 完整 URL 提取 pathname（如 /notes/ab3）；非法返回 null。 */
export function extractPathname(shareLink: string): string | null {
	try {
		return new URL(shareLink).pathname;
	} catch {
		return null;
	}
}

/**
 * 从 count 端点推导 API 基址：取其 origin 拼 /api/v0。
 * 例如 https://stats.viii.me/count → https://stats.viii.me/api/v0。非法返回 null。
 */
export function deriveApiBase(endpoint: string): string | null {
	try {
		return new URL(endpoint).origin + "/api/v0";
	} catch {
		return null;
	}
}

/** 浏览量读取结果。GoatCounter 每个路径只给一个访客计数，故只有 views。 */
export interface PageViewStats {
	views: number;
}

/**
 * 解析 GoatCounter /api/v0/stats/hits 的响应；结构不符返回 null。
 * 形如：{ hits: [{ count, path, ... }], total, more }。
 * 我们以 include_paths 过滤到单一路径，hits 至多一条，取其 count 之和；
 * 路径无访问时 hits 为空数组，按 0 处理（视为合法的零浏览量）。
 */
export function parseStatsResponse(json: unknown): PageViewStats | null {
	if (!json || typeof json !== "object") return null;
	const obj = json as Record<string, unknown>;
	const hits = obj.hits;
	if (Array.isArray(hits)) {
		let sum = 0;
		let found = false;
		for (const h of hits) {
			const count = (h as Record<string, unknown> | null)?.count;
			if (typeof count === "number") {
				sum += count;
				found = true;
			}
		}
		if (found || hits.length === 0) return { views: sum };
	}
	// 兜底：顶层 total 同为该结果集的访客总数。
	if (typeof obj.total === "number") return { views: obj.total };
	return null;
}

/** stats/hits 响应里单条路径的命中信息。 */
export interface PathHit {
	/** 路径名，如 /notes/ab3。 */
	path: string;
	/** 该路径在区间内的访客计数。 */
	count: number;
	/** GoatCounter 内部 path_id，用于分页（exclude_paths）；缺失为 null。 */
	pathId: number | null;
}

/**
 * 解析 GoatCounter /api/v0/stats/hits 的整张命中列表（批量统计页用）。
 * 与 parseStatsResponse 不同：那个聚合成单一数字，这个保留每条路径。
 * 结构不符（无 hits 数组）返回 null；逐条跳过缺字段的项。
 */
export function parseHitsList(json: unknown): PathHit[] | null {
	if (!json || typeof json !== "object") return null;
	const hits = (json as Record<string, unknown>).hits;
	if (!Array.isArray(hits)) return null;
	const out: PathHit[] = [];
	for (const h of hits) {
		const obj = h as Record<string, unknown> | null;
		if (obj && typeof obj.path === "string" && typeof obj.count === "number") {
			const id = obj.path_id;
			out.push({ path: obj.path, count: obj.count, pathId: typeof id === "number" ? id : null });
		}
	}
	return out;
}

/** 详情弹窗中一个维度（来源/浏览器/系统/地区/语言/屏幕尺寸）的一项。 */
export interface DimensionItem {
	/** 维度取值名，如 "Chrome" / "China" / "google.com"。 */
	name: string;
	/** 该取值在区间内的访客计数。 */
	count: number;
	/**
	 * GoatCounter 维度取值的内部 id（存在时保留）。多数维度 name 已可读，无需用到；
	 * 但屏幕尺寸（sizes）维度 name 恒为空，可读标签需由 id（phone/tablet/desktop/
	 * desktophd/unknown）推导，故此处保留供调用方映射。
	 */
	id?: string;
}

/** 每日访问序列中的一个点。 */
export interface DailyPoint {
	/** 日期，形如 "2026-06-01"。 */
	day: string;
	/** 当日访客计数。 */
	count: number;
}

/**
 * 解析 GoatCounter /api/v0/stats/<page>（toprefs/browsers/systems/sizes/locations/languages）
 * 的响应：{ stats: [{ id?, name, count }], more }。逐条跳过缺 name 或 count 的项；
 * 空 stats 数组视为合法的“无数据”返回 []；结构不符（无 stats 数组）返回 null。
 */
export function parseDimensionStats(json: unknown): DimensionItem[] | null {
	if (!json || typeof json !== "object") return null;
	const stats = (json as Record<string, unknown>).stats;
	if (!Array.isArray(stats)) return null;
	const out: DimensionItem[] = [];
	for (const s of stats) {
		const obj = s as Record<string, unknown> | null;
		if (obj && typeof obj.name === "string" && typeof obj.count === "number") {
			const item: DimensionItem = { name: obj.name, count: obj.count };
			if (typeof obj.id === "string") item.id = obj.id;
			out.push(item);
		}
	}
	return out;
}

/**
 * 解析 GoatCounter /api/v0/stats/hits?daily=true 响应里第一条路径的每日序列。
 * 形如：{ hits: [{ path, count, stats: [{ day, daily }] }] }。
 * 路径无访问（hits 为空）或该路径无 stats → 返回空序列 []；逐条跳过缺 day/daily 的点；
 * 结构不符（无 hits 数组）返回 null。
 */
export function parseDailySeries(json: unknown): DailyPoint[] | null {
	if (!json || typeof json !== "object") return null;
	const hits = (json as Record<string, unknown>).hits;
	if (!Array.isArray(hits)) return null;
	if (hits.length === 0) return [];
	const stats = (hits[0] as Record<string, unknown> | null)?.stats;
	if (!Array.isArray(stats)) return [];
	const out: DailyPoint[] = [];
	for (const p of stats) {
		const obj = p as Record<string, unknown> | null;
		if (obj && typeof obj.day === "string" && typeof obj.daily === "number") {
			out.push({ day: obj.day, count: obj.daily });
		}
	}
	return out;
}

/**
 * 单个分享页的完整可读维度，供详情弹窗展示。
 * 概览访问数不在此（弹窗复用列表行已知的全时段计数）；daily 取近 30 天，其余维度取全时段。
 * 任一维度读取失败降级为空数组，不影响其他维度。
 */
export interface PageDetail {
	daily: DailyPoint[];
	referrers: DimensionItem[];
	browsers: DimensionItem[];
	systems: DimensionItem[];
	sizes: DimensionItem[];
	locations: DimensionItem[];
	languages: DimensionItem[];
}

/** 一条已发布分享页（由本库 frontmatter 扫描得到）。 */
export interface PublishedPage {
	/** share_link 的 pathname，用作与 GoatCounter 命中对齐的键。 */
	path: string;
	/** 笔记标题（basename）。 */
	title: string;
	/** 完整分享链接 URL。 */
	shareLink: string;
	/** 发布时间（毫秒时间戳）；缺失或非法为 null。 */
	publishedAt: number | null;
	/** 笔记在库内的路径，用于点击打开。 */
	filePath: string;
}

/** 统计页一行：分享页 + 访问数。 */
export interface StatsRow extends PublishedPage {
	views: number;
}

/**
 * 把已发布页与 GoatCounter 命中按 path 对齐，得到带访问数的行。
 * 未被 GoatCounter 记录（从未访问）的页计为 0。按访问数降序、再按发布时间降序。
 */
export function buildStatsRows(
	pages: PublishedPage[],
	hitsByPath: Map<string, number>
): StatsRow[] {
	return pages
		.map((p) => ({ ...p, views: hitsByPath.get(p.path) ?? 0 }))
		.sort((a, b) => b.views - a.views || (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
}

/** 注入判定所需的设置子集。 */
type InjectSettings = Pick<ShareOnlineSettings, "goatcounterEndpoint">;

/**
 * endpoint 非空时返回注入配置，否则 undefined。
 * 访问统计默认常开（无开关设置项），故仅以 endpoint 是否配置为准。
 */
export function getAnalyticsInjectConfig(s: InjectSettings): GoatCounterInjectConfig | undefined {
	const endpoint = s.goatcounterEndpoint.trim();
	if (!endpoint) return undefined;
	return { endpoint };
}

/** 读取浏览量所需的设置子集。 */
type ReadSettings = Pick<ShareOnlineSettings, "goatcounterEndpoint">;

/**
 * 是否具备读取浏览量的配置（endpoint 非空即可）。
 * endpoint 用于推导 API 基址。读取无需 token：默认的 stats.viii.me 端点由
 * nginx 在服务端注入只读 token（见 README/CLAUDE.md 的 Analytics backend），
 * 客户端不持有任何 token。访问统计默认常开，无启用开关。
 */
export function canReadAnalytics(s: ReadSettings): boolean {
	return !!s.goatcounterEndpoint.trim();
}
