import { App, TFile, parseYaml, CachedMetadata } from "obsidian";
import { registerImage } from "./imgs-renderer";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface BaseConfig {
  filters?:    { and?: string[]; or?: string[] };
  formulas?:   Record<string, string>;
  properties?: Record<string, { displayName?: string }>;
  views?: Array<{
    type?:             string;
    name?:             string;
    order?:            string[];
    sort?:             Array<{ property: string; direction?: string }>;
    limit?:            number;
    image?:            string;   // e.g. "note.banner" — frontmatter field for card image
    imageAspectRatio?: number;   // image height = cardSize * ratio
    cardSize?:         number;   // card width in px
    columnSize?:       Record<string, number>;  // per-column width in px
    filters?:          { and?: string[]; or?: string[] };  // view-level filters
    separator?:        string;   // list view: string joining property values (default " ")
    markers?:          string;   // list view: "bullet" | "number" | "none"
    indentProperties?: boolean;  // list view: drop trailing properties onto indented sub-lines
  }>;
}

type Stat = { mtime: number; ctime: number; size: number };

/** Eval context — passed through the expression evaluator. */
export interface EvalCtx {
  app:       App;
  file:      TFile;
  fm:        Record<string, unknown>;
  stat:      Stat;
  vaultName: string;
}

/* ── Expression parser helpers ──────────────────────────────────────────── */

/** Split comma-separated arguments respecting parentheses and string literals. */
function splitTopLevelArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0, cur = "", inStr = false, strChar = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === strChar) inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true; strChar = c; cur += c;
    } else if (c === "(" || c === "[") { depth++; cur += c; }
    else if (c === ")" || c === "]")   { depth--; cur += c; }
    else if (c === "," && depth === 0) { args.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/** Return index of the first top-level occurrence of `op` in `expr`, or -1. */
function findTopLevelOp(expr: string, op: string): number {
  let depth = 0, inStr = false, strChar = "";
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inStr) { if (c === strChar) inStr = false; }
    else if (c === '"' || c === "'") { inStr = true; strChar = c; }
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && expr.startsWith(op, i)) return i;
  }
  return -1;
}

/* ── Formula evaluator ──────────────────────────────────────────────────── */

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === ""
    || (Array.isArray(v) && v.length === 0);
}

/**
 * Evaluate a boolean expression used inside `if(cond, …)`.
 * Supports: `<prop>.isEmpty()`, leading `!` negation, and numeric/string
 * comparisons (`>`, `<`, `>=`, `<=`, `==`, `!=`).
 */
function evalBoolExpr(expr: string, ctx: EvalCtx): boolean {
  expr = expr.trim();

  if (expr.startsWith("!")) return !evalBoolExpr(expr.slice(1), ctx);

  const emptyM = expr.match(/^([\w.]+)\.isEmpty\(\)$/);
  if (emptyM) {
    const key = emptyM[1].startsWith("note.") ? emptyM[1].slice(5) : emptyM[1];
    return isEmptyValue(ctx.fm[key]);
  }

  // comparison operators (order matters: multi-char first)
  for (const op of [">=", "<=", "==", "!=", ">", "<"]) {
    const idx = findTopLevelOp(expr, op);
    if (idx === -1) continue;
    const left  = expr.slice(0, idx).trim();
    const right = expr.slice(idx + op.length).trim();
    const ln = evalNumber(left, ctx), rn = evalNumber(right, ctx);
    if (ln !== null && rn !== null) {
      switch (op) {
        case ">":  return ln >  rn;
        case "<":  return ln <  rn;
        case ">=": return ln >= rn;
        case "<=": return ln >= rn || ln === rn;
        case "==": return ln === rn;
        case "!=": return ln !== rn;
      }
    }
    // fall back to string comparison
    const ls = evalExpr(left, ctx), rs = evalExpr(right, ctx);
    return op === "!=" ? ls !== rs : op === "==" ? ls === rs : false;
  }

  return false;
}

/**
 * Try to evaluate `expr` as a number. Returns null when the expression is not
 * numeric. Supports literals, `file.size`, `file.backlinks.length`,
 * `<thing>.length`, arithmetic (`+ - * /`), parentheses and the rounding
 * methods `.floor()` / `.ceil()` / `.round()`, plus the `number(x)` wrapper.
 */
function evalNumber(expr: string, ctx: EvalCtx): number | null {
  expr = expr.trim();

  if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);

  // number(x) wrapper
  const numM = expr.match(/^number\(([\s\S]+)\)$/);
  if (numM) return evalNumber(numM[1], ctx);

  // strip a single fully-enclosing paren pair: (….)
  if (expr.startsWith("(") && findMatchingParen(expr, 0) === expr.length - 1) {
    return evalNumber(expr.slice(1, -1), ctx);
  }

  // rounding methods on a numeric sub-expression
  const roundM = expr.match(/^([\s\S]+)\.(floor|ceil|round)\(\)$/);
  if (roundM) {
    const inner = evalNumber(roundM[1], ctx);
    if (inner === null) return null;
    return roundM[2] === "floor" ? Math.floor(inner)
         : roundM[2] === "ceil"  ? Math.ceil(inner)
         : Math.round(inner);
  }

  // arithmetic — split on the lowest-precedence top-level operator
  for (const op of ["+", "-", "*", "/"]) {
    const idx = findTopLevelOp(expr, op);
    if (idx <= 0) continue;            // ignore leading sign / not found
    const l = evalNumber(expr.slice(0, idx), ctx);
    const r = evalNumber(expr.slice(idx + 1), ctx);
    if (l === null || r === null) continue;
    return op === "+" ? l + r : op === "-" ? l - r : op === "*" ? l * r : l / r;
  }

  if (expr === "file.size")             return ctx.stat.size;
  if (expr === "file.ctime")            return ctx.stat.ctime;
  if (expr === "file.mtime")            return ctx.stat.mtime;
  if (expr === "file.backlinks.length") return countBacklinks(ctx.app, ctx.file);
  if (expr === "file.links.length"
   || expr === "file.links.unique().length") return outgoingLinks(ctx.app, ctx.file).length;

  // <thing>.length on a string/array value
  const lenM = expr.match(/^([\s\S]+)\.length$/);
  if (lenM) {
    const key = lenM[1].startsWith("note.") ? lenM[1].slice(5) : lenM[1];
    if (lenM[1] === "file.basename") return ctx.file.basename.length;
    if (lenM[1] === "file.name")     return ctx.file.name.length;
    const v = ctx.fm[key];
    if (Array.isArray(v)) return v.length;
    if (typeof v === "string") return v.length;
    return null;
  }

  return null;
}

/** Index of the `)` matching the `(` at position `open`, or -1. */
function findMatchingParen(s: string, open: number): number {
  let depth = 0, inStr = false, strChar = "";
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === strChar) inStr = false; }
    else if (c === '"' || c === "'") { inStr = true; strChar = c; }
    else if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Outgoing resolved links for a file (deduplicated target paths). */
function outgoingLinks(app: App, file: TFile): string[] {
  const links = app.metadataCache.resolvedLinks?.[file.path] ?? {};
  return Object.keys(links);
}

/** Number of files that link to `file`. */
function countBacklinks(app: App, file: TFile): number {
  const all = app.metadataCache.resolvedLinks ?? {};
  let n = 0;
  for (const src in all) if (all[src][file.path]) n++;
  return n;
}

/**
 * Format a date value with a moment-style format string.
 * Tokens: YYYY MM DD HH mm ss
 */
function formatDateValue(val: string | number, fmt = "YYYY-MM-DD"): string {
  let d: Date;
  if (typeof val === "number")    d = new Date(val);
  else if (/^\d{10,}$/.test(val)) d = new Date(parseInt(val));
  else                             d = new Date(val);
  if (isNaN(d.getTime())) return String(val);

  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM:   String(d.getMonth() + 1).padStart(2, "0"),
    DD:   String(d.getDate()).padStart(2, "0"),
    HH:   String(d.getHours()).padStart(2, "0"),
    mm:   String(d.getMinutes()).padStart(2, "0"),
    ss:   String(d.getSeconds()).padStart(2, "0"),
  };
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, t => tokens[t] ?? t);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * An Obsidian-style internal link to `ctx.file`, the same shape the markdown
 * renderer emits: `data-href` carries the note path and the `internal-link`
 * class marks it, so the exporter rewrites it to the sibling exported page and
 * picks the note up as a sub-page. href is "#" until rewriteInternalLinks runs.
 */
function fileLinkHtml(ctx: EvalCtx, text: string): string {
  return `<a href="#" class="internal-link base-link" data-href="${escapeHtml(ctx.file.path)}">${escapeHtml(text)}</a>`;
}

function fmToString(v: unknown): string {
  if (Array.isArray(v)) return v.map(item => (item !== null && typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  // Only string/number/boolean/bigint/null/undefined reach here — arrays and
  // plain objects already returned above. TS can't express that exclusion for
  // `unknown` across separate branches, so the linter can't see it either.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- objects/arrays return earlier above; only primitives/null/undefined remain
  return String(v);
}

/**
 * Evaluate a Base formula expression.
 * Returns an HTML string — link() produces <a> tags, everything else is plain
 * text (already HTML-safe since it comes from trusted vault metadata).
 */
export function evalExpr(expr: string, ctx: EvalCtx): string {
  expr = expr.trim();

  // String literal 'text' or "text" — only when the quotes enclose the whole
  // expression (no second closing quote in the middle, which would mean the
  // string is actually one operand of a larger expression like 'a' + 'b').
  const strLit = expr.match(/^(['"])([\s\S]*)\1$/);
  if (strLit && expr.indexOf(strLit[1], 1) === expr.length - 1) {
    return escapeHtml(strLit[2]);
  }

  // link(path) or link(path, display)
  // Rendered as an Obsidian-style internal link to the current row's file: a
  // `data-href` carrying the note path + the `internal-link` class, so the
  // exporter's rewriteInternalLinks() can repoint it at the sibling exported
  // page (and the note is picked up as a sub-page to publish). href starts at
  // "#"; rewriteInternalLinks replaces it with the real target or leaves "#".
  const linkM = expr.match(/^link\(([\s\S]+)\)$/);
  if (linkM) {
    const args = splitTopLevelArgs(linkM[1]);
    const display = args.length >= 2
      ? evalExpr(args[1], ctx)          // already HTML-safe
      : escapeHtml(ctx.file.basename);
    return `<a href="#" class="internal-link base-link" data-href="${escapeHtml(ctx.file.path)}">${display}</a>`;
  }

  // if(cond, val1, val2)
  const ifM = expr.match(/^if\(([\s\S]+)\)$/);
  if (ifM) {
    const args = splitTopLevelArgs(ifM[1]);
    if (args.length >= 3) {
      return evalExpr(evalBoolExpr(args[0], ctx) ? args[1] : args[2], ctx);
    }
  }

  // number(x) — render the numeric value as text
  const numM = expr.match(/^number\(([\s\S]+)\)$/);
  if (numM) {
    const n = evalNumber(expr, ctx);
    if (n !== null) return String(n);
  }

  // file.links / file.links.unique() — outgoing links as a comma-joined list
  if (expr === "file.links" || expr === "file.links.unique()") {
    return outgoingLinks(ctx.app, ctx.file)
      .map(p => escapeHtml(p.replace(/\.md$/, "").split("/").pop() ?? p))
      .join(", ");
  }
  if (expr === "file.backlinks.length") return String(countBacklinks(ctx.app, ctx.file));

  // expr.format("fmt") — respect the explicit format token
  const fmtM = expr.match(/^([\s\S]+)\.format\("([^"]+)"\)$/);
  if (fmtM) {
    const inner = evalExpr(fmtM[1], ctx);
    // If inner is a timestamp string produced by file.ctime / file.mtime,
    // convert back to a number for accurate Date construction.
    const numeric = inner === String(ctx.stat.ctime) ? ctx.stat.ctime
                  : inner === String(ctx.stat.mtime) ? ctx.stat.mtime
                  : inner;
    return formatDateValue(
      typeof numeric === "number" ? numeric : String(numeric),
      fmtM[2]   // ← the actual format string, e.g. "YYYY-MM-DD"
    );
  }

  // expr.slice(n) or expr.slice(n, m)
  const sliceM = expr.match(/^([\s\S]+)\.slice\((\d+)(?:,\s*(\d+))?\)$/);
  if (sliceM) {
    const inner = evalExpr(sliceM[1], ctx);
    const start = parseInt(sliceM[2]);
    return sliceM[3] !== undefined
      ? inner.slice(start, parseInt(sliceM[3]))
      : inner.slice(start);
  }

  // String concatenation: left + right
  const plusIdx = findTopLevelOp(expr, "+");
  if (plusIdx !== -1) {
    return evalExpr(expr.slice(0, plusIdx), ctx)
         + evalExpr(expr.slice(plusIdx + 1), ctx);
  }

  // numeric expression (arithmetic, .floor()/.ceil()/.round(), file.size, .length)
  const asNum = evalNumber(expr, ctx);
  if (asNum !== null) return String(asNum);

  // file.* properties
  if (expr === "file.basename")   return escapeHtml(ctx.file.basename);
  if (expr === "file.name")       return escapeHtml(ctx.file.name);
  if (expr === "file.path")       return escapeHtml(ctx.file.path);
  if (expr === "file.ext")        return escapeHtml(ctx.file.extension);
  if (expr === "file.ctime")      return String(ctx.stat.ctime);
  if (expr === "file.mtime")      return String(ctx.stat.mtime);
  if (expr === "file.backlinks")  return "";

  // note.FIELD → frontmatter property (Obsidian Bases convention)
  if (expr.startsWith("note.")) {
    const v = ctx.fm[expr.slice(5)];
    return v !== undefined && v !== null ? escapeHtml(fmToString(v)) : "";
  }

  // frontmatter property (bare name)
  const v = ctx.fm[expr];
  return v !== undefined && v !== null ? escapeHtml(fmToString(v)) : "";
}

/* ── Filter evaluator ───────────────────────────────────────────────────── */

/** Pull the quoted string arguments out of a `fn("a", "b")` call. */
function quotedArgs(s: string): string[] {
  const matches: RegExpMatchArray | null = s.match(/["']([^"']+)["']/g);
  if (!matches) return [];
  return matches.map((a: string): string => a.replace(/["']/g, ""));
}

/**
 * Evaluate a single filter expression.
 * Returns `true`/`false` for recognized expressions, or `null` when the syntax
 * is not understood — callers treat `null` conservatively (excludes the file)
 * so an unsupported filter never silently dumps the whole vault.
 */
export function evalFilterAtom(
  expr: string,
  file: TFile,
  meta: CachedMetadata | null,
): boolean | null {
  expr = expr.trim();

  if (expr.startsWith("!")) {
    const inner = evalFilterAtom(expr.slice(1).trim(), file, meta);
    return inner === null ? null : !inner;
  }

  const bodyTags  = meta?.tags?.map(t => t.tag.replace(/^#/, "")) ?? [];
  const fmTags    = meta?.frontmatter?.["tags"] as string | string[] | undefined;
  const fmTagList: string[] = Array.isArray(fmTags) ? fmTags : (fmTags ? [String(fmTags)] : []);
  const allTags   = new Set([...bodyTags, ...fmTagList]);

  // file.tags.containsAll("a", "b") — every tag present
  const containsAllM = expr.match(/^file\.tags\.containsAll\((.+)\)$/);
  if (containsAllM) return quotedArgs(containsAllM[1]).every(t => allTags.has(t));

  // file.tags.containsAny("a", "b") — at least one present
  const containsAnyM = expr.match(/^file\.tags\.containsAny\((.+)\)$/);
  if (containsAnyM) return quotedArgs(containsAnyM[1]).some(t => allTags.has(t));

  // file.tags.contains("a")
  const containsM = expr.match(/^file\.tags\.contains\((.+)\)$/);
  if (containsM) return allTags.has(containsM[1].replace(/["']/g, ""));

  // file.hasTag("a", "b") — true if any of the given tags is present
  const hasTagM = expr.match(/^file\.hasTag\((.+)\)$/);
  if (hasTagM) return quotedArgs(hasTagM[1]).some(t => allTags.has(t));

  // file.tags == ["a", …] / != [...] — exact set comparison
  const tagsEqM = expr.match(/^file\.tags\s*(==|!=)\s*\[(.*)\]$/);
  if (tagsEqM) {
    const want = new Set(quotedArgs(tagsEqM[2]));
    const equal = want.size === allTags.size && [...want].every(t => allTags.has(t));
    return tagsEqM[1] === "==" ? equal : !equal;
  }

  // file.folder == "x" / != "x"  (also file.inFolder("x"))
  const folderM = expr.match(/^file\.folder\s*(==|!=)\s*["']([^"']+)["']$/);
  if (folderM) {
    const eq = (file.parent?.path ?? "") === folderM[2];
    return folderM[1] === "==" ? eq : !eq;
  }
  const inFolderM = expr.match(/^file\.inFolder\(["']([^"']+)["']\)$/);
  if (inFolderM) return (file.parent?.path ?? "") === inFolderM[1];

  // file.ext == "md" / != "md"
  const extM = expr.match(/^file\.ext\s*(==|!=)\s*["']([^"']+)["']$/);
  if (extM) {
    const eq = file.extension === extM[2];
    return extM[1] === "==" ? eq : !eq;
  }

  // <prop>.isEmpty()
  const emptyM = expr.match(/^([\w.]+)\.isEmpty\(\)$/);
  if (emptyM) {
    const key = emptyM[1].startsWith("note.") ? emptyM[1].slice(5) : emptyM[1];
    return isEmptyValue(meta?.frontmatter?.[key]);
  }

  // <prop> == "x" / != "x"  (frontmatter equality)
  const propEqM = expr.match(/^([\w.]+)\s*(==|!=)\s*["']([^"']*)["']$/);
  if (propEqM) {
    const key = propEqM[1].startsWith("note.") ? propEqM[1].slice(5) : propEqM[1];
    const eq = String(meta?.frontmatter?.[key] ?? "") === propEqM[3];
    return propEqM[2] === "==" ? eq : !eq;
  }

  return null;   // unrecognized → caller excludes the file
}

function matchesFilter(
  expr: string,
  file: TFile,
  meta: CachedMetadata | null,
): boolean {
  return evalFilterAtom(expr, file, meta) === true;
}

/* ── Column label resolution ────────────────────────────────────────────── */

/**
 * Derive the display label for a column key.
 *
 * Priority:
 *  1. `properties["note.COL"].displayName`  (Obsidian Bases convention)
 *  2. `properties["COL"].displayName`       (fallback)
 *  3. Strip well-known prefixes (`formula.`, `file.`)
 *  4. Return the key as-is
 */
function colLabel(col: string, properties: BaseConfig["properties"]): string {
  const bare = col.startsWith("formula.") ? col.slice(8)
             : col.startsWith("file.")    ? col.slice(5)
             : col;

  return properties?.["note." + bare]?.displayName
      ?? properties?.[bare]?.displayName
      ?? properties?.["note." + col]?.displayName
      ?? properties?.[col]?.displayName
      ?? bare;
}

/* ── Row helpers ────────────────────────────────────────────────────────── */

/** Build an evaluation context for a file. */
function makeCtx(app: App, f: TFile, vaultName: string): EvalCtx {
  const fm = (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
  const stat: Stat = { mtime: f.stat.mtime, ctime: f.stat.ctime, size: f.stat.size };
  return { app, file: f, fm, stat, vaultName };
}

/** Resolve a single column's display value (HTML) for a row. */
function cellValue(col: string, ctx: EvalCtx, formulas: Record<string, string>): string {
  if (col.startsWith("formula.")) {
    const key = col.slice(8);
    return formulas[key] ? evalExpr(formulas[key], ctx) : "";
  }
  if (col === "file.mtime")     return formatDateValue(ctx.stat.mtime);
  if (col === "file.ctime")     return formatDateValue(ctx.stat.ctime);
  if (col === "file.name")      return fileLinkHtml(ctx, ctx.file.name);
  if (col === "file.basename")  return fileLinkHtml(ctx, ctx.file.basename);
  if (col === "file.size")      return String(ctx.stat.size);
  if (col === "file.backlinks") return String(countBacklinks(ctx.app, ctx.file));
  const key = col.startsWith("note.") ? col.slice(5) : col;
  const v = ctx.fm[key];
  return v !== undefined ? escapeHtml(fmToString(v)) : "";
}

/** Resolve the columns to display for a view (explicit order or all formulas). */
function viewOrder(
  view: NonNullable<BaseConfig["views"]>[number],
  formulas: Record<string, string>,
): string[] {
  return view.order?.length ? view.order : Object.keys(formulas).map(k => `formula.${k}`);
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/** A parsed `.base` view plus the vault files it resolves to (filter/sort/limit applied). */
interface BaseQuery {
  config:     BaseConfig;
  view:       NonNullable<BaseConfig["views"]>[number];
  formulas:   Record<string, string>;
  properties: BaseConfig["properties"];
  vaultName:  string;
  matched:    TFile[];
}

/**
 * Parse a `.base` file and run its query (selected view's filter + sort + limit)
 * against the vault. Returns the matched files alongside the parsed view config,
 * or `null` when the YAML can't be parsed. Shared by the renderer and the
 * exporter's sub-page collection so both see exactly the same set of notes.
 */
async function queryBase(
  app: App,
  baseFile: TFile,
  viewName?: string
): Promise<BaseQuery | null> {
  const raw = await app.vault.read(baseFile);
  let config: BaseConfig;
  try { config = parseYaml(raw) as BaseConfig; }
  catch { return null; }

  // Select the requested view (by name) or fall back to the first one.
  const views      = config.views ?? [];
  const view       = (viewName !== undefined ? views.find(v => v.name === viewName) : undefined) ?? views[0] ?? {};
  const formulas   = config.formulas   ?? {};
  const properties = config.properties;
  const vaultName  = app.vault.getName();

  // ── Filter (base-level AND view-level filters both apply) ──
  const filterGroups = [config.filters, view.filters].filter(Boolean) as NonNullable<BaseConfig["filters"]>[];
  let matched = app.vault.getMarkdownFiles().filter(f => {
    const meta = app.metadataCache.getFileCache(f);
    return filterGroups.every(g => {
      if (g.and) return g.and.every(e => matchesFilter(e, f, meta));
      if (g.or)  return g.or.some(e  => matchesFilter(e, f, meta));
      return true;
    });
  });

  // ── Sort ──
  if (view.sort?.length) {
    const { property: sortProp, direction } = view.sort[0];
    const desc = direction?.toUpperCase() === "DESC";
    matched.sort((a, b) => {
      const getV = (f: TFile): string => {
        const ctx = makeCtx(app, f, vaultName);
        if (sortProp.startsWith("formula.")) {
          const key = sortProp.slice(8);
          return formulas[key] ? evalExpr(formulas[key], ctx) : "";
        }
        if (sortProp === "file.mtime") return String(f.stat.mtime);
        if (sortProp === "file.ctime") return String(f.stat.ctime);
        if (sortProp === "file.name")  return f.name;
        const v = ctx.fm[sortProp];
        return v !== undefined ? fmToString(v) : "";
      };
      const va = getV(a), vb = getV(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }

  // ── Limit ──
  if (view.limit) matched = matched.slice(0, view.limit);

  return { config, view, formulas, properties, vaultName, matched };
}

/**
 * The markdown files a `.base` embed resolves to, after applying the view's
 * filter/sort/limit — the same set the renderer displays. Used by the exporter
 * to treat base entries as sub-pages. Returns `[]` on a parse error.
 */
export async function queryBaseFiles(
  app: App,
  baseFile: TFile,
  viewName?: string
): Promise<TFile[]> {
  return (await queryBase(app, baseFile, viewName))?.matched ?? [];
}

/** Build an HTML table from a `.base` file by querying the vault. */
export async function renderBaseAsTable(
  app: App,
  baseFile: TFile,
  images?: Map<string, TFile>,
  viewName?: string
): Promise<string> {
  const query = await queryBase(app, baseFile, viewName);
  if (!query) return `<div class="base-error">无法解析 ${baseFile.name}</div>`;
  const { config, view, formulas, properties, vaultName, matched } = query;

  if (matched.length === 0) return `<div class="base-empty">（无匹配记录）</div>`;

  // ── Dispatch by view type ──
  const viewType = (view.type ?? "table").toLowerCase();
  if (viewType === "cards") {
    return renderCards(app, baseFile, config, view, matched, formulas, properties, vaultName, images);
  }
  if (viewType === "list") {
    return renderList(app, view, matched, formulas, vaultName);
  }

  // ── Table view ──
  const order = viewOrder(view, formulas);
  const colSize = view.columnSize ?? {};
  const colgroup = order.some(c => colSize[c])
    ? `<colgroup>${order.map(c => colSize[c] ? `<col style="width:${colSize[c]}px">` : "<col>").join("")}</colgroup>`
    : "";

  const thead = `<tr>${order.map(c => `<th>${colLabel(c, properties)}</th>`).join("")}</tr>`;

  const tbody = matched.map(f => {
    const ctx = makeCtx(app, f, vaultName);
    const cells = order.map(col => cellValue(col, ctx, formulas));
    return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
  }).join("\n");

  return `<div class="table-wrapper">\n<table>\n${colgroup}<thead>${thead}</thead>\n<tbody>\n${tbody}\n</tbody>\n</table>\n</div>`;
}

/* ── Cards / List renderer ──────────────────────────────────────────────── */

function renderCards(
  app: App,
  baseFile: TFile,
  config: BaseConfig,
  view: NonNullable<BaseConfig["views"]>[number],
  matched: TFile[],
  formulas: Record<string, string>,
  properties: BaseConfig["properties"],
  vaultName: string,
  images?: Map<string, TFile>
): string {
  const cardSize         = view.cardSize ?? 200;
  const imageAspectRatio = view.imageAspectRatio ?? 0.5;
  const imgHeight        = Math.round(cardSize * imageAspectRatio);

  // "note.banner" → "banner" (frontmatter key for the banner image)
  const imgFmKey = view.image?.startsWith("note.")
    ? view.image.slice(5)
    : view.image ?? "";

  const order = viewOrder(view, formulas);

  const cards = matched.map(f => {
    const ctx = makeCtx(app, f, vaultName);

    // ── Banner image ──
    let bannerHtml = "";
    if (imgFmKey) {
      const imgFmVal = ctx.fm[imgFmKey];
      const raw = (typeof imgFmVal === "string" ? imgFmVal : "").replace(/^\//, "");
      if (raw) {
        const imgFile =
          app.vault.getAbstractFileByPath(raw) ??
          app.metadataCache.getFirstLinkpathDest(raw, baseFile.path);
        if (imgFile instanceof TFile) {
          const src = images
            ? `images/${registerImage(imgFile, images)}`
            : `app://local/${encodeURIComponent(imgFile.path)}`;
          bannerHtml = `<img class="base-card-banner" src="${src}" alt="${escapeHtml(imgFile.name)}" style="height:${imgHeight}px">`;
        }
      }
    }

    // ── Content cells ──
    const bodyHtml = order.map(col => {
      const val = cellValue(col, ctx, formulas);
      if (!val) return "";
      const label = colLabel(col, properties);
      return `<div class="base-card-row" title="${escapeHtml(label)}">${val}</div>`;
    }).join("");

    return `<div class="base-card" style="width:${cardSize}px">${bannerHtml}${bodyHtml ? `<div class="base-card-body">${bodyHtml}</div>` : ""}</div>`;
  }).join("\n");

  return `<div class="base-cards">${cards}</div>`;
}

/* ── List renderer ──────────────────────────────────────────────────────── */

/**
 * Format one Bases `list` view row.
 *
 * Obsidian's list view shows each record as a single line: the ordered property
 * values joined by `separator` (default a space) — NOT a columnar table. Empty
 * values are skipped so there is no dangling separator. When `indentProperties`
 * is set, the first property stays on the line and the rest drop onto indented
 * sub-lines.
 */
export function formatListItem(
  values: string[],
  opts: { separator?: string; indentProperties?: boolean } = {},
): string {
  const sep = opts.separator ?? " ";
  const nonEmpty = values.filter(v => v !== "");
  if (nonEmpty.length === 0) return "";

  if (opts.indentProperties && nonEmpty.length > 1) {
    const [first, ...rest] = nonEmpty;
    const restHtml = rest.map(v => `<div class="base-list-sub">${v}</div>`).join("");
    return `<li class="base-list-item">${first}${restHtml}</li>`;
  }
  return `<li class="base-list-item">${nonEmpty.join(sep)}</li>`;
}

/**
 * Render a Bases `list` view: a bulleted list with one record per line, the
 * ordered property values joined inline by the view's `separator`. Honors the
 * `markers` (bullet / number / none) and `indentProperties` view options.
 */
function renderList(
  app: App,
  view: NonNullable<BaseConfig["views"]>[number],
  matched: TFile[],
  formulas: Record<string, string>,
  vaultName: string,
): string {
  const order            = viewOrder(view, formulas);
  const separator        = view.separator ?? " ";
  const markers          = (view.markers ?? "bullet").toLowerCase();
  const indentProperties = view.indentProperties ?? false;

  const items = matched.map(f => {
    const ctx = makeCtx(app, f, vaultName);
    const values = order.map(col => cellValue(col, ctx, formulas));
    return formatListItem(values, { separator, indentProperties });
  }).filter(Boolean).join("\n");

  const tag = markers === "number" ? "ol" : "ul";
  const cls = markers === "none" ? "base-list base-list-plain" : "base-list";
  return `<${tag} class="${cls}">${items}</${tag}>`;
}

/** Replace ![[*.base]] embeds with data-base-embed placeholder markers.
 *  Handles an optional `#ViewName` selector and an optional `|alias`.
 *  The actual table is built later via DOM post-processing in renderNote. */
export function resolveBaseEmbeds(content: string): string {
  return content.replace(
    /!\[\[([^\]#|]+\.base)(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]/g,
    (_, name, view) =>
      `\n\n<div data-base-embed="${name}"${view ? ` data-base-view="${view}"` : ""}></div>\n\n`
  );
}
