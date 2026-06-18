# Multi-Provider Storage + Tencent COS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tencent Cloud COS as a second publish target alongside Aliyun OSS, behind a `BlobStore` abstraction selected by a single "current provider" setting.

**Architecture:** Extract a thin `BlobStore` interface that isolates only the cloud-specific wire calls (put/head/list/delete/url). All provider-agnostic flow (KaTeX self-hosting, `{prefix}/{name}` page layout, gzip, cache headers, published-name listing) lives once in `src/publish/storage.ts`. `AliyunStore` wraps the existing `ali-oss` calls; `TencentStore` talks to the COS REST API via Obsidian `requestUrl` with a hand-written HMAC-SHA1 signature.

**Tech Stack:** TypeScript, esbuild, Obsidian API (`requestUrl`), node `crypto`/`zlib` builtins (external in the bundle), `ali-oss` (existing), Vitest.

## Global Constraints

- Desktop-only Obsidian plugin; node builtins (`crypto`, `zlib`) are available and marked `external` in `esbuild.config.mjs`.
- No new npm dependency for Tencent COS — use `requestUrl` + node `crypto` only.
- Aliyun `oss*` settings keys are unchanged — **no data migration**. New keys are additive.
- User-facing strings go through `src/core/i18n.ts` `t(key)` with both `zh` and `en` entries.
- After any code change: `pnpm build`, then copy `main.js`, `manifest.json`, `styles.css` to `/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/link-trace/`.
- Tests run in node env with `obsidian` aliased to `src/__mocks__/obsidian.ts`. `tencent-sign.ts` imports only node `crypto`, so it is unit-testable without touching the mock.

## File Structure

- Create: `src/publish/stores/tencent-sign.ts` — COS HMAC-SHA1 signature (pure function).
- Create: `src/publish/stores/tencent-sign.test.ts` — signature unit tests (official vectors).
- Create: `src/publish/storage.ts` — `BlobStore` interface + `getStore()` + provider-agnostic flow (replaces `oss.ts` public API).
- Create: `src/publish/stores/aliyun-store.ts` — `BlobStore` impl wrapping `ali-oss`.
- Create: `src/publish/stores/tencent-store.ts` — `BlobStore` impl via `requestUrl` + COS REST.
- Delete: `src/publish/oss.ts` — its Aliyun calls move into `aliyun-store.ts`.
- Modify: `main.ts:3-4` (imports) and call sites (`uploadToOss`/`uploadSubNoteToOss` → `uploadPage`, `deleteFromOss` → `deletePage`).
- Modify: `src/ui/settings.ts` — new fields, provider dropdown, Tencent section, preview branching.
- Modify: `src/core/i18n.ts` — new keys (zh + en).

---

### Task 1: COS request signature (`tencent-sign.ts`)

Pure function computing the COS `Authorization` header. No Obsidian/network — fully unit-testable. Verified vectors are derived from Tencent's official worked examples (SecretKey `BQYIM75p8x0iWVFSIgqEKwFprpRSVHlz`); the final signature does not depend on SecretId.

**Files:**
- Create: `src/publish/stores/tencent-sign.ts`
- Test: `src/publish/stores/tencent-sign.test.ts`

**Interfaces:**
- Consumes: node `crypto` only.
- Produces:
  - `export function camSafeUrlEncode(str: string): string`
  - `export interface CosSignInput { method: string; pathname: string; query?: Record<string, string>; headers?: Record<string, string>; secretId: string; secretKey: string; startTime: number; endTime: number; }`
  - `export function buildCosAuthorization(input: CosSignInput): string`

- [ ] **Step 1: Write the failing test**

Create `src/publish/stores/tencent-sign.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCosAuthorization, camSafeUrlEncode } from "./tencent-sign";

const SECRET_ID = "AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q";
const SECRET_KEY = "BQYIM75p8x0iWVFSIgqEKwFprpRSVHlz";

describe("camSafeUrlEncode", () => {
  it("encodes RFC3986 sub-delims that encodeURIComponent leaves alone", () => {
    expect(camSafeUrlEncode("a!'()*b")).toBe("a%21%27%28%29%2Ab");
    expect(camSafeUrlEncode("text/plain")).toBe("text%2Fplain");
    expect(camSafeUrlEncode('uin="100000000011"')).toBe("uin%3D%22100000000011%22");
  });
});

describe("buildCosAuthorization", () => {
  it("matches the official PUT example", () => {
    const auth = buildCosAuthorization({
      method: "PUT",
      pathname: "/exampleobject(腾讯云)",
      query: {},
      headers: {
        "content-length": "13",
        "content-md5": "mQ/fVh815F3k6TAUm8m0eg==",
        "content-type": "text/plain",
        date: "Thu, 16 May 2019 06:45:51 GMT",
        host: "examplebucket-1250000000.cos.ap-beijing.myqcloud.com",
        "x-cos-acl": "private",
        "x-cos-grant-read": 'uin="100000000011"',
      },
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      startTime: 1557989151,
      endTime: 1557996351,
    });
    expect(auth).toBe(
      "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q" +
        "&q-sign-time=1557989151;1557996351&q-key-time=1557989151;1557996351" +
        "&q-header-list=content-length;content-md5;content-type;date;host;x-cos-acl;x-cos-grant-read" +
        "&q-url-param-list=&q-signature=3b8851a11a569213c17ba8fa7dcf2abec6935172"
    );
  });

  it("matches the official GET example (with query params)", () => {
    const auth = buildCosAuthorization({
      method: "get",
      pathname: "/exampleobject(腾讯云)",
      query: {
        "response-content-type": "application/octet-stream",
        "response-cache-control": "max-age=600",
      },
      headers: {
        date: "Thu, 16 May 2019 06:55:53 GMT",
        host: "examplebucket-1250000000.cos.ap-beijing.myqcloud.com",
      },
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      startTime: 1557989753,
      endTime: 1557996953,
    });
    expect(auth).toBe(
      "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q" +
        "&q-sign-time=1557989753;1557996953&q-key-time=1557989753;1557996953" +
        "&q-header-list=date;host&q-url-param-list=response-cache-control;response-content-type" +
        "&q-signature=01681b8c9d798a678e43b685a9f1bba0f6c0e012"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/publish/stores/tencent-sign.test.ts`
Expected: FAIL — cannot resolve `./tencent-sign` / `buildCosAuthorization is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/publish/stores/tencent-sign.ts`:

```ts
import * as crypto from "crypto";

/** RFC3986 encoding: encodeURIComponent plus the sub-delims it leaves alone. */
export function camSafeUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export interface CosSignInput {
  method: string;
  /** Raw object path with leading slash, NOT url-encoded. */
  pathname: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  secretId: string;
  secretKey: string;
  /** Signature validity window, Unix seconds. */
  startTime: number;
  endTime: number;
}

/** Build the COS `Authorization` header value (q-sign-algorithm=sha1 form). */
export function buildCosAuthorization(input: CosSignInput): string {
  const { method, pathname, query = {}, headers = {}, secretId, secretKey, startTime, endTime } = input;

  const hmacSha1 = (key: string, data: string) =>
    crypto.createHmac("sha1", key).update(data).digest("hex");
  const sha1 = (data: string) => crypto.createHash("sha1").update(data).digest("hex");

  // Lowercase keys, sort ascending; produce both the ;-joined key list and the
  // &-joined key=encodedValue string.
  const obj2parts = (obj: Record<string, string>) => {
    const lower: Record<string, string> = {};
    for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
    const keys = Object.keys(lower).sort();
    const list = keys.join(";");
    const str = keys
      .map((k) => `${camSafeUrlEncode(k)}=${camSafeUrlEncode(lower[k])}`)
      .join("&");
    return { list, str };
  };

  const keyTime = `${startTime};${endTime}`;
  const signKey = hmacSha1(secretKey, keyTime);

  const headerParts = obj2parts(headers);
  const paramParts = obj2parts(query);

  const httpString = `${method.toLowerCase()}\n${pathname}\n${paramParts.str}\n${headerParts.str}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerParts.list}`,
    `q-url-param-list=${paramParts.list}`,
    `q-signature=${signature}`,
  ].join("&");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/publish/stores/tencent-sign.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/publish/stores/tencent-sign.ts src/publish/stores/tencent-sign.test.ts
git commit -m "feat: add Tencent COS request signature (tencent-sign)"
```

---

### Task 2: Settings schema fields

Add provider selector + Tencent fields to the settings interface and defaults. Type-only change verified by `pnpm typecheck`.

**Files:**
- Modify: `src/ui/settings.ts:5-29` (interface + defaults)

**Interfaces:**
- Produces: `ShareOnlineSettings` gains `storageProvider: "aliyun" | "tencent"`, `cosSecretId`, `cosSecretKey`, `cosBucket`, `cosRegion`, `cosPrefix`, `cosDomain` (all `string`).

- [ ] **Step 1: Extend the interface**

In `src/ui/settings.ts`, replace the `ShareOnlineSettings` interface (lines 5-16) with:

```ts
export interface ShareOnlineSettings {
	includeLinkedNotes: boolean;
	storageProvider: "aliyun" | "tencent";
	ossRegion: string;
	ossBucket: string;
	ossAccessKeyId: string;
	ossAccessKeySecret: string;
	ossPrefix: string;
	ossDomain: string;
	cosRegion: string;
	cosBucket: string;
	cosSecretId: string;
	cosSecretKey: string;
	cosPrefix: string;
	cosDomain: string;
	pageLinkLength: number;
	goatcounterEndpoint: string;
	language: Language;
}
```

- [ ] **Step 2: Extend the defaults**

Replace `DEFAULT_SETTINGS` (lines 18-29) with:

```ts
export const DEFAULT_SETTINGS: ShareOnlineSettings = {
	includeLinkedNotes: false,
	storageProvider: "aliyun",
	ossRegion: "",
	ossBucket: "",
	ossAccessKeyId: "",
	ossAccessKeySecret: "",
	ossPrefix: "notes",
	ossDomain: "",
	cosRegion: "",
	cosBucket: "",
	cosSecretId: "",
	cosSecretKey: "",
	cosPrefix: "notes",
	cosDomain: "",
	pageLinkLength: 3,
	goatcounterEndpoint: "https://stats.viii.me/count",
	language: "zh",
};
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/settings.ts
git commit -m "feat: add storageProvider + Tencent COS settings fields"
```

---

### Task 3: BlobStore abstraction + Aliyun store + storage flow (refactor `oss.ts`)

Introduce `BlobStore`, move Aliyun calls into `AliyunStore`, put the provider-agnostic flow in `storage.ts`, rewire `main.ts`, delete `oss.ts`. `getStore` references `TencentStore` (created in Task 4) — to keep this task self-contained, add a minimal stub for `TencentStore` here and flesh it out in Task 4.

**Files:**
- Create: `src/publish/storage.ts`
- Create: `src/publish/stores/aliyun-store.ts`
- Create: `src/publish/stores/tencent-store.ts` (minimal stub; completed in Task 4)
- Delete: `src/publish/oss.ts`
- Modify: `main.ts` (imports + call sites)

**Interfaces:**
- Consumes: `ShareOnlineSettings` (Task 2); `ali-oss`; Obsidian `requestUrl`, `Vault`, `TFile`; node `zlib`.
- Produces (from `storage.ts`):
  - `export interface PutOptions { mime: string; cacheControl: string; contentEncoding?: string; }`
  - `export interface BlobStore { readonly prefix: string; readonly isConfigured: boolean; put(key: string, body: Buffer, opts: PutOptions): Promise<void>; head(key: string): Promise<boolean>; listObjects(prefix: string, delimiter?: string): Promise<{ keys: string[]; commonPrefixes: string[] }>; delete(key: string): Promise<void>; deleteMany(keys: string[]): Promise<void>; publicUrl(key: string): string; }`
  - `export function getStore(settings: ShareOnlineSettings): BlobStore`
  - `export function katexBaseUrl(settings: ShareOnlineSettings): string`
  - `export async function ensureKatexAssets(settings: ShareOnlineSettings): Promise<void>`
  - `export async function listPublishedNames(settings: ShareOnlineSettings): Promise<Set<string>>`
  - `export async function uploadPage(settings: ShareOnlineSettings, vault: Vault, noteName: string, html: string, images: Map<string, TFile>): Promise<string>`
  - `export async function deletePage(settings: ShareOnlineSettings, noteName: string): Promise<void>`

- [ ] **Step 1: Create `storage.ts` (interface + flow + selector)**

Create `src/publish/storage.ts`:

```ts
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
```

- [ ] **Step 2: Create `aliyun-store.ts`**

Create `src/publish/stores/aliyun-store.ts`:

```ts
import OSS from "ali-oss";
import type { ShareOnlineSettings } from "../../ui/settings";
import type { BlobStore, PutOptions } from "../storage";

/** BlobStore backed by Alibaba Cloud OSS via the ali-oss SDK. */
export class AliyunStore implements BlobStore {
	readonly prefix: string;
	readonly isConfigured: boolean;
	private readonly origin: string;
	private readonly client: OSS | null;

	constructor(settings: ShareOnlineSettings) {
		const { ossRegion, ossBucket, ossAccessKeyId, ossAccessKeySecret, ossPrefix, ossDomain } = settings;
		this.prefix = (ossPrefix || "notes").replace(/\/$/, "");
		this.isConfigured = !!(ossRegion && ossBucket && ossAccessKeyId && ossAccessKeySecret);
		this.origin = (ossDomain || `https://${ossBucket}.${ossRegion}.aliyuncs.com`).replace(/\/$/, "");
		this.client = this.isConfigured
			? new OSS({
					region: ossRegion,
					accessKeyId: ossAccessKeyId,
					accessKeySecret: ossAccessKeySecret,
					bucket: ossBucket,
					authorizationV4: true,
			  })
			: null;
	}

	private c(): OSS {
		if (!this.client) throw new Error("OSS 未配置");
		return this.client;
	}

	async put(key: string, body: Buffer, opts: PutOptions): Promise<void> {
		const headers: Record<string, string> = { "Cache-Control": opts.cacheControl };
		if (opts.contentEncoding) headers["Content-Encoding"] = opts.contentEncoding;
		await this.c().put(key, body, { mime: opts.mime, headers });
	}

	async head(key: string): Promise<boolean> {
		try {
			await this.c().head(key);
			return true;
		} catch {
			return false;
		}
	}

	async listObjects(
		prefix: string,
		delimiter?: string
	): Promise<{ keys: string[]; commonPrefixes: string[] }> {
		const keys: string[] = [];
		const commonPrefixes: string[] = [];
		let marker: string | undefined;
		do {
			const res = await this.c().list({ prefix, delimiter, "max-keys": 1000, marker }, {});
			for (const o of res.objects ?? []) keys.push(o.name);
			for (const p of res.prefixes ?? []) commonPrefixes.push(p);
			marker = res.nextMarker;
			if (!res.isTruncated) break;
		} while (marker);
		return { keys, commonPrefixes };
	}

	async delete(key: string): Promise<void> {
		await this.c().delete(key);
	}

	async deleteMany(keys: string[]): Promise<void> {
		if (keys.length) await this.c().deleteMulti(keys, { quiet: true });
	}

	publicUrl(key: string): string {
		return `${this.origin}/${key}`;
	}
}
```

- [ ] **Step 3: Create a minimal `tencent-store.ts` stub**

Create `src/publish/stores/tencent-store.ts` (fleshed out in Task 4 — this stub only satisfies `getStore`'s import and the `BlobStore` contract so this task typechecks and builds):

```ts
import type { ShareOnlineSettings } from "../../ui/settings";
import type { BlobStore, PutOptions } from "../storage";

/** BlobStore backed by Tencent Cloud COS. Implemented in Task 4. */
export class TencentStore implements BlobStore {
	readonly prefix = "notes";
	readonly isConfigured = false;

	constructor(_settings: ShareOnlineSettings) {
		/* implemented in Task 4 */
	}

	async put(_key: string, _body: Buffer, _opts: PutOptions): Promise<void> {
		throw new Error("Tencent COS 尚未实现");
	}
	async head(_key: string): Promise<boolean> {
		throw new Error("Tencent COS 尚未实现");
	}
	async listObjects(
		_prefix: string,
		_delimiter?: string
	): Promise<{ keys: string[]; commonPrefixes: string[] }> {
		throw new Error("Tencent COS 尚未实现");
	}
	async delete(_key: string): Promise<void> {
		throw new Error("Tencent COS 尚未实现");
	}
	async deleteMany(_keys: string[]): Promise<void> {
		throw new Error("Tencent COS 尚未实现");
	}
	publicUrl(_key: string): string {
		throw new Error("Tencent COS 尚未实现");
	}
}
```

- [ ] **Step 4: Delete `oss.ts` and rewire `main.ts` imports**

Delete the old module:

```bash
git rm src/publish/oss.ts
```

In `main.ts`, replace the import on line 4:

```ts
import { uploadToOss, uploadSubNoteToOss, deleteFromOss, listPublishedNames, ensureKatexAssets, katexBaseUrl } from "./src/publish/oss";
```

with:

```ts
import { uploadPage, deletePage, listPublishedNames, ensureKatexAssets, katexBaseUrl } from "./src/publish/storage";
```

- [ ] **Step 5: Update `main.ts` call sites**

In `main.ts`, the sub-note upload (around lines 257-263): replace `uploadSubNoteToOss(` with `uploadPage(`. The argument list is identical:

```ts
					const subUrl = await uploadPage(
						this.settings,
						this.app.vault,
						subResult.noteName,
						subResult.html,
						subResult.images
					);
```

The main-note upload (around lines 273-279): replace `uploadToOss(` with `uploadPage(`:

```ts
				const url = await uploadPage(
					this.settings,
					this.app.vault,
					result.noteName,
					mainHtml,
					result.images
				);
```

The two delete sites (around lines 313 and 328): replace `deleteFromOss(this.settings, snName)` with `deletePage(this.settings, snName)` and `deleteFromOss(this.settings, existingName)` with `deletePage(this.settings, existingName)`.

- [ ] **Step 6: Verify typecheck, tests, and build all pass**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck clean; all existing tests pass (note-hash, analytics, base-renderer) plus tencent-sign; build writes `main.js` with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract BlobStore abstraction; AliyunStore + storage flow replace oss.ts"
```

---

### Task 4: Tencent COS store implementation

Replace the Task 3 stub with a real `BlobStore` over the COS REST API using `requestUrl` + `buildCosAuthorization`. Requests always go to the COS API host; the public URL may use a custom domain. Not unit-tested (needs network + Obsidian host), consistent with the codebase's no-DOM-test convention — verified by typecheck + build, and the signature it relies on is already covered by Task 1.

**Files:**
- Modify (replace stub): `src/publish/stores/tencent-store.ts`

**Interfaces:**
- Consumes: `buildCosAuthorization`, `camSafeUrlEncode` from `./tencent-sign` (Task 1); `BlobStore`, `PutOptions` from `../storage` (Task 3); Obsidian `requestUrl`; node `crypto`.
- Produces: a complete `TencentStore` implementing `BlobStore`.

- [ ] **Step 1: Replace the stub with the full implementation**

Overwrite `src/publish/stores/tencent-store.ts`:

```ts
import { requestUrl } from "obsidian";
import * as crypto from "crypto";
import type { ShareOnlineSettings } from "../../ui/settings";
import type { BlobStore, PutOptions } from "../storage";
import { buildCosAuthorization, camSafeUrlEncode } from "./tencent-sign";

/** Copy a Buffer's bytes into a standalone ArrayBuffer for requestUrl. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** Minimal XML entity decode for keys/prefixes in list responses. */
function decodeXml(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** BlobStore backed by Tencent Cloud COS via the REST API + hand-written signature. */
export class TencentStore implements BlobStore {
	readonly prefix: string;
	readonly isConfigured: boolean;
	private readonly secretId: string;
	private readonly secretKey: string;
	private readonly host: string;
	/** API endpoint (always the COS host — writes never go to a custom domain). */
	private readonly apiBase: string;
	/** Public origin for served pages (custom domain if set, else the COS host). */
	private readonly publicOrigin: string;

	constructor(settings: ShareOnlineSettings) {
		const { cosSecretId, cosSecretKey, cosBucket, cosRegion, cosPrefix, cosDomain } = settings;
		this.secretId = cosSecretId;
		this.secretKey = cosSecretKey;
		this.prefix = (cosPrefix || "notes").replace(/\/$/, "");
		this.isConfigured = !!(cosSecretId && cosSecretKey && cosBucket && cosRegion);
		this.host = `${cosBucket}.cos.${cosRegion}.myqcloud.com`;
		this.apiBase = `https://${this.host}`;
		this.publicOrigin = (cosDomain || this.apiBase).replace(/\/$/, "");
	}

	/** Authorization header for a request. `query` must match the params actually sent. */
	private auth(method: string, pathname: string, query: Record<string, string>): string {
		const now = Math.floor(Date.now() / 1000);
		return buildCosAuthorization({
			method,
			pathname,
			query,
			headers: { host: this.host },
			secretId: this.secretId,
			secretKey: this.secretKey,
			startTime: now - 60,
			endTime: now + 900,
		});
	}

	/** Encode an object key for the request URL, preserving path separators. */
	private encodeKey(key: string): string {
		return key.split("/").map(camSafeUrlEncode).join("/");
	}

	private queryString(query: Record<string, string>): string {
		return Object.keys(query)
			.sort()
			.map((k) => `${camSafeUrlEncode(k)}=${camSafeUrlEncode(query[k])}`)
			.join("&");
	}

	async put(key: string, body: Buffer, opts: PutOptions): Promise<void> {
		const pathname = `/${key}`;
		const headers: Record<string, string> = {
			Authorization: this.auth("put", pathname, {}),
			Host: this.host,
			"Content-Type": opts.mime,
			"Cache-Control": opts.cacheControl,
		};
		if (opts.contentEncoding) headers["Content-Encoding"] = opts.contentEncoding;
		const res = await requestUrl({
			url: `${this.apiBase}/${this.encodeKey(key)}`,
			method: "PUT",
			headers,
			body: toArrayBuffer(body),
			throw: false,
		});
		if (res.status >= 300) throw new Error(`COS 上传失败 (${res.status}): ${res.text}`);
	}

	async head(key: string): Promise<boolean> {
		const pathname = `/${key}`;
		const res = await requestUrl({
			url: `${this.apiBase}/${this.encodeKey(key)}`,
			method: "HEAD",
			headers: { Authorization: this.auth("head", pathname, {}), Host: this.host },
			throw: false,
		});
		return res.status >= 200 && res.status < 300;
	}

	async listObjects(
		prefix: string,
		delimiter?: string
	): Promise<{ keys: string[]; commonPrefixes: string[] }> {
		const keys: string[] = [];
		const commonPrefixes: string[] = [];
		let marker: string | undefined;
		do {
			const query: Record<string, string> = { prefix, "max-keys": "1000" };
			if (delimiter) query.delimiter = delimiter;
			if (marker) query.marker = marker;
			const res = await requestUrl({
				url: `${this.apiBase}/?${this.queryString(query)}`,
				method: "GET",
				headers: { Authorization: this.auth("get", "/", query), Host: this.host },
				throw: false,
			});
			if (res.status >= 300) throw new Error(`COS 列举失败 (${res.status})`);
			const xml = res.text;
			for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]*)<\/Key>/g)) keys.push(decodeXml(m[1]));
			for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]*)<\/Prefix>/g))
				commonPrefixes.push(decodeXml(m[1]));
			const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
			const nm = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
			marker = truncated ? (nm ? decodeXml(nm[1]) : keys[keys.length - 1]) : undefined;
			if (!truncated) break;
		} while (marker);
		return { keys, commonPrefixes };
	}

	async delete(key: string): Promise<void> {
		const pathname = `/${key}`;
		const res = await requestUrl({
			url: `${this.apiBase}/${this.encodeKey(key)}`,
			method: "DELETE",
			headers: { Authorization: this.auth("delete", pathname, {}), Host: this.host },
			throw: false,
		});
		if (res.status >= 300 && res.status !== 404) throw new Error(`COS 删除失败 (${res.status})`);
	}

	async deleteMany(keys: string[]): Promise<void> {
		if (!keys.length) return;
		const body =
			`<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>` +
			keys.map((k) => `<Object><Key>${escapeXml(k)}</Key></Object>`).join("") +
			`</Delete>`;
		const bodyBuf = Buffer.from(body, "utf-8");
		const md5 = crypto.createHash("md5").update(bodyBuf).digest("base64");
		const query = { delete: "" };
		const res = await requestUrl({
			url: `${this.apiBase}/?delete`,
			method: "POST",
			headers: {
				Authorization: this.auth("post", "/", query),
				Host: this.host,
				"Content-Type": "application/xml",
				"Content-MD5": md5,
			},
			body: toArrayBuffer(bodyBuf),
			throw: false,
		});
		if (res.status >= 300) throw new Error(`COS 批量删除失败 (${res.status})`);
	}

	publicUrl(key: string): string {
		return `${this.publicOrigin}/${key}`;
	}
}
```

- [ ] **Step 2: Verify typecheck and build pass**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck clean; tests still pass; build writes `main.js` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/publish/stores/tencent-store.ts
git commit -m "feat: implement Tencent COS BlobStore (REST + signature)"
```

---

### Task 5: Settings UI — provider dropdown, Tencent section, i18n

Add the provider selector, a Tencent COS section mirroring the OSS one, and make the URL preview follow the active provider. Final task: build + deploy to the vault.

**Files:**
- Modify: `src/core/i18n.ts` (new keys, zh + en)
- Modify: `src/ui/settings.ts` (provider dropdown, preview branching, Tencent section)

**Interfaces:**
- Consumes: `ShareOnlineSettings` (Task 2); `t()` from `core/i18n`.
- Produces: no exported API change.

- [ ] **Step 1: Add i18n keys (zh)**

In `src/core/i18n.ts`, inside the `zh` object, add these keys next to the existing `settings.oss.*` block:

```ts
	"settings.provider.name": "存储服务",
	"settings.provider.desc": "选择发布到哪个云存储",
	"settings.cos.heading": "通过腾讯云COS发布",
	"settings.cos.callout.item1": "请确保 COS 存储桶访问权限为「公有读私有写」",
	"settings.cos.callout.item2": "COS 必须配置自定义域名，否则链接打开只会触发下载",
	"settings.cosRegion.name": "Region",
	"settings.cosRegion.desc": "例如 ap-guangzhou",
	"settings.cosBucket.name": "Bucket",
	"settings.cosBucket.desc": "含 APPID，例如 my-bucket-1250000000",
	"settings.cosSecretId.name": "SecretId",
	"settings.cosSecretKey.name": "SecretKey",
	"settings.cosPrefix.name": "上传前缀路径",
	"settings.cosPrefix.desc": "COS 中的目录前缀，例如 notes → notes/<笔记名>",
	"settings.cosDomain.name": "自定义域名",
	"settings.cosDomain.desc": "替换默认的 COS 域名，留空则使用默认。例如 https://cdn.example.com",
```

- [ ] **Step 2: Add i18n keys (en)**

In the same file, inside the `en` object, add:

```ts
	"settings.provider.name": "Storage provider",
	"settings.provider.desc": "Choose which cloud to publish to",
	"settings.cos.heading": "Publish via Tencent COS",
	"settings.cos.callout.item1": "Ensure your COS bucket permission is \"Public Read / Private Write\"",
	"settings.cos.callout.item2": "COS must have a custom domain configured; otherwise links will trigger a download instead of opening",
	"settings.cosRegion.name": "Region",
	"settings.cosRegion.desc": "e.g. ap-guangzhou",
	"settings.cosBucket.name": "Bucket",
	"settings.cosBucket.desc": "Includes APPID, e.g. my-bucket-1250000000",
	"settings.cosSecretId.name": "SecretId",
	"settings.cosSecretKey.name": "SecretKey",
	"settings.cosPrefix.name": "Upload Prefix",
	"settings.cosPrefix.desc": "Directory prefix in COS, e.g. notes → notes/<note-name>",
	"settings.cosDomain.name": "Custom Domain",
	"settings.cosDomain.desc": "Replace the default COS domain. Leave empty for default. e.g. https://cdn.example.com",
```

- [ ] **Step 3: Rewrite `buildPreviewUrl` to follow the active provider**

In `src/ui/settings.ts`, replace the `buildPreviewUrl` method (lines 39-49) with:

```ts
	private buildPreviewUrl(): string {
		const s = this.plugin.settings;
		let base: string;
		let prefix: string;
		if (s.storageProvider === "tencent") {
			base = s.cosDomain
				? s.cosDomain
				: s.cosRegion && s.cosBucket
				? `https://${s.cosBucket}.cos.${s.cosRegion}.myqcloud.com`
				: `https://<bucket>.cos.<region>.myqcloud.com`;
			prefix = (s.cosPrefix || DEFAULT_SETTINGS.cosPrefix).replace(/\/$/, "");
		} else {
			base = s.ossDomain
				? s.ossDomain
				: s.ossRegion && s.ossBucket
				? `https://${s.ossBucket}.${s.ossRegion}.aliyuncs.com`
				: `https://<bucket>.<region>.aliyuncs.com`;
			prefix = (s.ossPrefix || DEFAULT_SETTINGS.ossPrefix).replace(/\/$/, "");
		}
		const sample = "ab3c5d7e9f2x".slice(0, Math.max(1, s.pageLinkLength));
		return `${base}/${prefix}/${sample}`;
	}
```

- [ ] **Step 4: Add the provider dropdown + shared preview in the General section**

In `src/ui/settings.ts` `buildUI()`, immediately after the language `Setting` block (after line 83, inside `generalDetails`), add the provider selector and move the preview here so it is always visible:

```ts
			new Setting(generalDetails)
				.setName(t("settings.provider.name"))
				.setDesc(t("settings.provider.desc"))
				.addDropdown((dropdown) =>
					dropdown
						.addOption("aliyun", "阿里云 OSS")
						.addOption("tencent", "腾讯云 COS")
						.setValue(this.plugin.settings.storageProvider)
						.onChange(async (value) => {
							this.plugin.settings.storageProvider = value as "aliyun" | "tencent";
							await this.plugin.saveSettings();
							this.buildUI();
						})
				);

			const previewWrap = generalDetails.createDiv({ cls: "opal-url-preview" });
			previewWrap.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
			previewEl = previewWrap.createSpan({ cls: "opal-url-preview-url", text: this.buildPreviewUrl() });
```

Then in the OSS callout block, **remove** the now-duplicated preview lines (current lines 140-142):

```ts
			const previewWrap = ossCallout.createDiv({ cls: "opal-url-preview" });
			previewWrap.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
			previewEl = previewWrap.createSpan({ cls: "opal-url-preview-url", text: this.buildPreviewUrl() });
```

(The `let previewEl: HTMLElement | undefined;` declaration at line 59 stays. All existing `previewEl?.setText(this.buildPreviewUrl())` calls continue to work.)

- [ ] **Step 5: Add the Tencent COS section**

In `src/ui/settings.ts` `buildUI()`, after the entire OSS `details` block (after the `ossDomain` Setting, around line 223), add a parallel Tencent section:

```ts
			// ── 腾讯云 COS / Tencent COS ─ collapsible ──
			const cosDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
			cosDetails.createEl("summary", {
				cls: "opal-collapsible-heading",
				text: t("settings.cos.heading"),
			});

			const cosCallout = cosDetails.createDiv({ cls: "opal-oss-callout" });
			const cosCalloutList = cosCallout.createEl("ul");
			cosCalloutList.createEl("li", { text: t("settings.cos.callout.item1") });
			cosCalloutList.createEl("li", { text: t("settings.cos.callout.item2") });

			new Setting(cosDetails)
				.setName(t("settings.cosRegion.name"))
				.setDesc(t("settings.cosRegion.desc"))
				.addText((text) =>
					text
						.setPlaceholder("ap-guangzhou")
						.setValue(this.plugin.settings.cosRegion)
						.onChange(async (value) => {
							this.plugin.settings.cosRegion = value.trim();
							await this.plugin.saveSettings();
							previewEl?.setText(this.buildPreviewUrl());
						})
				);

			new Setting(cosDetails)
				.setName(t("settings.cosBucket.name"))
				.setDesc(t("settings.cosBucket.desc"))
				.addText((text) =>
					text
						.setPlaceholder("my-bucket-1250000000")
						.setValue(this.plugin.settings.cosBucket)
						.onChange(async (value) => {
							this.plugin.settings.cosBucket = value.trim();
							await this.plugin.saveSettings();
							previewEl?.setText(this.buildPreviewUrl());
						})
				);

			new Setting(cosDetails)
				.setName(t("settings.cosSecretId.name"))
				.addText((text) => {
					text
						.setPlaceholder("SecretId")
						.setValue(this.plugin.settings.cosSecretId)
						.onChange(async (value) => {
							this.plugin.settings.cosSecretId = value.trim();
							await this.plugin.saveSettings();
						});
					text.inputEl.type = "password";
				});

			new Setting(cosDetails)
				.setName(t("settings.cosSecretKey.name"))
				.addText((text) => {
					text
						.setPlaceholder("SecretKey")
						.setValue(this.plugin.settings.cosSecretKey)
						.onChange(async (value) => {
							this.plugin.settings.cosSecretKey = value.trim();
							await this.plugin.saveSettings();
						});
					text.inputEl.type = "password";
				});

			new Setting(cosDetails)
				.setName(t("settings.cosPrefix.name"))
				.setDesc(t("settings.cosPrefix.desc"))
				.addText((text) =>
					text
						.setPlaceholder("notes")
						.setValue(this.plugin.settings.cosPrefix)
						.onChange(async (value) => {
							this.plugin.settings.cosPrefix = value.trim() || DEFAULT_SETTINGS.cosPrefix;
							await this.plugin.saveSettings();
							previewEl?.setText(this.buildPreviewUrl());
						})
				);

			new Setting(cosDetails)
				.setName(t("settings.cosDomain.name"))
				.setDesc(t("settings.cosDomain.desc"))
				.addText((text) =>
					text
						.setPlaceholder("https://cdn.example.com")
						.setValue(this.plugin.settings.cosDomain)
						.onChange(async (value) => {
							this.plugin.settings.cosDomain = value.trim().replace(/\/$/, "");
							await this.plugin.saveSettings();
							previewEl?.setText(this.buildPreviewUrl());
						})
				);
```

- [ ] **Step 6: Verify typecheck, tests, and build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all pass; `main.js` written.

- [ ] **Step 7: Deploy to the local vault**

Run:

```bash
cp main.js manifest.json styles.css "/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/link-trace/"
```

Expected: files copied; the enabled plugin hot-reloads. Manually verify in Obsidian settings: the "存储服务" dropdown switches between OSS and COS sections and the URL preview updates accordingly.

- [ ] **Step 8: Commit**

```bash
git add src/core/i18n.ts src/ui/settings.ts
git commit -m "feat: settings UI for storage provider selection + Tencent COS"
```

---

## Self-Review

**Spec coverage:**
- Multi-provider architecture / BlobStore abstraction → Task 3.
- Aliyun migrated into a store, `oss.ts` deleted, `uploadToOss`+`uploadSubNoteToOss` merged into `uploadPage` → Task 3.
- Tencent COS via `requestUrl` + hand-written HMAC-SHA1 signature → Tasks 1 (signature) + 4 (store).
- Single "current provider" setting + separate creds → Task 2 (`storageProvider` + `cos*`).
- Settings UI: provider dropdown, parallel Tencent section, preview follows provider → Task 5.
- i18n keys (zh + en) → Task 5.
- COS signature unit test against official vectors → Task 1.
- main.ts rewiring (uploadPage/deletePage) → Task 3.
- KaTeX self-hosting / page layout / cache headers preserved provider-agnostically → Task 3 (`storage.ts`).
- Build + deploy to vault → Task 5 Step 7.

**Placeholder scan:** No TBD/TODO. The `TencentStore` stub in Task 3 is intentional, fully written, and replaced wholesale in Task 4 (noted in both tasks).

**Type consistency:** `BlobStore` members (`prefix`, `isConfigured`, `put`, `head`, `listObjects`, `delete`, `deleteMany`, `publicUrl`) and `PutOptions` (`mime`, `cacheControl`, `contentEncoding?`) are identical across `storage.ts`, `aliyun-store.ts`, and `tencent-store.ts`. `CosSignInput` fields used in Task 4's `auth()` match Task 1's definition. `getStore` switches on `settings.storageProvider` (`"aliyun" | "tencent"`) defined in Task 2. `uploadPage`/`deletePage` signatures match the main.ts call sites in Task 3.
