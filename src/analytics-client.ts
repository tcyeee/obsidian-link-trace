import { requestUrl } from "obsidian";
import type { ShareOnlineSettings } from "./settings";
import {
	parseStatsResponse,
	parseHitsList,
	parseDimensionStats,
	parseDailySeries,
	extractPathname,
	deriveApiBase,
	canReadAnalytics,
	type PageViewStats,
	type PageDetail,
	type DimensionItem,
} from "./analytics";

/** 统计起点：取一个足够早的固定时刻，等效“全部累计”。 */
const STATS_START = "2020-01-01T00:00:00Z";

/** 简单延时，用于 429 限流退避。 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 统计读取请求头。客户端不持有任何 token——默认的 stats.viii.me 端点由服务端
 * nginx 注入只读 token（见 analytics.ts canReadAnalytics 的说明）。
 */
const STATS_HEADERS: Record<string, string> = { accept: "application/json" };

/**
 * 读取某个已发布页面的累计浏览量。
 * 任意失败（未配置 / 非法链接 / 网络 / 鉴权 / 结构异常）都返回 null，调用方降级展示。
 *
 * 走 GoatCounter /api/v0/stats/hits，用 include_paths + path_by_name 过滤到单一路径，
 * 返回该路径在区间内的访客计数（count）。GoatCounter 不区分浏览量/访客，只有一个数。
 */
export async function fetchPageViews(
	settings: ShareOnlineSettings,
	shareLink: string
): Promise<PageViewStats | null> {
	if (!canReadAnalytics(settings)) return null;

	const apiBase = deriveApiBase(settings.goatcounterEndpoint.trim());
	if (!apiBase) return null;

	const urlPath = extractPathname(shareLink);
	if (!urlPath) return null;

	const end = new Date().toISOString();
	const query =
		`?start=${encodeURIComponent(STATS_START)}&end=${encodeURIComponent(end)}` +
		`&path_by_name=true&include_paths=${encodeURIComponent(urlPath)}&limit=1`;
	const url = `${apiBase}/stats/hits${query}`;

	try {
		const res = await requestUrl({
			url,
			method: "GET",
			headers: STATS_HEADERS,
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) return null;
		// res.json is a getter that throws on a non-JSON body (e.g. an HTML error
		// page from a proxy); the outer catch turns that into a null result.
		return parseStatsResponse(res.json);
	} catch {
		return null;
	}
}

/** 单页拉取上限，避免某些异常下无限翻页。100 页 × 100 条 = 上万分享页足矣。 */
const MAX_HITS_PAGES = 100;

/**
 * 批量拉取站点全部路径的累计访问数，供统计页与本库已发布列表对齐。
 * 返回 path（pathname）→ count 的映射；配置不全 / 首次请求失败返回 null（调用方据此降级）。
 *
 * GoatCounter stats/hits 每页至多 100 条，按 count 降序；翻页方式是把已取到的
 * path_id 全部塞进 exclude_paths。首页之后的失败只截断、保留已得部分，不整体作废。
 */
export async function fetchAllPathHits(
	settings: ShareOnlineSettings
): Promise<Map<string, number> | null> {
	if (!canReadAnalytics(settings)) return null;
	const apiBase = deriveApiBase(settings.goatcounterEndpoint.trim());
	if (!apiBase) return null;

	const end = new Date().toISOString();
	const byPath = new Map<string, number>();
	const seenIds: number[] = [];
	let gotAnyPage = false;

	try {
		for (let page = 0; page < MAX_HITS_PAGES; page++) {
			const exclude = seenIds.map((id) => `&exclude_paths=${id}`).join("");
			const url =
				`${apiBase}/stats/hits` +
				`?start=${encodeURIComponent(STATS_START)}&end=${encodeURIComponent(end)}` +
				`&limit=100${exclude}`;
			const res = await requestUrl({
				url,
				method: "GET",
				headers: STATS_HEADERS,
				throw: false,
			});
			if (res.status < 200 || res.status >= 300) return gotAnyPage ? byPath : null;

			let body: unknown;
			try {
				body = res.json;
			} catch {
				return gotAnyPage ? byPath : null;
			}
			const list = parseHitsList(body);
			if (list === null) return gotAnyPage ? byPath : null;
			gotAnyPage = true;
			for (const hit of list) {
				byPath.set(hit.path, hit.count);
				if (hit.pathId != null) seenIds.push(hit.pathId);
			}
			const more = (body as Record<string, unknown>)?.more === true;
			if (!more || list.length === 0) break;
		}
		return byPath;
	} catch {
		return gotAnyPage ? byPath : null;
	}
}

/** 详情弹窗每个维度最多展示的条目数。 */
const DETAIL_DIMENSION_LIMIT = 10;
/** 每日趋势图回看天数。 */
const DETAIL_TREND_DAYS = 30;
/** 可逐路径过滤的维度端点（GoatCounter /api/v0/stats/<page>），均接受 include_paths。 */
const DETAIL_DIMENSIONS = [
	"toprefs",
	"browsers",
	"systems",
	"sizes",
	"locations",
	"languages",
] as const;

/** GoatCounter 维度端点名 → PageDetail 字段名（详情弹窗逐块填充时用）。 */
const DIMENSION_TO_KEY = {
	toprefs: "referrers",
	browsers: "browsers",
	systems: "systems",
	sizes: "sizes",
	locations: "locations",
	languages: "languages",
} as const;

/** 详情弹窗可逐块渲染的部件键：每日趋势 + 六个维度。 */
export type PageDetailPartKey = "daily" | (typeof DIMENSION_TO_KEY)[keyof typeof DIMENSION_TO_KEY];

/**
 * 拉取单个分享页的完整可读维度（详情弹窗用）。
 * 未配置 / 非法链接返回 null；否则顺序拉取近 30 天每日趋势 + 全时段六个维度，
 * 任一子请求失败仅令该维度为空数组，不拖垮整体。概览访问数由调用方用列表已知计数提供。
 *
 * 各部件是分开请求的：传入 `onPart` 即可在每块到达时立即回调（先拿到的先显示），
 * 无需等待整体完成；返回的 Promise 仍在全部完成后 resolve 出完整 PageDetail。
 */
export async function fetchPageDetail(
	settings: ShareOnlineSettings,
	shareLink: string,
	onPart?: (key: PageDetailPartKey, value: PageDetail["daily"] | DimensionItem[]) => void
): Promise<PageDetail | null> {
	if (!canReadAnalytics(settings)) return null;
	const apiBase = deriveApiBase(settings.goatcounterEndpoint.trim());
	if (!apiBase) return null;
	const urlPath = extractPathname(shareLink);
	if (!urlPath) return null;

	const end = new Date().toISOString();
	const trendStart = new Date(Date.now() - DETAIL_TREND_DAYS * 86_400_000).toISOString();
	const scope =
		`&path_by_name=true&include_paths=${encodeURIComponent(urlPath)}`;

	/** 从 GoatCounter 429 文案（"try again in 296.6ms"）解析建议等待毫秒数，失败回退 500ms。 */
	const parseRetryMs = (text: string): number => {
		const m = /try again in ([\d.]+)ms/.exec(text);
		const ms = m ? Number(m[1]) : NaN;
		return Number.isFinite(ms) ? Math.ceil(ms) + 50 : 500;
	};

	/**
	 * GET + parse，失败统一返回 fallback（绝不抛出）。
	 * GoatCounter 对突发请求限流（429），按响应建议的等待时间退避重试至多 3 次。
	 */
	const get = async <T>(query: string, parse: (json: unknown) => T | null, fallback: T): Promise<T> => {
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				const res = await requestUrl({
					url: `${apiBase}${query}`,
					method: "GET",
					headers: STATS_HEADERS,
					throw: false,
				});
				if (res.status === 429) {
					await sleep(parseRetryMs(res.text));
					continue;
				}
				if (res.status < 200 || res.status >= 300) return fallback;
				return parse(res.json) ?? fallback;
			} catch {
				return fallback;
			}
		}
		return fallback;
	};

	const dailyQuery =
		`/stats/hits?start=${encodeURIComponent(trendStart)}&end=${encodeURIComponent(end)}` +
		`&daily=true&limit=1${scope}`;
	const dimQuery = (page: string) =>
		`/stats/${page}?start=${encodeURIComponent(STATS_START)}&end=${encodeURIComponent(end)}` +
		`&limit=${DETAIL_DIMENSION_LIMIT}${scope}`;

	// 顺序请求（而非 Promise.all 并发），避免 GoatCounter 对突发请求限流（429）；
	// get 内仍带 429 退避重试兜底。每块到手即回调，让弹窗逐块渲染。
	const daily = await get(dailyQuery, parseDailySeries, [] as PageDetail["daily"]);
	onPart?.("daily", daily);
	const dims: Record<string, DimensionItem[]> = {};
	for (const page of DETAIL_DIMENSIONS) {
		const items = await get(dimQuery(page), parseDimensionStats, [] as DimensionItem[]);
		dims[page] = items;
		onPart?.(DIMENSION_TO_KEY[page], items);
	}

	return {
		daily,
		referrers: dims.toprefs,
		browsers: dims.browsers,
		systems: dims.systems,
		sizes: dims.sizes,
		locations: dims.locations,
		languages: dims.languages,
	};
}
