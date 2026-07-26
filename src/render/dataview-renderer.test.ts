import { describe, it, expect } from "vitest";
import { resolveDataviewBlocks } from "./dataview-renderer";

describe("resolveDataviewBlocks", () => {
  const query = 'TABLE file.mtime AS "Modified"\nFROM #project\nSORT file.mtime DESC';
  const note = `# Title\n\nSome text.\n\n\`\`\`dataview\n${query}\n\`\`\`\n\nMore text.`;

  it("replaces the code block with a placeholder div carrying the query, round-trippable via base64", () => {
    const out = resolveDataviewBlocks(note);
    expect(out).not.toContain("```dataview");
    const m = out.match(/data-dataview-query="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(Buffer.from(m![1], "base64").toString("utf-8")).toBe(query);
  });

  it("finds every dataview block in a note", () => {
    const two = "```dataview\nLIST\n```\n\ntext\n\n```dataview\nTASK\n```\n";
    const out = resolveDataviewBlocks(two);
    const matches = Array.from(out.matchAll(/data-dataview-query="([^"]+)"/g));
    expect(matches.map((m) => Buffer.from(m[1], "base64").toString("utf-8"))).toEqual([
      "LIST",
      "TASK",
    ]);
  });

  it("leaves an unrelated fenced code block untouched", () => {
    const md = "```js\nconsole.log('dataview');\n```";
    expect(resolveDataviewBlocks(md)).toBe(md);
  });

  it("does not match a plain ```dataview fence with no matching close", () => {
    const md = "```dataview\nLIST\n";
    expect(resolveDataviewBlocks(md)).toBe(md);
  });

  it("leaves dataviewjs blocks untouched (not yet supported)", () => {
    const md = "```dataviewjs\ndv.list(dv.pages());\n```";
    expect(resolveDataviewBlocks(md)).toBe(md);
  });
});
