import { describe, it, expect } from "vitest";
import { getUmamiScriptTag } from "./analytics";
import { extractPathname } from "./analytics";

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
