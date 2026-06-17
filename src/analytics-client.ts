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
	const apiToken = settings.goatcounterApiToken.trim();

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
			headers: {
				Authorization: `Bearer ${apiToken}`,
				accept: "application/json",
			},
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
	const apiToken = settings.goatcounterApiToken.trim();
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
				headers: { Authorization: `Bearer ${apiToken}`, accept: "application/json" },
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

/**
 * 拉取单个分享页的完整可读维度（详情弹窗用）。
 * 未配置 / 非法链接返回 null；否则并发拉取近 30 天每日趋势 + 全时段六个维度，
 * 任一子请求失败仅令该维度为空数组，不拖垮整体。概览访问数由调用方用列表已知计数提供。
 */
export async function fetchPageDetail(
	settings: ShareOnlineSettings,
	shareLink: string
): Promise<PageDetail | null> {
	if (!canReadAnalytics(settings)) return null;
	const apiToken = settings.goatcounterApiToken.trim();
	const apiBase = deriveApiBase(settings.goatcounterEndpoint.trim());
	if (!apiBase) return null;
	const urlPath = extractPathname(shareLink);
	if (!urlPath) return null;

	const end = new Date().toISOString();
	const trendStart = new Date(Date.now() - DETAIL_TREND_DAYS * 86_400_000).toISOString();
	const scope =
		`&path_by_name=true&include_paths=${encodeURIComponent(urlPath)}`;

	/** GET + parse，失败统一返回 fallback（绝不抛出）。 */
	const get = async <T>(query: string, parse: (json: unknown) => T | null, fallback: T): Promise<T> => {
		try {
			const res = await requestUrl({
				url: `${apiBase}${query}`,
				method: "GET",
				headers: { Authorization: `Bearer ${apiToken}`, accept: "application/json" },
				throw: false,
			});
			if (res.status < 200 || res.status >= 300) return fallback;
			return parse(res.json) ?? fallback;
		} catch {
			return fallback;
		}
	};

	const dailyQuery =
		`/stats/hits?start=${encodeURIComponent(trendStart)}&end=${encodeURIComponent(end)}` +
		`&daily=true&limit=1${scope}`;
	const dimQuery = (page: string) =>
		`/stats/${page}?start=${encodeURIComponent(STATS_START)}&end=${encodeURIComponent(end)}` +
		`&limit=${DETAIL_DIMENSION_LIMIT}${scope}`;

	const [daily, referrers, browsers, systems, sizes, locations, languages] = await Promise.all([
		get(dailyQuery, parseDailySeries, [] as PageDetail["daily"]),
		...DETAIL_DIMENSIONS.map((page) =>
			get(dimQuery(page), parseDimensionStats, [] as DimensionItem[])
		),
	]);

	return { daily, referrers, browsers, systems, sizes, locations, languages };
}
