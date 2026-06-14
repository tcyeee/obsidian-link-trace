import { requestUrl } from "obsidian";
import type { ShareOnlineSettings } from "./settings";
import { parseStatsResponse, extractPathname, canReadAnalytics, type PageViewStats } from "./analytics";

/**
 * Umami Cloud API 基址，硬编码。本迭代读取仅支持 Umami Cloud：
 * 自托管实例即便注入脚本能正常工作，浏览量读取也会因打到 api.umami.is 而恒为 0。
 * 若将来要支持自托管，把它提升为设置项并允许配置。
 */
const UMAMI_API_BASE = "https://api.umami.is/v1";
/** 统计起点：取一个足够早的固定时刻，等效"全部累计"。 */
const STATS_START_AT = Date.parse("2020-01-01T00:00:00Z");

/**
 * 读取某个已发布页面的累计浏览量/访客数。
 * 任意失败（未配置 / 非法链接 / 网络 / 鉴权 / 结构异常）都返回 null，调用方降级展示。
 */
export async function fetchPageViews(
	settings: ShareOnlineSettings,
	shareLink: string
): Promise<PageViewStats | null> {
	if (!canReadAnalytics(settings)) return null;
	const apiKey = settings.umamiApiKey.trim();
	const websiteId = settings.umamiWebsiteId.trim();

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
		// res.json is a getter that throws on a non-JSON body (e.g. an HTML error
		// page from a proxy); the outer catch turns that into a null result.
		return parseStatsResponse(res.json);
	} catch {
		return null;
	}
}
