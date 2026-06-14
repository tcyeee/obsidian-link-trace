import { describe, it, expect } from "vitest";
import { getUmamiScriptTag } from "./analytics";

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
