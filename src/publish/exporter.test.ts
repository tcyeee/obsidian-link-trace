import { describe, it, expect } from "vitest";
import { rewriteInternalLinks, flattenSubTree, uniquePrefixRegex, stripUniquePrefix, type SubNoteNode } from "./exporter";

describe("uniquePrefixRegex / stripUniquePrefix", () => {
	it("strips a YYYYMMDDHHmm- timestamp prefix", () => {
		expect(stripUniquePrefix("202606281230-My Note", "YYYYMMDDHHmm-")).toBe("My Note");
	});

	it("handles a space separator and no trailing literal", () => {
		expect(stripUniquePrefix("202606281230 My Note", "YYYYMMDDHHmm")).toBe("My Note");
	});

	it("strips dashed date formats", () => {
		expect(stripUniquePrefix("2026-06-28 Daily", "YYYY-MM-DD")).toBe("Daily");
	});

	it("leaves the name untouched when it lacks the prefix", () => {
		expect(stripUniquePrefix("Just A Title", "YYYYMMDDHHmm-")).toBe("Just A Title");
	});

	it("keeps the original when stripping would empty it (timestamp-only note)", () => {
		expect(stripUniquePrefix("202606281230-", "YYYYMMDDHHmm-")).toBe("202606281230-");
	});

	it("returns null (no-op) for a format with no date token", () => {
		expect(uniquePrefixRegex("")).toBeNull();
		expect(stripUniquePrefix("202606281230-My Note", "")).toBe("202606281230-My Note");
	});

	it("anchors to the start — a mid-name timestamp is not stripped", () => {
		expect(stripUniquePrefix("Note 202606281230", "YYYYMMDDHHmm")).toBe("Note 202606281230");
	});
});

describe("flattenSubTree", () => {
	const node = (name: string, depth: number, children: SubNoteNode[] = []): SubNoteNode => ({
		file: { basename: name, path: `${name}.md` } as SubNoteNode["file"],
		shareLink: "",
		depth,
		children,
	});

	it("flattens depth-first, parents before their children", () => {
		const tree = [
			node("a", 1, [node("a1", 2, [node("a1x", 3)]), node("a2", 2)]),
			node("b", 1),
		];
		expect(flattenSubTree(tree).map((n) => n.file.basename)).toEqual([
			"a",
			"a1",
			"a1x",
			"a2",
			"b",
		]);
	});

	it("returns an empty list for an empty tree", () => {
		expect(flattenSubTree([])).toEqual([]);
	});
});

describe("rewriteInternalLinks", () => {
	it("rewrites an internal link whose target was exported", () => {
		const map = new Map([["My Note", "abc"]]);
		const html =
			'<a data-href="My Note" href="My Note" class="internal-link" target="_blank">My Note</a>';
		const out = rewriteInternalLinks(html, map);
		expect(out).toContain('href="./abc.html"');
		expect(out).not.toContain('target="_blank"');
	});

	it("points an internal link to # when its target was not exported", () => {
		const map = new Map<string, string>();
		const html =
			'<a data-href="Missing" href="Missing" class="internal-link" target="_blank">Missing</a>';
		const out = rewriteInternalLinks(html, map);
		expect(out).toContain('href="#"');
	});

	it("leaves external links untouched even when Obsidian emits data-href on them", () => {
		const map = new Map<string, string>();
		const html =
			'<a data-href="https://example.com" href="https://example.com" class="external-link" rel="noopener" target="_blank">link</a>';
		const out = rewriteInternalLinks(html, map);
		expect(out).toContain('href="https://example.com"');
		expect(out).toContain('target="_blank"');
		expect(out).not.toContain('href="#"');
	});

	it("leaves mailto links untouched", () => {
		const map = new Map<string, string>();
		const html =
			'<a data-href="mailto:a@b.com" href="mailto:a@b.com" class="external-link">mail</a>';
		const out = rewriteInternalLinks(html, map);
		expect(out).toContain('href="mailto:a@b.com"');
	});

	it("strips the unique prefix from internal-link text when a stripper is given", () => {
		const map = new Map([["202606281230-My Note", "abc"]]);
		const strip = (n: string) => stripUniquePrefix(n, "YYYYMMDDHHmm-");
		const html =
			'<a data-href="202606281230-My Note" href="202606281230-My Note" class="internal-link">202606281230-My Note</a>';
		const out = rewriteInternalLinks(html, map, true, strip);
		expect(out).toContain('href="./abc.html"');
		expect(out).toContain(">My Note</a>");
		expect(out).not.toContain(">202606281230-My Note</a>");
	});

	it("strips the prefix from base file-link text too", () => {
		const strip = (n: string) => stripUniquePrefix(n, "YYYYMMDDHHmm-");
		const html =
			'<a href="#" class="internal-link base-link" data-href="src/202606281230-Doc.md">202606281230-Doc</a>';
		const out = rewriteInternalLinks(html, new Map(), false, strip);
		expect(out).toContain(">Doc</a>");
	});

	it("leaves external-link text untouched even with a stripper", () => {
		const strip = (n: string) => stripUniquePrefix(n, "YYYYMMDDHHmm-");
		const html =
			'<a data-href="https://e.com" href="https://e.com" class="external-link">202606281230-keep</a>';
		const out = rewriteInternalLinks(html, new Map(), true, strip);
		expect(out).toContain(">202606281230-keep</a>");
	});

	it("leaves aliased internal-link text untouched (no timestamp prefix)", () => {
		const map = new Map([["My Note", "abc"]]);
		const strip = (n: string) => stripUniquePrefix(n, "YYYYMMDDHHmm-");
		const html =
			'<a data-href="My Note" href="My Note" class="internal-link">Custom Alias</a>';
		const out = rewriteInternalLinks(html, map, true, strip);
		expect(out).toContain(">Custom Alias</a>");
	});
});
