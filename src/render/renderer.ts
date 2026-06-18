import { App, TFile, MarkdownRenderer, Component, FileSystemAdapter } from "obsidian";
import { renderBaseAsTable, resolveBaseEmbeds } from "./base-renderer";
import { registerImage, processImgsBlocks } from "./imgs-renderer";
import { stripFrontmatter } from "../core/note-hash";
import { buildCss } from "./page-css";

/* ── Math extraction ──────────────────────────────────────────────────────
   Extract $$...$$ and $...$ before Obsidian processes the markdown,
   so we can hand them to KaTeX in the exported HTML.
──────────────────────────────────────────────────────────────────────── */
interface MathEntry { type: "display" | "inline"; latex: string; }

function extractMath(content: string): { processed: string; entries: MathEntry[] } {
  const entries: MathEntry[] = [];
  const codes: string[] = [];

  // Protect fenced code blocks and inline code from math extraction
  let processed = content.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    codes.push(m);
    return `C${codes.length - 1}`;
  });

  // Extract display math $$...$$
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_: string, latex: string) => {
    const i = entries.length;
    entries.push({ type: "display", latex: latex.trim() });
    return `\n<div class="math-d" data-mi="${i}"></div>\n`;
  });

  // Extract inline math $...$
  processed = processed.replace(/\$([^\n$]+?)\$/g, (_: string, latex: string) => {
    const i = entries.length;
    entries.push({ type: "inline", latex });
    return `<span class="math-i" data-mi="${i}"></span>`;
  });

  // Restore code blocks (placeholder format: C{n} using PUA delimiter chars)
  processed = processed.replace(/C(\d+)/g, (_, i) => codes[+i]);
  return { processed, entries };
}

/* ── Image collection helpers ───────────────────────────────────────────── */

/**
 * Scan the rendered DOM for images, collect the originating TFiles,
 * and rewrite every img[src] to a relative `images/{name}` path.
 * Pass a pre-populated `images` map to share it with processImgsBlocks.
 */
function collectImages(
  app: App,
  sourceFile: TFile,
  el: HTMLElement,
  images = new Map<string, TFile>()
): Map<string, TFile> {
  const vaultBasePath =
    app.vault.adapter instanceof FileSystemAdapter
      ? app.vault.adapter.getBasePath()
      : "";

  // ── 1. Obsidian wiki-style embeds: .internal-embed[src] wrapping an <img> ──
  el.querySelectorAll<HTMLElement>(".internal-embed").forEach((embed) => {
    const imgEl = embed.querySelector<HTMLImageElement>("img");
    if (!imgEl) return;
    const src = embed.getAttribute("src") ?? "";
    const imgFile = app.metadataCache.getFirstLinkpathDest(src, sourceFile.path);
    if (!imgFile) return;
    const name = registerImage(imgFile, images);
    imgEl.setAttribute("src", `images/${name}`);
    imgEl.removeAttribute("srcset");
  });

  // ── 2. Standalone <img> with app://local/... src (markdown-style images) ──
  el.querySelectorAll<HTMLImageElement>("img").forEach(img => {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("app://local") || !vaultBasePath) return;
    try {
      const absPath = decodeURIComponent(src.replace(/^app:\/\/local/, ""));
      if (!absPath.startsWith(vaultBasePath)) return;
      const relPath = absPath.slice(vaultBasePath.length).replace(/^[/\\]/, "");
      const imgFile = app.vault.getAbstractFileByPath(relPath);
      if (!(imgFile instanceof TFile)) return;
      const name = registerImage(imgFile, images);
      img.setAttribute("src", `images/${name}`);
      img.removeAttribute("srcset");
    } catch { /* external or malformed URL — leave as-is */ }
  });

  return images;
}

/* ── Self-embed resolution ─────────────────────────────────────────────────
   A note that transcludes a section/block of *itself* — `![[ThisNote#heading]]`
   or `![[ThisNote#^block]]` — is fine in Obsidian's live preview (the subpath is
   honored, so only that slice renders). But the detached `MarkdownRenderer.render()`
   used for export does NOT honor the subpath: the embed pulls in the *whole* note,
   which contains the same self-embed again → it recurses to Obsidian's embed-depth
   limit (~6), exploding the output to many times the note's real size.

   To prevent this we resolve self-embeds ourselves *before* handing markdown to
   the renderer: replace `![[Self#sub]]` with the target slice inlined as plain
   markdown (with nested self-embeds stripped so nothing can re-expand), and drop
   bare full self-embeds (`![[Self]]`) which would recurse infinitely. Embeds that
   point at *other* files (notes, images) are left untouched for Obsidian to handle.
──────────────────────────────────────────────────────────────────────── */

const EMBED_RE = /!\[\[([^\]\n]+)\]\]/g;

/** Split an embed target `path#sub|alias` into its link path and subpath. */
function parseEmbedTarget(inner: string): { linkPart: string; subpath: string } {
  const main = inner.split("|")[0];
  const hashIdx = main.indexOf("#");
  return {
    linkPart: (hashIdx >= 0 ? main.slice(0, hashIdx) : main).trim(),
    subpath: hashIdx >= 0 ? main.slice(hashIdx + 1).trim() : "",
  };
}

interface HeadingLike { heading: string; level: number; position: { start: { offset: number } }; }
interface BlockLike { position: { start: { offset: number }; end: { offset: number } }; }

/**
 * Extract the markdown slice a subpath points at, from the note's raw text.
 * `headings`/`blocks` are Obsidian's metadata cache entries (offsets index `raw`).
 * Returns "" when the target can't be found. Pure — unit-tested.
 */
export function extractSubpathContent(
  raw: string,
  headings: HeadingLike[],
  blocks: Record<string, BlockLike>,
  subpath: string
): string {
  if (!subpath) return "";

  // Block reference: `^id` (ids are case-insensitive, cached lowercase).
  if (subpath.startsWith("^")) {
    const block = blocks?.[subpath.slice(1).toLowerCase()];
    if (!block) return "";
    return raw.slice(block.position.start.offset, block.position.end.offset).trim();
  }

  // Heading section: from the heading line until the next heading of equal/higher level.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const target = norm(subpath.split("#").pop() ?? subpath);
  const idx = (headings ?? []).findIndex((h) => norm(h.heading) === target);
  if (idx < 0) return "";
  const level = headings[idx].level;
  const start = headings[idx].position.start.offset;
  let end = raw.length;
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j].level <= level) {
      end = headings[j].position.start.offset;
      break;
    }
  }
  return raw.slice(start, end).trimEnd();
}

/**
 * Replace self-referential embeds in `content` with their inlined target slice,
 * extracted from `raw`. Non-self embeds are left for Obsidian's renderer.
 */
function resolveSelfEmbeds(app: App, file: TFile, content: string, raw: string): string {
  const cache = app.metadataCache.getFileCache(file);
  const headings = (cache?.headings ?? []) as unknown as HeadingLike[];
  const blocks = (cache?.blocks ?? {}) as unknown as Record<string, BlockLike>;

  const isSelf = (linkPart: string): boolean => {
    if (linkPart === "") return true; // `![[#heading]]` → same file
    const dest = app.metadataCache.getFirstLinkpathDest(linkPart, file.path);
    return !!dest && dest.path === file.path;
  };

  // Remove any self-embeds left inside an inlined slice so it can't re-expand.
  const stripSelf = (text: string): string =>
    text.replace(EMBED_RE, (m, inner: string) =>
      isSelf(parseEmbedTarget(inner).linkPart) ? "" : m
    );

  return content.replace(EMBED_RE, (m, inner: string) => {
    const { linkPart, subpath } = parseEmbedTarget(inner);
    if (!isSelf(linkPart)) return m;     // points elsewhere → leave to Obsidian
    if (!subpath) return "";             // bare self-embed → infinite recursion, drop
    const slice = extractSubpathContent(raw, headings, blocks, subpath);
    return slice ? `\n\n${stripSelf(slice)}\n\n` : "";
  });
}

/* ── Plugin code-block protection ──────────────────────────────────────── */

/**
 * Languages whose code blocks are rendered by Obsidian plugins and cannot
 * display correctly in a static HTML export.
 * Add more plugin languages here as needed.
 */
const PLUGIN_CODE_LANGS = new Set([
  "dataview",                         // Dataview DQL → shown as plain code block
  "dataviewjs",                       // Dataview JS → shown as plain code block
  "imgs",                             // image-cluster
  "tasks",                            // Tasks
  "chart",                            // Obsidian Charts
  "ad", "ad-note", "ad-tip",
  "ad-warning", "ad-danger",          // Admonition (legacy)
]);

/**
 * Prefix prepended to plugin language names so Obsidian finds no registered
 * processor and renders a plain <pre><code> block instead.
 */
const PLUGIN_LANG_PREFIX = "export-raw-";

/**
 * In the markdown content, rename plugin code block languages to a prefixed
 * variant that no plugin handles — e.g. ```dataview → ```export-raw-dataview.
 * The prefix is stripped back from the DOM after MarkdownRenderer runs.
 */
function protectPluginCodeBlocks(content: string): string {
  return content.replace(
    /^(`{3,})([\w][\w-]*)[ \t]*$/gm,
    (match: string, fence: string, lang: string) => {
      if (!PLUGIN_CODE_LANGS.has(lang.toLowerCase())) return match;
      return `${fence}${PLUGIN_LANG_PREFIX}${lang}`;
    }
  );
}

/** Restore the original language names in the rendered DOM. */
function restorePluginCodeLangs(el: HTMLElement): void {
  el.querySelectorAll<HTMLElement>("code[class]").forEach(code => {
    code.className = code.className.replace(
      new RegExp(`language-${PLUGIN_LANG_PREFIX}(\\S+)`, "g"),
      "language-$1"
    );
  });
}

/* ── Renderer ──────────────────────────────────────────────────────────── */
export async function renderNote(
  app: App,
  file: TFile,
  rawContent: string
): Promise<{ html: string; css: string; images: Map<string, TFile> }> {
  let content = stripFrontmatter(rawContent);
  content = resolveSelfEmbeds(app, file, content, rawContent);
  content = resolveBaseEmbeds(content);
  content = protectPluginCodeBlocks(content);
  const { processed, entries } = extractMath(content);

  const el = createDiv({ cls: "markdown-preview-view markdown-rendered opal-render-scratch" });
  // Attach off-screen so mermaid (and other renderers) can use DOM layout APIs.
  activeDocument.body.appendChild(el);

  const component = new Component();
  component.load();
  await MarkdownRenderer.render(app, processed, el, file.path, component);

  // Wait for async post-processors (callout icons, mermaid, etc.)
  // Poll until all mermaid blocks have been converted to SVG, or 1500 ms max.
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const check = () => {
      const elapsed = Date.now() - start;
      const pendingMermaid = el.querySelectorAll("pre code.language-mermaid").length;
      if ((pendingMermaid === 0 && elapsed >= 300) || elapsed >= 1500) {
        resolve();
      } else {
        window.setTimeout(check, 100);
      }
    };
    window.setTimeout(check, 300);
  });
  component.unload();

  // Restore math content for KaTeX
  el.querySelectorAll<HTMLElement>("[data-mi]").forEach((placeholder) => {
    const idx = parseInt(placeholder.getAttribute("data-mi") ?? "0");
    const entry = entries[idx];
    if (entry) placeholder.textContent = entry.latex;
  });

  // Remove Obsidian's native copy buttons
  el.querySelectorAll(".copy-code-button").forEach((b) => b.remove());

  // Restore plugin code block language labels (strip the export-raw- prefix)
  restorePluginCodeLangs(el);

  // Images map is created here so base renderers can register banner images into it
  const images = new Map<string, TFile>();

  // Replace base embed placeholders (data-base-embed attr) with real tables/cards
  const basePlaceholders = Array.from(el.querySelectorAll<HTMLElement>("[data-base-embed]"));
  for (const placeholder of basePlaceholders) {
    const name = placeholder.getAttribute("data-base-embed") ?? "";
    const viewName = placeholder.getAttribute("data-base-view") ?? undefined;
    const baseFile = app.vault.getFiles().find(
      f => f.path === name || f.name === name || f.name === name.split("/").pop()
    );
    if (baseFile) {
      const parsed = new DOMParser().parseFromString(
        await renderBaseAsTable(app, baseFile, images, viewName), "text/html"
      );
      placeholder.replaceWith(...Array.from(parsed.body.childNodes));
    } else {
      const errorP = createEl("p", { cls: "base-error", text: `Base 未找到: ${name}` });
      placeholder.replaceWith(errorP);
    }
  }

  // Fallback: replace any .internal-embed elements pointing to .base files
  // (in case MarkdownRenderer created them instead of rendering the placeholder)
  const internalEmbeds = Array.from(el.querySelectorAll<HTMLElement>(".internal-embed"));
  for (const embed of internalEmbeds) {
    const rawSrc = embed.getAttribute("src") ?? "";
    const [src, viewName] = rawSrc.split("#");
    if (!src.endsWith(".base")) continue;
    const baseName = src.split("/").pop() ?? src;
    const baseFile = app.vault.getFiles().find(
      f => f.path === src || f.name === baseName
    );
    if (baseFile) {
      const parsed = new DOMParser().parseFromString(
        await renderBaseAsTable(app, baseFile, images, viewName || undefined), "text/html"
      );
      embed.replaceWith(...Array.from(parsed.body.childNodes));
    } else {
      const errorP = createEl("p", { cls: "base-error", text: `Base 未找到: ${src}` });
      embed.replaceWith(errorP);
    }
  }

  // Wrap tables in .table-wrapper (skip tables already inside one)
  el.querySelectorAll("table").forEach((table) => {
    if (table.closest(".table-wrapper")) return;
    const wrapper = createDiv({ cls: "table-wrapper" });
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  // Process imgs code blocks, then collect remaining images (wiki embeds, markdown images)
  processImgsBlocks(app, file, el, images);
  collectImages(app, file, el, images);

  // Defer off-screen image loading so the first screen paints without waiting
  // on every image (covers vault, gallery and any external <img>).
  el.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  });

  const html = el.innerHTML;
  activeDocument.body.removeChild(el);
  return { html, css: buildCss(), images };
}
