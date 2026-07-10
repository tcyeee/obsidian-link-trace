// 纯函数模块：禁止 import obsidian，保证可被 vitest 直接单测。
import type { ShareOnlineSettings } from "../ui/settings";

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
 * GoatCounter 地区维度的英文省/州名（来自 GeoLite2-City）→ 中文。
 * 覆盖中国 34 个省级行政区，并附常见别名（如 "Nei Mongol"/"Xizang"/"Macau"）。
 * 未命中的名称按英文原样回退，不丢数据。
 */
export const CN_PROVINCE_ZH: Record<string, string> = {
	Beijing: "北京",
	Tianjin: "天津",
	Hebei: "河北",
	Shanxi: "山西",
	"Inner Mongolia": "内蒙古",
	"Nei Mongol": "内蒙古",
	Liaoning: "辽宁",
	Jilin: "吉林",
	Heilongjiang: "黑龙江",
	Shanghai: "上海",
	Jiangsu: "江苏",
	Zhejiang: "浙江",
	Anhui: "安徽",
	Fujian: "福建",
	Jiangxi: "江西",
	Shandong: "山东",
	Henan: "河南",
	Hubei: "湖北",
	Hunan: "湖南",
	Guangdong: "广东",
	Guangxi: "广西",
	"Guangxi Zhuangzu": "广西",
	Hainan: "海南",
	Chongqing: "重庆",
	Sichuan: "四川",
	Guizhou: "贵州",
	Yunnan: "云南",
	Tibet: "西藏",
	Xizang: "西藏",
	Shaanxi: "陕西",
	Gansu: "甘肃",
	Qinghai: "青海",
	Ningxia: "宁夏",
	"Ningxia Huizu": "宁夏",
	Xinjiang: "新疆",
	"Xinjiang Uygur": "新疆",
	Taiwan: "台湾",
	"Hong Kong": "香港",
	Macao: "澳门",
	Macau: "澳门",
};

/**
 * 国家/地区 ISO 码（GoatCounter 地区维度的 id）→ 中文。常见来源国家即可，
 * 港澳台冠以「中国」前缀。未命中按英文国家名回退。
 */
export const COUNTRY_ZH: Record<string, string> = {
	CN: "中国",
	HK: "中国香港",
	MO: "中国澳门",
	TW: "中国台湾",
	US: "美国",
	JP: "日本",
	KR: "韩国",
	SG: "新加坡",
	GB: "英国",
	DE: "德国",
	FR: "法国",
	CA: "加拿大",
	AU: "澳大利亚",
	RU: "俄罗斯",
	IN: "印度",
	MY: "马来西亚",
	TH: "泰国",
	VN: "越南",
};

/** 英文省/州名 → 中文，未知按原文回退。 */
export function provinceLabel(name: string): string {
	return CN_PROVINCE_ZH[name] ?? name;
}

/** 国家 ISO 码 → 中文，未知按 GoatCounter 给的英文名回退，再退到码本身。 */
export function countryLabel(code: string, fallbackName: string): string {
	return COUNTRY_ZH[code] ?? (fallbackName || code);
}

/**
 * 把「国家维度 + 各国省份下钻」合成为「国家-省份」中文标签的可读列表。
 * - 某国有具名省份 → 逐省输出 `中国-广东`；该国内未识别到省份的剩余访问以国家名单列 `中国`。
 * - 某国无省份数据（非 collect_regions 国家）→ 仅按国家名输出。
 * 结果按 count 降序、截断到 limit。纯函数，可直接单测。
 *
 * @param countries     /stats/locations 的国家级结果（含 id=ISO 码）。
 * @param regionsByCode ISO 码 → /stats/locations/<code> 的省份结果（name 为英文省名，"" 表未知）。
 */
export function buildLocationRows(
	countries: DimensionItem[],
	regionsByCode: Record<string, DimensionItem[]>,
	limit: number
): DimensionItem[] {
	const rows: DimensionItem[] = [];
	for (const c of countries) {
		const code = c.id ?? "";
		const countryZh = countryLabel(code, c.name);
		const regions = code ? regionsByCode[code] : undefined;
		const named = regions?.filter((r) => r.name.trim() !== "") ?? [];
		if (named.length > 0) {
			for (const r of named) {
				rows.push({ name: `${countryZh}-${provinceLabel(r.name)}`, count: r.count });
			}
			const unknown = regions
				.filter((r) => r.name.trim() === "")
				.reduce((sum, r) => sum + r.count, 0);
			if (unknown > 0) rows.push({ name: countryZh, count: unknown });
		} else {
			rows.push({ name: countryZh, count: c.count });
		}
	}
	rows.sort((a, b) => b.count - a.count);
	return rows.slice(0, limit);
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
 * 从每日序列中取「最近有访问的若干天」，供分享气泡的「最近三条」展示。
 * 过滤出 count > 0 的点，按 day 字符串降序（新→旧），取前 limit 条。
 * 纯函数、无副作用，可直接单测。
 */
export function recentActiveDays(points: DailyPoint[], limit: number): DailyPoint[] {
	return points
		.filter((p) => p.count > 0)
		.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
		.slice(0, limit);
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
	/**
	 * 已冻结（frontmatter 里记录过一次）的访问数——用于已下架的页面：下架后流量
	 * 不会再变化，没必要每次都向 GoatCounter 重新拉取。设置了此字段时，
	 * {@link buildStatsRows} 直接采用它，不再查 hits 映射。
	 */
	cachedViews?: number;
}

/** 统计页一行：分享页 + 访问数。 */
export interface StatsRow extends PublishedPage {
	views: number;
}

/**
 * 把已发布页与 GoatCounter 命中按 path 对齐，得到带访问数的行。
 * 有 `cachedViews`（已冻结）的页直接用该值；否则按 path 查 hits 映射，未命中
 * （从未访问）计为 0。按访问数降序、再按发布时间降序。
 */
export function buildStatsRows(
	pages: PublishedPage[],
	hitsByPath: Map<string, number>
): StatsRow[] {
	return pages
		.map((p) => ({ ...p, views: p.cachedViews ?? hitsByPath.get(p.path) ?? 0 }))
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
