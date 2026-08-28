import { describe, it, expect } from "vitest";
import { extractSubpathContent, resolveInlineBases } from "./renderer";

// A small note whose offsets we compute directly so the cache entries are honest.
const raw = [
  "# Title",                 // 0
  "",
  "intro",
  "",
  "## 9. 表格 Tables",        // heading we embed
  "",
  "| a | b |",
  "| - | - |",
  "",
  "### sub",                 // deeper heading — part of section 9
  "deep",
  "",
  "## 10. Next",             // ends section 9
  "after",
  "",
  "a block here ^block-id-example",
].join("\n");

const off = (needle: string) => raw.indexOf(needle);

const headings = [
  { heading: "Title", level: 1, position: { start: { offset: off("# Title") } } },
  { heading: "9. 表格 Tables", level: 2, position: { start: { offset: off("## 9. 表格 Tables") } } },
  { heading: "sub", level: 3, position: { start: { offset: off("### sub") } } },
  { heading: "10. Next", level: 2, position: { start: { offset: off("## 10. Next") } } },
];

const blockStart = off("a block here ^block-id-example");
const blocks = {
  "block-id-example": {
    position: { start: { offset: blockStart }, end: { offset: raw.length } },
  },
};

describe("extractSubpathContent", () => {
  it("extracts a heading section up to the next same-level heading (including deeper subsections)", () => {
    const out = extractSubpathContent(raw, headings, blocks, "9. 表格 Tables");
    expect(out).toContain("## 9. 表格 Tables");
    expect(out).toContain("| a | b |");
    expect(out).toContain("### sub"); // deeper heading stays inside the section
    expect(out).toContain("deep");
    expect(out).not.toContain("## 10. Next"); // stops at the next h2
    expect(out).not.toContain("after");
  });

  it("matches heading text case-insensitively and ignoring extra whitespace", () => {
    expect(extractSubpathContent(raw, headings, blocks, "9.  表格 tables")).toContain("| a | b |");
  });

  it("extracts a block by its ^id (case-insensitive)", () => {
    const out = extractSubpathContent(raw, headings, blocks, "^Block-Id-Example");
    expect(out).toContain("a block here");
  });

  it("returns empty string for an unknown subpath", () => {
    expect(extractSubpathContent(raw, headings, blocks, "Nope")).toBe("");
    expect(extractSubpathContent(raw, headings, blocks, "^missing")).toBe("");
    expect(extractSubpathContent(raw, headings, blocks, "")).toBe("");
  });
});

describe("resolveInlineBases", () => {
  it("swaps a ```base fenced block for a data-base-inline placeholder", () => {
    const md = [
      "intro",
      "",
      "```base",
      "views:",
      "  - type: table",
      "```",
      "",
      "outro",
    ].join("\n");
    const out = resolveInlineBases(md);
    expect(out).not.toContain("```base");
    const m = out.match(/data-base-inline="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(decodeURIComponent(m![1])).toBe("views:\n  - type: table");
    expect(out).toContain("intro");
    expect(out).toContain("outro");
  });

  it("handles multiple blocks and longer fences", () => {
    const md = "````base\na\n````\n\ntext\n\n```base\nb\n```";
    const out = resolveInlineBases(md);
    const all = [...out.matchAll(/data-base-inline="([^"]+)"/g)].map(x => decodeURIComponent(x[1]));
    expect(all).toEqual(["a", "b"]);
  });

  it("leaves non-base fenced blocks untouched", () => {
    const md = "```js\nconst base = 1;\n```";
    expect(resolveInlineBases(md)).toBe(md);
  });
});
