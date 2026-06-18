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
