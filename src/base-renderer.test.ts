import { describe, it, expect } from "vitest";
import type { TFile, CachedMetadata } from "obsidian";
import { evalExpr, evalFilterAtom, type EvalCtx } from "./base-renderer";

/* ── Test fixtures ──────────────────────────────────────────────────────── */

function fakeFile(opts: Partial<{ basename: string; name: string; path: string; parent: string; ext: string; size: number; mtime: number; ctime: number }> = {}): TFile {
  return {
    basename:  opts.basename ?? "note",
    name:      opts.name ?? (opts.basename ? opts.basename + ".md" : "note.md"),
    path:      opts.path ?? "note.md",
    extension: opts.ext ?? "md",
    parent:    { path: opts.parent ?? "" },
    stat:      { size: opts.size ?? 0, mtime: opts.mtime ?? 0, ctime: opts.ctime ?? 0 },
  } as unknown as TFile;
}

function fakeMeta(frontmatter: Record<string, unknown> = {}, bodyTags: string[] = []): CachedMetadata {
  return {
    frontmatter,
    tags: bodyTags.map(t => ({ tag: "#" + t })),
  } as unknown as CachedMetadata;
}

function fakeCtx(opts: Partial<{ file: TFile; fm: Record<string, unknown>; resolvedLinks: Record<string, Record<string, number>> }> = {}): EvalCtx {
  const file = opts.file ?? fakeFile();
  return {
    app: { metadataCache: { resolvedLinks: opts.resolvedLinks ?? {} } } as any,
    file,
    fm: opts.fm ?? {},
    stat: { mtime: file.stat.mtime, ctime: file.stat.ctime, size: file.stat.size },
    vaultName: "Vault",
  };
}

/* ── Filter compatibility (priority 1 — correctness) ────────────────────── */

describe("evalFilterAtom", () => {
  const meta = fakeMeta({ tags: ["master-k", "work"] });
  const file = fakeFile({ parent: "src" });

  it("returns null (→ excluded) for unrecognized syntax instead of matching everything", () => {
    expect(evalFilterAtom("some.weird.expr()", file, meta)).toBeNull();
  });

  it("supports file.hasTag with single and multiple args (any-match)", () => {
    expect(evalFilterAtom('file.hasTag("master-k")', file, meta)).toBe(true);
    expect(evalFilterAtom('file.hasTag("nope")', file, meta)).toBe(false);
    expect(evalFilterAtom('file.hasTag("nope", "work")', file, meta)).toBe(true);
  });

  it("supports containsAll / containsAny / contains", () => {
    expect(evalFilterAtom('file.tags.containsAll("master-k", "work")', file, meta)).toBe(true);
    expect(evalFilterAtom('file.tags.containsAll("master-k", "x")', file, meta)).toBe(false);
    expect(evalFilterAtom('file.tags.containsAny("x", "work")', file, meta)).toBe(true);
    expect(evalFilterAtom('file.tags.contains("work")', file, meta)).toBe(true);
  });

  it("supports leading ! negation", () => {
    expect(evalFilterAtom('!file.tags.contains("api")', file, meta)).toBe(true);
    expect(evalFilterAtom('!file.tags.contains("work")', file, meta)).toBe(false);
  });

  it("propagates null through negation (unknown stays unknown)", () => {
    expect(evalFilterAtom("!weird()", file, meta)).toBeNull();
  });

  it("supports folder and ext comparisons", () => {
    expect(evalFilterAtom('file.folder == "src"', file, meta)).toBe(true);
    expect(evalFilterAtom('file.folder != "src"', file, meta)).toBe(false);
    expect(evalFilterAtom('file.ext == "md"', file, meta)).toBe(true);
    expect(evalFilterAtom('file.inFolder("src")', file, meta)).toBe(true);
  });

  it("supports property isEmpty and equality", () => {
    const m = fakeMeta({ share_link: "https://x", status: "done" });
    expect(evalFilterAtom("!share_link.isEmpty()", file, m)).toBe(true);
    expect(evalFilterAtom("share_link.isEmpty()", file, m)).toBe(false);
    expect(evalFilterAtom('status == "done"', file, m)).toBe(true);
    expect(evalFilterAtom('status != "done"', file, m)).toBe(false);
  });

  it("supports file.tags exact set comparison", () => {
    const m = fakeMeta({ tags: ["index"] });
    expect(evalFilterAtom('file.tags != ["index"]', file, m)).toBe(false);
    expect(evalFilterAtom('file.tags == ["index"]', file, m)).toBe(true);
  });
});

/* ── Formula evaluator (priorities 2/3) ─────────────────────────────────── */

describe("evalExpr", () => {
  it("evaluates string literals and concatenation", () => {
    expect(evalExpr("'a' + 'b'", fakeCtx())).toBe("ab");
  });

  it("evaluates file.basename.slice", () => {
    const ctx = fakeCtx({ file: fakeFile({ basename: "2024-01-02 hello" }) });
    expect(evalExpr("file.basename.slice(11)", ctx)).toBe("hello");
  });

  it("evaluates if() with a numeric .length comparison", () => {
    const longCtx = fakeCtx({ file: fakeFile({ basename: "long-basename-xyz", name: "long-basename-xyz.md" }) });
    expect(evalExpr("if(file.basename.length > 13, 'long', 'short')", longCtx)).toBe("long");
    const shortCtx = fakeCtx({ file: fakeFile({ basename: "abc", name: "abc.md" }) });
    expect(evalExpr("if(file.basename.length > 13, 'long', 'short')", shortCtx)).toBe("short");
  });

  it("evaluates arithmetic with .floor() and file.size", () => {
    const ctx = fakeCtx({ file: fakeFile({ size: 2500 }) });
    expect(evalExpr("(file.size / 1000).floor() + ' kb'", ctx)).toBe("2 kb");
  });

  it("evaluates number(file.backlinks.length)", () => {
    const ctx = fakeCtx({
      file: fakeFile({ path: "target.md" }),
      resolvedLinks: { "a.md": { "target.md": 1 }, "b.md": { "target.md": 2 }, "c.md": {} },
    });
    expect(evalExpr("number(file.backlinks.length)", ctx)).toBe("2");
  });

  it("evaluates file.links.unique() as joined basenames", () => {
    const ctx = fakeCtx({
      file: fakeFile({ path: "src.md" }),
      resolvedLinks: { "src.md": { "foo/bar.md": 1, "baz.md": 1 } },
    });
    expect(evalExpr("file.links.unique()", ctx)).toBe("bar, baz");
  });

  it("renders date formatting on a frontmatter field", () => {
    const ctx = fakeCtx({ fm: { created: "2024-03-09T00:00:00" } });
    expect(evalExpr('created.format("YYYY-MM-DD")', ctx)).toBe("2024-03-09");
  });
});
