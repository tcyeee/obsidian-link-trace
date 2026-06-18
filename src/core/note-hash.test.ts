import { describe, it, expect } from "vitest";
import { stripFrontmatter, hashBody } from "./note-hash";

describe("stripFrontmatter", () => {
	it("removes a leading frontmatter block", () => {
		const raw = "---\nshare_link: https://x/ab\n---\n# Title\nbody";
		expect(stripFrontmatter(raw)).toBe("# Title\nbody");
	});

	it("returns the input unchanged when there is no frontmatter", () => {
		expect(stripFrontmatter("# Title\nbody")).toBe("# Title\nbody");
	});
});

describe("hashBody", () => {
	it("is stable for identical input", () => {
		expect(hashBody("# Title\nbody")).toBe(hashBody("# Title\nbody"));
	});

	it("changes when the body changes", () => {
		expect(hashBody("# Title\nbody")).not.toBe(hashBody("# Title\nbody!"));
	});

	it("is unaffected by frontmatter-only changes once stripped", () => {
		const a = "---\nshare_link: https://x/ab\n---\n# Title\nbody";
		const b = "---\nshare_link: https://x/ab\nshare_time: 2026-06-15\nshare_hash: zzz\n---\n# Title\nbody";
		expect(hashBody(stripFrontmatter(a))).toBe(hashBody(stripFrontmatter(b)));
	});
});
