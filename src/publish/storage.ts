import { Vault, TFile, requestUrl } from "obsidian";
import type { ShareOnlineSettings } from "../ui/settings";
import { AliyunStore } from "./stores/aliyun-store";
import { TencentStore } from "./stores/tencent-store";
import * as zlib from "zlib";

/** KaTeX version self-hosted to the bucket; embedded in the path for immutable caching. */
const KATEX_VERSION = "0.16.9";
const KATEX_CDN = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;

/** Cache headers: HTML changes on every republish, assets are content-stable. */
const HTML_CACHE = "public, max-age=300";
const IMAGE_CACHE = "public, max-age=86400";
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export interface PutOptions {
	mime: string;
	cacheControl: string;
	contentEncoding?: string;
}

/** The cloud-specific wire layer. Everything else is provider-agnostic flow below. */
export interface BlobStore {
	/** Publish prefix, no surrounding slashes (e.g. "notes"). */
	readonly prefix: string;
	/** Whether the provider's credentials are filled in. */
	readonly isConfigured: boolean;
	put(key: string, body: Buffer, opts: PutOptions): Promise<void>;
	head(key: string): Promise<boolean>;
	listObjects(prefix: string, delimiter?: string): Promise<{ keys: string[]; commonPrefixes: string[] }>;
	delete(key: string): Promise<void>;
	deleteMany(keys: string[]): Promise<void>;
	/** Full public URL for a stored key. */
	publicUrl(key: string): string;
}

export function getStore(settings: ShareOnlineSettings): BlobStore {
	return settings.storageProvider === "tencent"
		? new TencentStore(settings)
		: new AliyunStore(settings);
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

/** Public URL of the self-hosted KaTeX directory (hosts katex.min.css/js + fonts). */
export function katexBaseUrl(settings: ShareOnlineSettings): string {
	const store = getStore(settings);
	return store.publicUrl(`${store.prefix}/_assets/katex/${KATEX_VERSION}`);
}

/**
 * Ensure self-hosted KaTeX assets exist, fetching them from the CDN once on first
 * use. Idempotent: a HEAD on the CSS (uploaded last, as the completion marker)
 * short-circuits when already present.
 */
export async function ensureKatexAssets(settings: ShareOnlineSettings): Promise<void> {
	const store = getStore(settings);
	const dir = `${store.prefix}/_assets/katex/${KATEX_VERSION}`;
	const cssKey = `${dir}/katex.min.css`;

	if (await store.head(cssKey)) return; // already provisioned

	const cssText = (await requestUrl({ url: `${KATEX_CDN}/katex.min.css` })).text;

	// Every modern browser uses woff2; only mirror the woff2 fonts the CSS references.
	const fonts = new Set<string>();
	for (const m of cssText.matchAll(/url\(fonts\/([^)]+?\.woff2)\)/g)) fonts.add(m[1]);
	for (const font of fonts) {
		const data = (await requestUrl({ url: `${KATEX_CDN}/fonts/${font}` })).arrayBuffer;
		await store.put(`${dir}/fonts/${font}`, Buffer.from(data), {
			mime: "font/woff2",
			cacheControl: IMMUTABLE_CACHE,
		});
	}

	const js = (await requestUrl({ url: `${KATEX_CDN}/katex.min.js` })).arrayBuffer;
	await store.put(`${dir}/katex.min.js`, Buffer.from(js), {
		mime: "application/javascript; charset=utf-8",
		cacheControl: IMMUTABLE_CACHE,
	});

	// CSS uploaded last: doubles as the "fully provisioned" marker for the HEAD above.
	await store.put(cssKey, Buffer.from(cssText, "utf-8"), {
		mime: "text/css; charset=utf-8",
		cacheControl: IMMUTABLE_CACHE,
	});
}

/**
 * Names of all already-published notes under the configured prefix. Seeds the
 * unique-name generator so a new publish never overwrites an unrelated note.
 * Best-effort: empty set if unconfigured or the request fails.
 */
export async function listPublishedNames(settings: ShareOnlineSettings): Promise<Set<string>> {
	const store = getStore(settings);
	const names = new Set<string>();
	if (!store.isConfigured) return names;

	const prefix = store.prefix.replace(/\/$/, "") + "/";
	try {
		const { keys, commonPrefixes } = await store.listObjects(prefix, "/");
		// The note's HTML lives at `${prefix}${name}` (an object); its images sit
		// under `${prefix}${name}/` (a common prefix). Collect both.
		for (const k of keys) {
			const n = k.slice(prefix.length).replace(/\/.*$/, "");
			if (n) names.add(n);
		}
		for (const p of commonPrefixes) {
			const n = p.slice(prefix.length).replace(/\/$/, "");
			if (n) names.add(n);
		}
	} catch (err: unknown) {
		console.warn("[publish-as-link] 读取已发布页面列表失败，本次仅在发布范围内去重", err);
	}
	return names;
}

/** Upload one rendered page (flat gzipped HTML + peer images/ folder). Returns its public URL. */
export async function uploadPage(
	settings: ShareOnlineSettings,
	vault: Vault,
	noteName: string,
	html: string,
	images: Map<string, TFile>
): Promise<string> {
	const store = getStore(settings);
	if (!store.isConfigured) throw new Error("请先在设置中填写存储配置信息");

	const prefix = store.prefix;
	await store.put(`${prefix}/${noteName}`, zlib.gzipSync(Buffer.from(html, "utf-8")), {
		mime: "text/html; charset=utf-8",
		cacheControl: HTML_CACHE,
		contentEncoding: "gzip",
	});

	for (const [exportName, imgFile] of images) {
		const data = await vault.readBinary(imgFile);
		await store.put(`${prefix}/${noteName}/images/${exportName}`, Buffer.from(data), {
			mime: getMimeType(imgFile.extension),
			cacheControl: IMAGE_CACHE,
		});
	}

	return store.publicUrl(`${prefix}/${noteName}`);
}

/** Delete a page's flat HTML and all assets under its peer folder. */
export async function deletePage(settings: ShareOnlineSettings, noteName: string): Promise<void> {
	const store = getStore(settings);
	if (!store.isConfigured) throw new Error("请先在设置中填写存储配置信息");

	const prefix = store.prefix;
	const folderPrefix = `${prefix}/${noteName}/`;

	await store.delete(`${prefix}/${noteName}`).catch(() => {});

	try {
		const { keys } = await store.listObjects(folderPrefix);
		if (keys.length > 0) await store.deleteMany(keys);
	} catch {
		// Fallback: delete known files individually (also handles old index.html format).
		await store.delete(`${folderPrefix}index.html`).catch(() => {});
		await store.delete(`${folderPrefix}style.css`).catch(() => {});
	}
}
