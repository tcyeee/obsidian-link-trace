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
