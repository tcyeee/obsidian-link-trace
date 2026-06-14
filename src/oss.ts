import { Vault, TFile, requestUrl } from "obsidian";
import type { ShareOnlineSettings } from "./settings";
import OSS from "ali-oss";
import * as zlib from "zlib";

/** KaTeX version self-hosted to OSS. Embedded in the asset path so it can be
 *  cached immutably and bumping the version provisions a fresh copy. */
const KATEX_VERSION = "0.16.9";
const KATEX_CDN = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;

/** Cache headers: HTML changes on every republish, assets are content-stable. */
const HTML_CACHE = "public, max-age=300";
const IMAGE_CACHE = "public, max-age=86400";
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** Origin + prefix that all published objects live under (no trailing slash). */
function publishBaseUrl(settings: ShareOnlineSettings): string {
	const prefix = settings.ossPrefix.replace(/\/$/, "");
	const origin =
		settings.ossDomain || `https://${settings.ossBucket}.${settings.ossRegion}.aliyuncs.com`;
	return `${origin}/${prefix}`;
}

/** Public URL of the self-hosted KaTeX directory (hosts katex.min.css/js + fonts). */
export function katexBaseUrl(settings: ShareOnlineSettings): string {
	return `${publishBaseUrl(settings)}/_assets/katex/${KATEX_VERSION}`;
}

/**
 * Make sure the self-hosted KaTeX assets exist in OSS, fetching them from the
 * CDN once and re-uploading on first use. Idempotent: a HEAD check on the CSS
 * (uploaded last, as the completion marker) short-circuits when already present.
 */
export async function ensureKatexAssets(settings: ShareOnlineSettings): Promise<void> {
	const client = makeClient(settings);
	const prefix = settings.ossPrefix.replace(/\/$/, "");
	const dir = `${prefix}/_assets/katex/${KATEX_VERSION}`;
	const cssKey = `${dir}/katex.min.css`;

	try {
		await client.head(cssKey);
		return; // already provisioned
	} catch {
		/* not found — provision below */
	}

	const headers = { "Cache-Control": IMMUTABLE_CACHE };

	// Fetch the CSS first so we can discover exactly which font files it needs.
	const cssText = (await requestUrl({ url: `${KATEX_CDN}/katex.min.css` })).text;

	// Every modern browser uses woff2, so the woff/ttf url() entries are never
	// requested — only mirror the woff2 fonts the CSS actually references.
	const fonts = new Set<string>();
	for (const m of cssText.matchAll(/url\(fonts\/([^)]+?\.woff2)\)/g)) fonts.add(m[1]);
	for (const font of fonts) {
		const data = (await requestUrl({ url: `${KATEX_CDN}/fonts/${font}` })).arrayBuffer;
		await client.put(`${dir}/fonts/${font}`, Buffer.from(data), { mime: "font/woff2", headers });
	}

	const js = (await requestUrl({ url: `${KATEX_CDN}/katex.min.js` })).arrayBuffer;
	await client.put(`${dir}/katex.min.js`, Buffer.from(js), {
		mime: "application/javascript; charset=utf-8",
		headers,
	});

	// Upload the CSS last: it doubles as the "fully provisioned" marker for the
	// HEAD check above, so a mid-way failure simply retries cleanly next time.
	await client.put(cssKey, Buffer.from(cssText, "utf-8"), {
		mime: "text/css; charset=utf-8",
		headers,
	});
}

function getMimeType(ext: string): string {
	const map: Record<string, string> = {
		png:  "image/png",
		jpg:  "image/jpeg",
		jpeg: "image/jpeg",
		gif:  "image/gif",
		webp: "image/webp",
		svg:  "image/svg+xml",
		bmp:  "image/bmp",
		avif: "image/avif",
	};
	return map[ext.toLowerCase()] ?? "application/octet-stream";
}

function makeClient(settings: ShareOnlineSettings) {
	const { ossRegion, ossBucket, ossAccessKeyId, ossAccessKeySecret } = settings;
	return new OSS({
		region: ossRegion,
		accessKeyId: ossAccessKeyId,
		accessKeySecret: ossAccessKeySecret,
		bucket: ossBucket,
		authorizationV4: true,
	});
}

/**
 * List the names of all already-published notes under the configured prefix.
 * Used to seed the unique-name generator so a new publish never overwrites an
 * unrelated note. Best-effort: returns an empty set if OSS is unconfigured or
 * the request fails (dedup then falls back to within-publish only).
 */
export async function listPublishedNames(settings: ShareOnlineSettings): Promise<Set<string>> {
	const { ossRegion, ossBucket, ossAccessKeyId, ossAccessKeySecret, ossPrefix } = settings;
	const names = new Set<string>();
	if (!ossRegion || !ossBucket || !ossAccessKeyId || !ossAccessKeySecret) return names;

	const client = makeClient(settings);
	const prefix = ossPrefix.replace(/\/$/, "") + "/";
	try {
		let marker: string | undefined;
		do {
			const res = await client.list(
				{ prefix, delimiter: "/", "max-keys": 1000, marker },
				{}
			);
			// The note's HTML lives at `${prefix}${name}` (an object); its images
			// sit under `${prefix}${name}/` (a common prefix). Collect both.
			for (const o of res.objects ?? []) {
				const n = o.name.slice(prefix.length).replace(/\/.*$/, "");
				if (n) names.add(n);
			}
			for (const p of res.prefixes ?? []) {
				const n = p.slice(prefix.length).replace(/\/$/, "");
				if (n) names.add(n);
			}
			marker = res.nextMarker;
			if (!res.isTruncated) break;
		} while (marker);
	} catch (err: unknown) {
		console.warn("[publish-as-link] 读取 OSS 已有页面列表失败，本次仅在发布范围内去重", err);
	}
	return names;
}

export async function uploadToOss(
	settings: ShareOnlineSettings,
	vault: Vault,
	noteName: string,
	html: string,
	images: Map<string, TFile>
): Promise<string> {
	const { ossRegion, ossBucket, ossAccessKeyId, ossAccessKeySecret, ossPrefix } = settings;

	if (!ossRegion || !ossBucket || !ossAccessKeyId || !ossAccessKeySecret) {
		throw new Error("请先在设置中填写 OSS 配置信息");
	}

	const client = makeClient(settings);
	const prefix = ossPrefix.replace(/\/$/, "");

	// CSS is inlined in the HTML; gzip it and upload as a single flat file.
	await client.put(
		`${prefix}/${noteName}`,
		zlib.gzipSync(Buffer.from(html, "utf-8")),
		{ mime: "text/html; charset=utf-8", headers: { "Content-Encoding": "gzip", "Cache-Control": HTML_CACHE } }
	);

	// Images live in a peer folder: {prefix}/{noteName}/images/
	for (const [exportName, imgFile] of images) {
		const data = await vault.readBinary(imgFile);
		await client.put(
			`${prefix}/${noteName}/images/${exportName}`,
			Buffer.from(data),
			{ mime: getMimeType(imgFile.extension), headers: { "Cache-Control": IMAGE_CACHE } }
		);
	}

	const base = settings.ossDomain || `https://${ossBucket}.${ossRegion}.aliyuncs.com`;
	return `${base}/${prefix}/${noteName}`;
}

export async function uploadSubNoteToOss(
	settings: ShareOnlineSettings,
	vault: Vault,
	subFolderName: string,
	html: string,
	images: Map<string, TFile>
): Promise<string> {
	const { ossRegion, ossBucket, ossAccessKeyId, ossAccessKeySecret } = settings;
	if (!ossRegion || !ossBucket || !ossAccessKeyId || !ossAccessKeySecret) {
		throw new Error("请先在设置中填写 OSS 配置信息");
	}

	const client = makeClient(settings);
	const prefix = settings.ossPrefix.replace(/\/$/, "");

	// Sub-notes are flat alongside the parent note.
	await client.put(`${prefix}/${subFolderName}`, zlib.gzipSync(Buffer.from(html, "utf-8")), {
		mime: "text/html; charset=utf-8",
		headers: { "Content-Encoding": "gzip", "Cache-Control": HTML_CACHE },
	});

	for (const [exportName, imgFile] of images) {
		const data = await vault.readBinary(imgFile);
		await client.put(
			`${prefix}/${subFolderName}/images/${exportName}`,
			Buffer.from(data),
			{ mime: getMimeType(imgFile.extension), headers: { "Cache-Control": IMAGE_CACHE } }
		);
	}

	const base = settings.ossDomain || `https://${settings.ossBucket}.${settings.ossRegion}.aliyuncs.com`;
	return `${base}/${prefix}/${subFolderName}`;
}

export async function deleteFromOss(
	settings: ShareOnlineSettings,
	noteName: string
): Promise<void> {
	const { ossRegion, ossBucket, ossAccessKeyId, ossAccessKeySecret, ossPrefix } = settings;

	if (!ossRegion || !ossBucket || !ossAccessKeyId || !ossAccessKeySecret) {
		throw new Error("请先在设置中填写 OSS 配置信息");
	}

	const client = makeClient(settings);
	const prefix = ossPrefix.replace(/\/$/, "");
	const folderPrefix = `${prefix}/${noteName}/`;

	// Delete the flat HTML file (new format) and all assets under the folder (images).
	await client.delete(`${prefix}/${noteName}`).catch(() => {});

	try {
		const listResult = await client.list({ prefix: folderPrefix, "max-keys": 1000 });
		const keys: string[] = (listResult.objects ?? []).map((o: { name: string }) => o.name);
		if (keys.length > 0) {
			await client.deleteMulti(keys, { quiet: true });
		}
	} catch {
		// Fallback: delete known files individually (also handles old index.html format)
		await client.delete(`${folderPrefix}index.html`).catch(() => {});
		await client.delete(`${folderPrefix}style.css`).catch(() => {});
	}
}
