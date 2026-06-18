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
