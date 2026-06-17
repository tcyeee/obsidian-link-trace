import { describe, it, expect } from "vitest";
import {
	getGoatCounterScriptTag,
	extractPathname,
	deriveApiBase,
	parseStatsResponse,
	parseHitsList,
	buildStatsRows,
	getAnalyticsInjectConfig,
	canReadAnalytics,
	parseDimensionStats,
	parseDailySeries,
	type PublishedPage,
} from "./analytics";

describe("getGoatCounterScriptTag", () => {
	it("生成 data-goatcounter + async 脚本，src 为端点加 .js", () => {
		const tag = getGoatCounterScriptTag({ endpoint: "https://stats.viii.me/count" });
		expect(tag).toBe(
			'<script data-goatcounter="https://stats.viii.me/count" async src="https://stats.viii.me/count.js"></script>'
		);
	});

	it("对属性值中的双引号做转义，避免破坏 HTML", () => {
		const tag = getGoatCounterScriptTag({ endpoint: 'https://x/count"onerror="alert(1)' });
		expect(tag).not.toContain('"onerror="');
		expect(tag).toContain("&quot;");
	});

	it("对属性值中的 & 符号做转义，避免双重编码", () => {
		const tag = getGoatCounterScriptTag({ endpoint: "https://x.com/count?a=1&b=2" });
		expect(tag).toContain("a=1&amp;b=2");
		expect(tag).not.toContain("&amp;amp;");
	});
});

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

describe("deriveApiBase", () => {
	it("取 origin 拼 /api/v0", () => {
		expect(deriveApiBase("https://stats.viii.me/count")).toBe("https://stats.viii.me/api/v0");
	});

	it("忽略端点的路径与端口以外的部分", () => {
		expect(deriveApiBase("https://stats.viii.me:8443/count")).toBe(
			"https://stats.viii.me:8443/api/v0"
		);
	});

	it("非法输入返回 null", () => {
		expect(deriveApiBase("")).toBeNull();
		expect(deriveApiBase("not a url")).toBeNull();
	});
});

describe("parseStatsResponse", () => {
	it("从 hits[].count 求和得到浏览量", () => {
		const json = {
			hits: [{ path: "/notes/ab3", count: 123, path_id: 7 }],
			total: 123,
			more: false,
		};
		expect(parseStatsResponse(json)).toEqual({ views: 123 });
	});

	it("路径无访问时 hits 为空，按 0 处理", () => {
		expect(parseStatsResponse({ hits: [], total: 0, more: false })).toEqual({ views: 0 });
	});

	it("缺 hits 时兜底用顶层 total", () => {
		expect(parseStatsResponse({ total: 42 })).toEqual({ views: 42 });
	});

	it("结构异常时返回 null", () => {
		expect(parseStatsResponse(null)).toBeNull();
		expect(parseStatsResponse({})).toBeNull();
		expect(parseStatsResponse({ hits: "nope" })).toBeNull();
	});
});

describe("parseHitsList", () => {
	it("提取每条路径的 path/count/path_id", () => {
		const json = {
			hits: [
				{ path: "/notes/ab3", count: 512, path_id: 7, title: "深入 Rust" },
				{ path: "/notes/cd9", count: 98, path_id: 9 },
			],
			more: false,
		};
		expect(parseHitsList(json)).toEqual([
			{ path: "/notes/ab3", count: 512, pathId: 7 },
			{ path: "/notes/cd9", count: 98, pathId: 9 },
		]);
	});

	it("path_id 缺失时记为 null", () => {
		expect(parseHitsList({ hits: [{ path: "/x", count: 1 }] })).toEqual([
			{ path: "/x", count: 1, pathId: null },
		]);
	});

	it("逐条跳过缺 path 或 count 的项", () => {
		const json = { hits: [{ path: "/x", count: 3 }, { path: "/y" }, { count: 5 }] };
		expect(parseHitsList(json)).toEqual([{ path: "/x", count: 3, pathId: null }]);
	});

	it("无 hits 数组返回 null", () => {
		expect(parseHitsList(null)).toBeNull();
		expect(parseHitsList({})).toBeNull();
		expect(parseHitsList({ hits: "nope" })).toBeNull();
	});
});

describe("buildStatsRows", () => {
	const pages: PublishedPage[] = [
		{ path: "/notes/a", title: "A", shareLink: "https://x/notes/a", publishedAt: 100, filePath: "A.md" },
		{ path: "/notes/b", title: "B", shareLink: "https://x/notes/b", publishedAt: 200, filePath: "B.md" },
		{ path: "/notes/c", title: "C", shareLink: "https://x/notes/c", publishedAt: 300, filePath: "C.md" },
	];

	it("按访问数降序对齐命中，未命中页计 0", () => {
		const hits = new Map([
			["/notes/a", 50],
			["/notes/c", 120],
		]);
		const rows = buildStatsRows(pages, hits);
		expect(rows.map((r) => [r.title, r.views])).toEqual([
			["C", 120],
			["A", 50],
			["B", 0],
		]);
	});

	it("访问数相同时按发布时间降序", () => {
		const rows = buildStatsRows(pages, new Map());
		// 全部 0 访问 → 发布时间晚的在前
		expect(rows.map((r) => r.title)).toEqual(["C", "B", "A"]);
	});

	it("不改动原数组", () => {
		const copy = [...pages];
		buildStatsRows(pages, new Map());
		expect(pages).toEqual(copy);
	});
});

describe("parseDimensionStats", () => {
	it("提取每条维度项的 name/count，并保留 id（存在时）", () => {
		const json = {
			stats: [
				{ id: "chrome", name: "Chrome", count: 10 },
				{ name: "Firefox", count: 3 },
			],
			more: false,
		};
		expect(parseDimensionStats(json)).toEqual([
			{ id: "chrome", name: "Chrome", count: 10 },
			{ name: "Firefox", count: 3 },
		]);
	});

	it("保留屏幕尺寸维度的 id（name 为空，标签需由 id 推导）", () => {
		const json = {
			stats: [
				{ id: "desktophd", name: "", count: 3 },
				{ id: "unknown", name: "", count: 0 },
			],
		};
		expect(parseDimensionStats(json)).toEqual([
			{ id: "desktophd", name: "", count: 3 },
			{ id: "unknown", name: "", count: 0 },
		]);
	});

	it("逐条跳过缺 name 或 count 的项", () => {
		const json = { stats: [{ name: "Chrome", count: 5 }, { name: "X" }, { count: 9 }] };
		expect(parseDimensionStats(json)).toEqual([{ name: "Chrome", count: 5 }]);
	});

	it("空 stats 数组返回空数组（合法的无数据）", () => {
		expect(parseDimensionStats({ stats: [] })).toEqual([]);
	});

	it("无 stats 数组返回 null", () => {
		expect(parseDimensionStats(null)).toBeNull();
		expect(parseDimensionStats({})).toBeNull();
		expect(parseDimensionStats({ stats: "nope" })).toBeNull();
	});
});

describe("parseDailySeries", () => {
	it("从 hits[0].stats 提取 day/daily 为每日序列", () => {
		const json = {
			hits: [
				{
					path: "/notes/ab3",
					count: 5,
					stats: [
						{ day: "2026-06-01", daily: 5 },
						{ day: "2026-06-02", daily: 0 },
					],
				},
			],
			more: false,
		};
		expect(parseDailySeries(json)).toEqual([
			{ day: "2026-06-01", count: 5 },
			{ day: "2026-06-02", count: 0 },
		]);
	});

	it("路径无访问时 hits 为空，返回空序列", () => {
		expect(parseDailySeries({ hits: [], more: false })).toEqual([]);
	});

	it("hits[0] 缺 stats 时返回空序列", () => {
		expect(parseDailySeries({ hits: [{ path: "/x", count: 0 }] })).toEqual([]);
	});

	it("逐条跳过缺 day 或 daily 的点", () => {
		const json = {
			hits: [{ path: "/x", count: 1, stats: [{ day: "2026-06-01", daily: 1 }, { day: "2026-06-02" }] }],
		};
		expect(parseDailySeries(json)).toEqual([{ day: "2026-06-01", count: 1 }]);
	});

	it("无 hits 数组返回 null", () => {
		expect(parseDailySeries(null)).toBeNull();
		expect(parseDailySeries({})).toBeNull();
		expect(parseDailySeries({ hits: "nope" })).toBeNull();
	});
});

describe("getAnalyticsInjectConfig", () => {
	it("endpoint 非空时返回注入配置（默认常开）", () => {
		expect(
			getAnalyticsInjectConfig({
				goatcounterEndpoint: "https://stats.viii.me/count",
			})
		).toEqual({ endpoint: "https://stats.viii.me/count" });
	});

	it("缺 endpoint（仅空白）返回 undefined", () => {
		expect(
			getAnalyticsInjectConfig({
				goatcounterEndpoint: "   ",
			})
		).toBeUndefined();
	});
});

describe("canReadAnalytics", () => {
	it("endpoint 非空即为 true（无需 token，服务端注入只读 token）", () => {
		expect(
			canReadAnalytics({
				goatcounterEndpoint: "https://stats.viii.me/count",
			})
		).toBe(true);
	});

	it("缺 endpoint（仅空白）为 false", () => {
		expect(
			canReadAnalytics({
				goatcounterEndpoint: "",
			})
		).toBe(false);
	});
});
