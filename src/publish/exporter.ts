import { App, Vault, TFile } from "obsidian";
import { zipSync, strToU8 } from "fflate";
import { renderNote } from "../render/renderer";
import { queryBaseFiles } from "../render/base-renderer";
import { buildHtml, containsMath } from "../render/page-template";
import type { GoatCounterInjectConfig } from "../analytics/analytics";

/** Base36 alphabet size — names are drawn from [0-9a-z]. */
const NAME_ALPHABET_SIZE = 36;
/**
 * When the name space is fuller than this fraction, widen the name length.
 * At 2/3 full the average number of random retries is still < 3; past that it
 * climbs steeply (≈10 at 9/10 full, unbounded when full), so we never let it
 * get there — we add a character instead, which multiplies capacity by 36.
 */
const CROWD_THRESHOLD = 2 / 3;

/** Generate exactly `length` base36 characters. */
function randomName(length: number): string {
	let s = "";
	// One Math.random() yields ~11 usable base36 chars; loop only for long names.
	while (s.length < length) {
		s += Math.random().toString(36).slice(2);
	}
	return s.slice(0, length);
}

/**
 * Produce a name that is not already in `usedNames`, registering it before
 * returning. `pageLinkLength` is the desired length, but if the space is
 * already crowded (≥ CROWD_THRESHOLD of 36^length taken) the length is grown
 * so retries stay cheap and the loop can never spin forever near saturation.
 */
export function generateUniqueName(usedNames: Set<string>, pageLinkLength: number): string {
	let length = Math.max(1, pageLinkLength);
	while (usedNames.size >= Math.pow(NAME_ALPHABET_SIZE, length) * CROWD_THRESHOLD) {
		length++;
		console.warn(
			`[publish-as-link] 短链命名空间接近饱和（已用 ${usedNames.size} 个），长度自动增加到 ${length}`
		);
	}
	let name: string;
	do {
		name = randomName(length);
	} while (usedNames.has(name));
	usedNames.add(name);
	return name;
}

/** Hard cap on how many sub-pages may be published in one go (enforced in the UI). */
export const MAX_SUB_PAGES = 50;
/**
 * Safety ceiling on tree collection so a base that matches a huge slice of the
 * vault can't freeze the UI. Comfortably above MAX_SUB_PAGES — the user must
 * still uncheck down to MAX_SUB_PAGES before publishing.
 */
const MAX_COLLECT = 200;

/** One note in the export hierarchy: its publish status, depth, and its own children. */
export interface SubNoteNode {
	file: TFile;
	/** Current `share_link` frontmatter, or "" if never published. Survives an
	 *  unpublish (for reuse on republish) — check `share_status`/`isPublished`
	 *  for whether the link is actually live. */
	shareLink: string;
	/** 1 = direct child of the main note, 2 = grandchild, … */
	depth: number;
	children: SubNoteNode[];
}

/**
 * Notes pulled in by `.base` embeds in `file` — every markdown file the embedded
 * base's query resolves to. These render as internal links in the base table/
 * card/list, so they must be published as sub-pages for those links to resolve.
 * `seen` is shared with the direct-link pass so a note linked both ways appears
 * once; matched files are added to it as a side effect.
 */
async function collectBaseLinkedNotes(app: App, file: TFile, seen: Set<string>): Promise<TFile[]> {
	const embeds = app.metadataCache.getFileCache(file)?.embeds ?? [];
	const result: TFile[] = [];
	for (const embed of embeds) {
		const [linkPart, viewName] = embed.link.split("#");
		if (!/\.base$/i.test(linkPart)) continue;
		const baseName = linkPart.split("/").pop() ?? linkPart;
		const baseFile =
			app.metadataCache.getFirstLinkpathDest(linkPart, file.path) ??
			app.vault.getFiles().find((f) => f.path === linkPart || f.name === baseName);
		if (!(baseFile instanceof TFile)) continue;
		for (const m of await queryBaseFiles(app, baseFile, viewName || undefined)) {
			if (m.extension === "md" && m.path !== file.path && !seen.has(m.path)) {
				seen.add(m.path);
				result.push(m);
			}
		}
	}
	return result;
}

/**
 * Direct markdown children of `file`: its wikilinks plus the notes pulled in by
 * any `.base` embeds. Each child is claimed in `seen` so it is never visited
 * twice across the whole tree (the shallowest occurrence wins under BFS).
 */
async function directChildNotes(app: App, file: TFile, seen: Set<string>): Promise<TFile[]> {
	const out: TFile[] = [];
	const links = app.metadataCache.getFileCache(file)?.links ?? [];
	for (const link of links) {
		const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (dest && dest.extension === "md" && !seen.has(dest.path)) {
			seen.add(dest.path);
			out.push(dest);
		}
	}
	out.push(...(await collectBaseLinkedNotes(app, file, seen)));
	return out;
}

/**
 * Walk the export hierarchy breadth-first from `root` down to `maxDepth` levels
 * (`maxDepth` = export level − 1: 0 → no sub-pages, 1 → direct children, 2 → +1).
 * Each note appears once, at its shallowest depth. Collection stops at
 * MAX_COLLECT nodes to stay responsive — `truncated` flags that it was capped.
 */
export async function collectSubNoteTree(
	app: App,
	root: TFile,
	maxDepth: number
): Promise<{ nodes: SubNoteNode[]; truncated: boolean }> {
	const seen = new Set<string>([root.path]);
	const shareLinkOf = (f: TFile): string =>
		(app.metadataCache.getFileCache(f)?.frontmatter?.["share_link"] as string | undefined) ?? "";

	const roots: SubNoteNode[] = [];
	let truncated = false;
	let count = 0;
	// BFS frontier: each entry is a parent file + the children array to fill.
	let frontier: { file: TFile; container: SubNoteNode[] }[] = [{ file: root, container: roots }];

	for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
		const next: { file: TFile; container: SubNoteNode[] }[] = [];
		for (const { file, container } of frontier) {
			for (const child of await directChildNotes(app, file, seen)) {
				if (count >= MAX_COLLECT) {
					truncated = true;
					break;
				}
				count++;
				const node: SubNoteNode = { file: child, shareLink: shareLinkOf(child), depth, children: [] };
				container.push(node);
				next.push({ file: child, container: node.children });
			}
			if (truncated) break;
		}
		frontier = next;
	}

	return { nodes: roots, truncated };
}

/** Flatten a sub-note tree into a depth-first list (parents before their children). */
export function flattenSubTree(nodes: SubNoteNode[]): SubNoteNode[] {
	const out: SubNoteNode[] = [];
	for (const n of nodes) {
		out.push(n);
		out.push(...flattenSubTree(n.children));
	}
	return out;
}

/**
 * Rewrite internal Obsidian link hrefs in exported HTML
 * so they point to the exported sub-note pages.
 * subFolderMap: note basename / link path → subfolder name
 *
 * `stripTitle`, when supplied, is also applied to the *displayed text* of every
 * `internal-link` anchor (both Markdown links and base file-links), so the
 * unique-note timestamp prefix is removed everywhere a note name is shown — not
 * just in the page <title>. Aliased links whose text doesn't start with the
 * timestamp are left untouched (`stripUniquePrefix` is a no-op for them).
 */
export function rewriteInternalLinks(
	html: string,
	subFolderMap: Map<string, string>,
	addExtension = true,
	stripTitle?: (name: string) => string
): string {
	const rewritten = html.replace(/<a([^>]*?)>/g, (match, attrs: string) => {
		const dataHrefMatch = attrs.match(/data-href="([^"]*)"/);
		if (!dataHrefMatch) return match;
		// External links (Obsidian also emits data-href on them) must stay clickable —
		// leave them, and their target="_blank", completely untouched. They are either
		// flagged with the `external-link` class or carry a URL scheme (https:, mailto:…).
		if (
			/class="[^"]*\bexternal-link\b[^"]*"/.test(attrs) ||
			/^[a-z][a-z0-9+.-]*:/i.test(dataHrefMatch[1])
		) {
			return match;
		}
		const dataHref = dataHrefMatch[1].split("#")[0].replace(/\.md$/i, "");
		const subFolder =
			subFolderMap.get(dataHref) ??
			subFolderMap.get(dataHref.split("/").pop() ?? "");
		if (!subFolder) {
			// Link target was not exported — point href to "#" so it stays on the page
			let newAttrs = attrs.replace(/(?<![a-zA-Z-])href="[^"]*"/, 'href="#"');
			// If there was no href attribute at all, add one
			if (!/(?<![a-zA-Z-])href="/.test(newAttrs)) {
				newAttrs += ' href="#"';
			}
			newAttrs = newAttrs.replace(/\s*target="_blank"/, "");
			return `<a${newAttrs}>`;
		}
		const target = addExtension ? `./${subFolder}.html` : `./${subFolder}`;
		// Use negative lookbehind to avoid matching the `href` inside `data-href="..."`
		let newAttrs = attrs.replace(/(?<![a-zA-Z-])href="[^"]*"/, `href="${target}"`);
		// Remove target="_blank" so the link opens in the current page
		newAttrs = newAttrs.replace(/\s*target="_blank"/, "");
		return `<a${newAttrs}>`;
	});

	if (!stripTitle) return rewritten;
	// Second pass: strip the unique-note prefix from the text of internal-link
	// anchors. Text is plain (no nested tags) and already HTML-escaped; the
	// prefix is digits/separators, so trimming a leading substring is safe.
	return rewritten.replace(
		/(<a\b[^>]*\bclass="[^"]*\binternal-link\b[^"]*"[^>]*>)([^<]*)(<\/a>)/g,
		(_m, open: string, text: string, close: string) => `${open}${stripTitle(text)}${close}`
	);
}

/* ── Unique-note prefix stripping ──────────────────────────────────────────
 * Obsidian's core "Unique note creator" (zk-prefixer) plugin prefixes new notes
 * with a moment-formatted timestamp, e.g. format `YYYYMMDDHHmm-` → a note named
 * `202606281230-My Note`. When the user enables the compatibility toggle we strip
 * that prefix from the exported page's <title>, leaving just `My Note`. */

/** Date-format letters that map to digit runs (everything else stays literal). */
const NUMERIC_DATE_LETTERS = new Set("YyMDdHhmsSAkewWEQGgoXx".split(""));

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turn a moment date format (as stored in `zk-prefixer.json`) into an anchored
 * regex that matches the timestamp prefix at the start of a basename. Returns
 * `null` when the format has no date token (so there is nothing to strip).
 */
export function uniquePrefixRegex(format: string): RegExp | null {
	if (!format) return null;
	let pattern = "^";
	let hasToken = false;
	for (let i = 0; i < format.length; ) {
		const c = format[i];
		if (/[A-Za-z]/.test(c)) {
			let n = 1;
			while (i + n < format.length && format[i + n] === c) n++;
			if (NUMERIC_DATE_LETTERS.has(c)) {
				pattern += n >= 2 ? `\\d{${n}}` : `\\d{1,2}`;
				hasToken = true;
			} else {
				pattern += escapeRegex(c.repeat(n));
			}
			i += n;
		} else {
			pattern += escapeRegex(c);
			i++;
		}
	}
	return hasToken ? new RegExp(pattern) : null;
}

/**
 * Strip the unique-note timestamp prefix (per `format`) from a basename. Any
 * leftover leading separators are trimmed. Falls back to the original name when
 * there is no prefix, or when stripping would leave nothing (a title-less note
 * named only by its timestamp).
 */
export function stripUniquePrefix(name: string, format: string): string {
	const re = uniquePrefixRegex(format);
	if (!re) return name;
	const stripped = name.replace(re, "").replace(/^[\s\-_·.]+/, "");
	return stripped.length > 0 ? stripped : name;
}

/**
 * Build a basename → page-title function. When `enabled`, reads the live
 * zk-prefixer format and returns a stripper; otherwise (or on any failure) an
 * identity function so export always produces a title.
 */
export async function makeUniquePrefixStripper(
	app: App,
	enabled: boolean
): Promise<(name: string) => string> {
	if (!enabled) return (n) => n;
	try {
		const path = `${app.vault.configDir}/zk-prefixer.json`;
		if (!(await app.vault.adapter.exists(path))) return (n) => n;
		const cfg = JSON.parse(await app.vault.adapter.read(path)) as { format?: string };
		const format = cfg?.format ?? "";
		if (!uniquePrefixRegex(format)) return (n) => n;
		return (name) => stripUniquePrefix(name, format);
	} catch {
		return (n) => n;
	}
}

export interface ExportResult {
	noteName: string;
	html: string;
	css: string;
	images: Map<string, TFile>;
	/** True when the page references KaTeX (so its assets must be available). */
	hasMath: boolean;
}

export async function prepareExport(
	app: App,
	vault: Vault,
	file: TFile,
	noteName: string,
	katexBase?: string,
	analytics?: GoatCounterInjectConfig,
	title?: string
): Promise<ExportResult> {
	const raw = await vault.read(file);
	const { html: htmlBody, css, images } = await renderNote(app, file, raw);
	const hasMath = containsMath(htmlBody);
	const html = buildHtml(title ?? file.basename, htmlBody, css, katexBase, analytics).replace(/src="images\//g, `src="${noteName}/images/`);
	return { noteName, html, css, images, hasMath };
}

/**
 * Render `file` (and optionally its linked sub-notes) into an in-memory ZIP and
 * return the bytes. Nothing is written to disk — the caller triggers a browser
 * download so the user picks where the archive lands (no Node `fs` access).
 *
 * ZIP layout mirrors the old flat folder export: `{name}.html` at the root and
 * `{name}/images/*` for each page's assets, so internal links resolve unchanged.
 */
export async function exportToZip(
	app: App,
	vault: Vault,
	file: TFile,
	exportLevel = 1,
	pageLinkLength = 3,
	analytics?: GoatCounterInjectConfig,
	stripUniquePrefixCompat = false
): Promise<{ result: ExportResult; zip: Uint8Array }> {
	// All names generated in this export share one set so they never collide.
	const usedNames = new Set<string>();
	const pageTitle = await makeUniquePrefixStripper(app, stripUniquePrefixCompat);
	const result = await prepareExport(app, vault, file, generateUniqueName(usedNames, pageLinkLength), undefined, analytics, pageTitle(file.basename));

	// ZIP entries keyed by archive-relative path (always `/`-separated per the spec).
	const files: Record<string, Uint8Array> = {};
	const addImages = async (noteName: string, images: ExportResult["images"]) => {
		for (const [exportName, imgFile] of images) {
			files[`${noteName}/images/${exportName}`] = new Uint8Array(await vault.readBinary(imgFile));
		}
	};

	// Seed the map with the main note so sub-pages can link back to it.
	const subFolderMap = new Map<string, string>();
	subFolderMap.set(file.basename, result.noteName);
	subFolderMap.set(file.path.replace(/\.md$/i, ""), result.noteName);
	let mainHtml = result.html;

	if (exportLevel > 1) {
		const { nodes } = await collectSubNoteTree(app, file, exportLevel - 1);
		const linkedFiles = flattenSubTree(nodes).map((n) => n.file);
		const subResults: ExportResult[] = [];

		// First pass: render all sub-notes and build the full map before emitting anything.
		for (const linkedFile of linkedFiles) {
			const subResult = await prepareExport(app, vault, linkedFile, generateUniqueName(usedNames, pageLinkLength), undefined, analytics, pageTitle(linkedFile.basename));
			subFolderMap.set(linkedFile.basename, subResult.noteName);
			subFolderMap.set(linkedFile.path.replace(/\.md$/i, ""), subResult.noteName);
			subResults.push(subResult);
		}

		// All notes (main and sub) are flat at the archive root, so links share the map.
		for (const subResult of subResults) {
			files[`${subResult.noteName}.html`] = strToU8(rewriteInternalLinks(subResult.html, subFolderMap, true, pageTitle));
			await addImages(subResult.noteName, subResult.images);
		}
	}

	mainHtml = rewriteInternalLinks(mainHtml, subFolderMap, true, pageTitle);
	files[`${result.noteName}.html`] = strToU8(mainHtml);
	await addImages(result.noteName, result.images);

	const zip = zipSync(files, { level: 6 });
	return { result, zip };
}
