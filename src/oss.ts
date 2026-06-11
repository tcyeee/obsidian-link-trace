import { Vault, TFile } from "obsidian";
import type { ShareOnlineSettings } from "./settings";
import OSS from "ali-oss";

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
			const res = (await client.list(
				{ prefix, delimiter: "/", "max-keys": 1000, marker },
				{}
			)) as { objects?: { name: string }[]; prefixes?: string[]; isTruncated?: boolean; nextMarker?: string };
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
	} catch (err) {
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

	// CSS is inlined in the HTML; upload as a single flat file.
	await client.put(
		`${prefix}/${noteName}`,
		Buffer.from(html, "utf-8"),
		{ mime: "text/html; charset=utf-8" }
	);

	// Images live in a peer folder: {prefix}/{noteName}/images/
	for (const [exportName, imgFile] of images) {
		const data = await vault.readBinary(imgFile);
		await client.put(
			`${prefix}/${noteName}/images/${exportName}`,
			Buffer.from(data),
			{ mime: getMimeType(imgFile.extension) }
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
	await client.put(`${prefix}/${subFolderName}`, Buffer.from(html, "utf-8"), { mime: "text/html; charset=utf-8" });

	for (const [exportName, imgFile] of images) {
		const data = await vault.readBinary(imgFile);
		await client.put(
			`${prefix}/${subFolderName}/images/${exportName}`,
			Buffer.from(data),
			{ mime: getMimeType(imgFile.extension) }
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
