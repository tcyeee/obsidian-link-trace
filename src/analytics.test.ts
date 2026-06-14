import { describe, it, expect } from "vitest";
import {
	getUmamiScriptTag,
	extractPathname,
	parseStatsResponse,
	getAnalyticsInjectConfig,
} from "./analytics";

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

	it("对属性值中的 & 符号做转义，避免双重编码", () => {
		const tag = getUmamiScriptTag({
			scriptUrl: "https://x.com?a=1&b=2",
			websiteId: "id",
		});
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

	it("启用但缺 scriptUrl 返回 undefined", () => {
		expect(
			getAnalyticsInjectConfig({
				analyticsEnabled: true,
				umamiScriptUrl: "   ",
				umamiWebsiteId: "abc-123",
			})
		).toBeUndefined();
	});
});
