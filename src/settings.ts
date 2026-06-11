import { App, PluginSettingTab, Setting } from "obsidian";
import * as path from "path";
import * as os from "os";
import type ShareOnlinePlugin from "../main";

export interface ShareOnlineSettings {
	exportPath: string;
	includeLinkedNotes: boolean;
	ossRegion: string;
	ossBucket: string;
	ossAccessKeyId: string;
	ossAccessKeySecret: string;
	ossPrefix: string;
	ossDomain: string;
	pageLinkLength: number;
}

export const DEFAULT_SETTINGS: ShareOnlineSettings = {
	exportPath: path.join(os.homedir(), "Desktop"),
	includeLinkedNotes: false,
	ossRegion: "",
	ossBucket: "",
	ossAccessKeyId: "",
	ossAccessKeySecret: "",
	ossPrefix: "notes",
	ossDomain: "",
	pageLinkLength: 3,
};

export class ShareOnlineSettingTab extends PluginSettingTab {
	plugin: ShareOnlinePlugin;

	constructor(app: App, plugin: ShareOnlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── 导出设置 ──────────────────────────────
		new Setting(containerEl).setName("导出设置").setHeading();

		new Setting(containerEl)
			.setName("包含二级笔记")
			.setDesc("导出单个笔记时，同时导出该笔记中链接的所有二级笔记")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeLinkedNotes)
					.onChange(async (value) => {
						this.plugin.settings.includeLinkedNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("页面名称长度")
			.setDesc("生成分享链接时的路径长度，越长碰撞概率越低")
			.addDropdown((dropdown) => {
				const capacities: Record<number, string> = {
					2: "约 1,296 个唯一页面",
					3: "约 46,656 个唯一页面",
					4: "约 1,679,616 个唯一页面",
					5: "约 60,466,176 个唯一页面",
					6: "约 2,176,782,336 个唯一页面",
				};
				for (const len of [2, 3, 4, 5, 6]) {
					dropdown.addOption(String(len), `${len} — ${capacities[len]}`);
				}
				dropdown
					.setValue(String(this.plugin.settings.pageLinkLength))
					.onChange(async (value) => {
						this.plugin.settings.pageLinkLength = parseInt(value, 10);
						await this.plugin.saveSettings();
					});
			});

		// ── 本地导出 ──────────────────────────────
		new Setting(containerEl).setName("本地导出").setHeading();

		new Setting(containerEl)
			.setName("导出路径")
			.setDesc("笔记导出的目标文件夹，默认为桌面")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.exportPath)
					.setValue(this.plugin.settings.exportPath)
					.onChange(async (value) => {
						this.plugin.settings.exportPath = value.trim() || DEFAULT_SETTINGS.exportPath;
						await this.plugin.saveSettings();
					})
			);

		// ── 阿里云 OSS ────────────────────────────
		new Setting(containerEl).setName("阿里云 OSS").setHeading();

		new Setting(containerEl)
			.setName("Region")
			.setDesc("例如 oss-cn-hangzhou")
			.addText((text) =>
				text
					.setPlaceholder("oss-cn-hangzhou")
					.setValue(this.plugin.settings.ossRegion)
					.onChange(async (value) => {
						this.plugin.settings.ossRegion = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bucket")
			.addText((text) =>
				text
					.setPlaceholder("my-bucket")
					.setValue(this.plugin.settings.ossBucket)
					.onChange(async (value) => {
						this.plugin.settings.ossBucket = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Access key ID")
			.addText((text) => {
				text
					.setPlaceholder("AccessKey ID")
					.setValue(this.plugin.settings.ossAccessKeyId)
					.onChange(async (value) => {
						this.plugin.settings.ossAccessKeyId = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Access key secret")
			.addText((text) => {
				text
					.setPlaceholder("AccessKey Secret")
					.setValue(this.plugin.settings.ossAccessKeySecret)
					.onChange(async (value) => {
						this.plugin.settings.ossAccessKeySecret = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("上传前缀路径")
			.setDesc("OSS 中的目录前缀，例如 notes → notes/<笔记名>/index.html")
			.addText((text) =>
				text
					.setPlaceholder("notes")
					.setValue(this.plugin.settings.ossPrefix)
					.onChange(async (value) => {
						this.plugin.settings.ossPrefix = value.trim() || DEFAULT_SETTINGS.ossPrefix;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("自定义域名")
			.setDesc("替换默认的 OSS 域名，留空则使用默认。例如 https://cdn.example.com")
			.addText((text) =>
				text
					.setPlaceholder("https://cdn.example.com")
					.setValue(this.plugin.settings.ossDomain)
					.onChange(async (value) => {
						this.plugin.settings.ossDomain = value.trim().replace(/\/$/, "");
						await this.plugin.saveSettings();
					})
			);
	}
}
