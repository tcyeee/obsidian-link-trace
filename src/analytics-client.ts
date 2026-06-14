import { requestUrl } from "obsidian";
import type { ShareOnlineSettings } from "./settings";
import { parseStatsResponse, extractPathname, type PageViewStats } from "./analytics";

/** Umami Cloud API 基址。后续若迁自托管，改这里即可。 */
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
