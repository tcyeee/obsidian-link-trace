import { App, Vault, TFile } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { renderNote, buildHtml } from "./renderer";

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
				app.metadataCache.getFileCache(dest)?.frontmatter?.share_link ?? "";
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
export function rewriteInternalLinks(html: string, subFolderMap: Map<string, string>): string {
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
		// Use negative lookbehind to avoid matching the `href` inside `data-href="..."`
		let newAttrs = attrs.replace(/(?<![a-zA-Z-])href="[^"]*"/, `href="./${subFolder}.html"`);
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
}

export async function prepareExport(app: App, vault: Vault, file: TFile, existingName?: string): Promise<ExportResult> {
	const raw = await vault.read(file);
	const { html: htmlBody, css, images } = await renderNote(app, file, raw);
	const folderName = existingName ?? Math.random().toString(36).slice(2, 4);
	// Inline CSS and rewrite image paths so the flat .html file can find its assets
	// at {folderName}/images/ rather than the old relative images/ subfolder.
	const html = buildHtml(file.basename, htmlBody, css).replace(/src="images\//g, `src="${folderName}/images/`);
	return { noteName: folderName, html, css, images };
}

export async function exportToLocal(
	app: App,
	vault: Vault,
	file: TFile,
	exportRoot: string,
	includeLinkedNotes = false
): Promise<ExportResult> {
	const result = await prepareExport(app, vault, file);

	const subFolderMap = new Map<string, string>();
	let mainHtml = result.html;

	if (includeLinkedNotes) {
		const linkedFiles = collectLinkedNotes(app, file);
		const subResults: { subResult: ExportResult }[] = [];

		// First pass: render all sub-notes and build the full map before writing anything.
		for (const linkedFile of linkedFiles) {
			const subResult = await prepareExport(app, vault, linkedFile);
			subFolderMap.set(linkedFile.basename, subResult.noteName);
			subFolderMap.set(linkedFile.path.replace(/\.md$/i, ""), subResult.noteName);
			subResults.push({ subResult });
		}

		// All notes (main and sub) are flat at exportRoot, so links use the same map.
		for (const { subResult } of subResults) {
			const rewrittenSubHtml = rewriteInternalLinks(subResult.html, subFolderMap);
			fs.writeFileSync(path.join(exportRoot, `${subResult.noteName}.html`), rewrittenSubHtml, "utf8");

			if (subResult.images.size > 0) {
				const subImagesDir = path.join(exportRoot, subResult.noteName, "images");
				fs.mkdirSync(subImagesDir, { recursive: true });
				for (const [exportName, imgFile] of subResult.images) {
					const data = await vault.readBinary(imgFile);
					fs.writeFileSync(path.join(subImagesDir, exportName), Buffer.from(data));
				}
			}
		}
	}

	mainHtml = rewriteInternalLinks(mainHtml, subFolderMap);

	fs.writeFileSync(path.join(exportRoot, `${result.noteName}.html`), mainHtml, "utf8");

	if (result.images.size > 0) {
		const imagesDir = path.join(exportRoot, result.noteName, "images");
		fs.mkdirSync(imagesDir, { recursive: true });
		for (const [exportName, imgFile] of result.images) {
			const data = await vault.readBinary(imgFile);
			fs.writeFileSync(path.join(imagesDir, exportName), Buffer.from(data));
		}
	}

	return result;
}
