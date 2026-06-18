import { App, Vault, TFile } from "obsidian";
import { zipSync, strToU8 } from "fflate";
import { renderNote, buildHtml, containsMath } from "./renderer";
import type { GoatCounterInjectConfig } from "./analytics";

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

/** Collect all directly linked markdown notes from a file (no duplicates). */
export function collectLinkedNotes(app: App, file: TFile): TFile[] {
	const links = app.metadataCache.getFileCache(file)?.links ?? [];
	const seen = new Set<string>();
	const result: TFile[] = [];
	for (const link of links) {
		const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (dest && dest.extension === "md" && !seen.has(dest.path)) {
			seen.add(dest.path);
			result.push(dest);
		}
	}
	return result;
}

/** Same as collectLinkedNotes but also returns each note's current share_link value. */
export function collectLinkedNotesWithStatus(
	app: App,
	file: TFile
): { file: TFile; shareLink: string }[] {
	const links = app.metadataCache.getFileCache(file)?.links ?? [];
	const seen = new Set<string>();
	const result: { file: TFile; shareLink: string }[] = [];
	for (const link of links) {
		const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (dest && dest.extension === "md" && !seen.has(dest.path)) {
			seen.add(dest.path);
			const shareLink =
				(app.metadataCache.getFileCache(dest)?.frontmatter?.["share_link"] as string | undefined) ?? "";
			result.push({ file: dest, shareLink });
		}
	}
	return result;
}

/**
 * Rewrite internal Obsidian link hrefs in exported HTML
 * so they point to the exported sub-note pages.
 * subFolderMap: note basename / link path → subfolder name
 */
export function rewriteInternalLinks(
	html: string,
	subFolderMap: Map<string, string>,
	addExtension = true
): string {
	return html.replace(/<a([^>]*?)>/g, (match, attrs: string) => {
		const dataHrefMatch = attrs.match(/data-href="([^"]*)"/);
		if (!dataHrefMatch) return match;
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
	analytics?: GoatCounterInjectConfig
): Promise<ExportResult> {
	const raw = await vault.read(file);
	const { html: htmlBody, css, images } = await renderNote(app, file, raw);
	const hasMath = containsMath(htmlBody);
	const html = buildHtml(file.basename, htmlBody, css, katexBase, analytics).replace(/src="images\//g, `src="${noteName}/images/`);
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
	includeLinkedNotes = false,
	pageLinkLength = 3,
	analytics?: GoatCounterInjectConfig
): Promise<{ result: ExportResult; zip: Uint8Array }> {
	// All names generated in this export share one set so they never collide.
	const usedNames = new Set<string>();
	const result = await prepareExport(app, vault, file, generateUniqueName(usedNames, pageLinkLength), undefined, analytics);

	// ZIP entries keyed by archive-relative path (always `/`-separated per the spec).
	const files: Record<string, Uint8Array> = {};
	const addImages = async (noteName: string, images: ExportResult["images"]) => {
		for (const [exportName, imgFile] of images) {
			files[`${noteName}/images/${exportName}`] = new Uint8Array(await vault.readBinary(imgFile));
		}
	};

	const subFolderMap = new Map<string, string>();
	let mainHtml = result.html;

	if (includeLinkedNotes) {
		const linkedFiles = collectLinkedNotes(app, file);
		const subResults: ExportResult[] = [];

		// First pass: render all sub-notes and build the full map before emitting anything.
		for (const linkedFile of linkedFiles) {
			const subResult = await prepareExport(app, vault, linkedFile, generateUniqueName(usedNames, pageLinkLength), undefined, analytics);
			subFolderMap.set(linkedFile.basename, subResult.noteName);
			subFolderMap.set(linkedFile.path.replace(/\.md$/i, ""), subResult.noteName);
			subResults.push(subResult);
		}

		// All notes (main and sub) are flat at the archive root, so links share the map.
		for (const subResult of subResults) {
			files[`${subResult.noteName}.html`] = strToU8(rewriteInternalLinks(subResult.html, subFolderMap)) as Uint8Array;
			await addImages(subResult.noteName, subResult.images);
		}
	}

	mainHtml = rewriteInternalLinks(mainHtml, subFolderMap);
	files[`${result.noteName}.html`] = strToU8(mainHtml) as Uint8Array;
	await addImages(result.noteName, result.images);

	const zip = zipSync(files, { level: 6 }) as Uint8Array;
	return { result, zip };
}
