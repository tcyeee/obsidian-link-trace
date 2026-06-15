import { App, PluginSettingTab, Setting } from "obsidian";
import * as path from "path";
import * as os from "os";
import type ShareOnlinePlugin from "../main";
import { Language, t, setLanguage, formatPageCount } from "./i18n";

export interface ShareOnlineSettings {
	exportPath: string;
	includeLinkedNotes: boolean;
	shareBannerEnabled: boolean;
	ossRegion: string;
	ossBucket: string;
	ossAccessKeyId: string;
	ossAccessKeySecret: string;
	ossPrefix: string;
	ossDomain: string;
	pageLinkLength: number;
	analyticsEnabled: boolean;
	umamiScriptUrl: string;
	umamiWebsiteId: string;
	umamiApiKey: string;
	language: Language;
}

export const DEFAULT_SETTINGS: ShareOnlineSettings = {
	exportPath: path.join(os.homedir(), "Desktop"),
	includeLinkedNotes: false,
	shareBannerEnabled: false,
	ossRegion: "",
	ossBucket: "",
	ossAccessKeyId: "",
	ossAccessKeySecret: "",
	ossPrefix: "notes",
	ossDomain: "",
	pageLinkLength: 3,
	analyticsEnabled: false,
	umamiScriptUrl: "https://cloud.umami.is/script.js",
	umamiWebsiteId: "",
	umamiApiKey: "",
	language: "zh",
};

export class ShareOnlineSettingTab extends PluginSettingTab {
	plugin: ShareOnlinePlugin;

	constructor(app: App, plugin: ShareOnlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private buildPreviewUrl(): string {
		const { ossDomain, ossRegion, ossBucket, ossPrefix, pageLinkLength } = this.plugin.settings;
		const base = ossDomain
			? ossDomain
			: ossRegion && ossBucket
			? `https://${ossBucket}.${ossRegion}.aliyuncs.com`
			: `https://<bucket>.<region>.aliyuncs.com`;
		const prefix = (ossPrefix || DEFAULT_SETTINGS.ossPrefix).replace(/\/$/, "");
		const sample = "ab3c5d7e9f2x".slice(0, Math.max(1, pageLinkLength));
		return `${base}/${prefix}/${sample}`;
	}

	display(): void {
		this.buildUI();
	}

	private buildUI(): void {
		const { containerEl } = this;
		containerEl.empty();

		let previewEl: HTMLElement | undefined;

		// ── 通用 / General ────────────────────────
		const generalDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		generalDetails.setAttribute("open", "");
		generalDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.general.heading"),
		});

		new Setting(generalDetails)
			.setName(t("settings.language"))
			.setDesc(t("settings.language.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("zh", "中文")
					.addOption("en", "English")
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as Language;
						setLanguage(value as Language);
						await this.plugin.saveSettings();
						this.buildUI();
					})
			);

		// ── 导出设置 / Export Settings ────────────
		const exportDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		exportDetails.setAttribute("open", "");
		exportDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.export.heading"),
		});

		new Setting(exportDetails)
			.setName(t("settings.includeLinked.name"))
			.setDesc(t("settings.includeLinked.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeLinkedNotes)
					.onChange(async (value) => {
						this.plugin.settings.includeLinkedNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(exportDetails)
			.setName(t("settings.shareBanner.name"))
			.setDesc(t("settings.shareBanner.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.shareBannerEnabled)
					.onChange(async (value) => {
						this.plugin.settings.shareBannerEnabled = value;
						await this.plugin.saveSettings();
						void this.plugin.shareBanner.refresh();
					})
			);

		new Setting(exportDetails)
			.setName(t("settings.pageLinkLength.name"))
			.setDesc(t("settings.pageLinkLength.desc"))
			.addDropdown((dropdown) => {
				const capacities: Record<number, string> = {
					2: formatPageCount(36 ** 2),
					3: formatPageCount(36 ** 3),
					4: formatPageCount(36 ** 4),
					5: formatPageCount(36 ** 5),
					6: formatPageCount(36 ** 6),
				};
				for (const len of [2, 3, 4, 5, 6]) {
					dropdown.addOption(String(len), `${len} — ${capacities[len]}`);
				}
				dropdown
					.setValue(String(this.plugin.settings.pageLinkLength))
					.onChange(async (value) => {
						this.plugin.settings.pageLinkLength = parseInt(value, 10);
						await this.plugin.saveSettings();
						previewEl?.setText(this.buildPreviewUrl());
					});
			});

		// ── 本地导出 / Local Export ───────────────
		const localDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		localDetails.setAttribute("open", "");
		localDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.local.heading"),
		});

		new Setting(localDetails)
			.setName(t("settings.exportPath.name"))
			.setDesc(t("settings.exportPath.desc"))
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.exportPath)
					.setValue(this.plugin.settings.exportPath)
					.onChange(async (value) => {
						this.plugin.settings.exportPath = value.trim() || DEFAULT_SETTINGS.exportPath;
						await this.plugin.saveSettings();
					})
			);

		// ── 阿里云 OSS / Aliyun OSS ─ collapsible ──
		const ossDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		ossDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.oss.heading"),
		});

		const ossCallout = ossDetails.createDiv({ cls: "opal-oss-callout" });
		const ossCalloutList = ossCallout.createEl("ul");
		ossCalloutList.createEl("li", { text: t("settings.oss.callout.item1") });
		ossCalloutList.createEl("li", { text: t("settings.oss.callout.item2") });

		new Setting(ossDetails)
			.setName(t("settings.ossRegion.name"))
			.setDesc(t("settings.ossRegion.desc"))
			.addText((text) =>
				text
					.setPlaceholder("oss-cn-hangzhou")
					.setValue(this.plugin.settings.ossRegion)
					.onChange(async (value) => {
						this.plugin.settings.ossRegion = value.trim();
						await this.plugin.saveSettings();
						previewEl?.setText(this.buildPreviewUrl());
					})
			);

		new Setting(ossDetails)
			.setName(t("settings.ossBucket.name"))
			.addText((text) =>
				text
					.setPlaceholder("my-bucket")
					.setValue(this.plugin.settings.ossBucket)
					.onChange(async (value) => {
						this.plugin.settings.ossBucket = value.trim();
						await this.plugin.saveSettings();
						previewEl?.setText(this.buildPreviewUrl());
					})
			);

		new Setting(ossDetails)
			.setName(t("settings.ossKeyId.name"))
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

		new Setting(ossDetails)
			.setName(t("settings.ossKeySecret.name"))
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

		new Setting(ossDetails)
			.setName(t("settings.ossPrefix.name"))
			.setDesc(t("settings.ossPrefix.desc"))
			.addText((text) =>
				text
					.setPlaceholder("notes")
					.setValue(this.plugin.settings.ossPrefix)
					.onChange(async (value) => {
						this.plugin.settings.ossPrefix = value.trim() || DEFAULT_SETTINGS.ossPrefix;
						await this.plugin.saveSettings();
						previewEl?.setText(this.buildPreviewUrl());
					})
			);

		new Setting(ossDetails)
			.setName(t("settings.ossDomain.name"))
			.setDesc(t("settings.ossDomain.desc"))
			.addText((text) =>
				text
					.setPlaceholder("https://cdn.example.com")
					.setValue(this.plugin.settings.ossDomain)
					.onChange(async (value) => {
						this.plugin.settings.ossDomain = value.trim().replace(/\/$/, "");
						await this.plugin.saveSettings();
						previewEl?.setText(this.buildPreviewUrl());
					})
			);

		const previewWrap = ossDetails.createDiv({ cls: "opal-url-preview" });
		previewWrap.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
		previewEl = previewWrap.createSpan({ cls: "opal-url-preview-url", text: this.buildPreviewUrl() });

		// ── 访问统计 / Analytics ─ collapsible ──
		const analyticsDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		analyticsDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.analytics.heading"),
		});

		const analyticsCallout = analyticsDetails.createDiv({ cls: "opal-oss-callout" });
		const analyticsCalloutList = analyticsCallout.createEl("ul");
		analyticsCalloutList.createEl("li", { text: t("settings.analytics.callout.item1") });
		analyticsCalloutList.createEl("li", { text: t("settings.analytics.callout.item2") });

		new Setting(analyticsDetails)
			.setName(t("settings.analyticsEnabled.name"))
			.setDesc(t("settings.analyticsEnabled.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.analyticsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.analyticsEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(analyticsDetails)
			.setName(t("settings.umamiScriptUrl.name"))
			.setDesc(t("settings.umamiScriptUrl.desc"))
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.umamiScriptUrl)
					.setValue(this.plugin.settings.umamiScriptUrl)
					.onChange(async (value) => {
						this.plugin.settings.umamiScriptUrl =
							value.trim() || DEFAULT_SETTINGS.umamiScriptUrl;
						await this.plugin.saveSettings();
					})
			);

		new Setting(analyticsDetails)
			.setName(t("settings.umamiWebsiteId.name"))
			.setDesc(t("settings.umamiWebsiteId.desc"))
			.addText((text) =>
				text
					.setPlaceholder("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
					.setValue(this.plugin.settings.umamiWebsiteId)
					.onChange(async (value) => {
						this.plugin.settings.umamiWebsiteId = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(analyticsDetails)
			.setName(t("settings.umamiApiKey.name"))
			.setDesc(t("settings.umamiApiKey.desc"))
			.addText((text) => {
				text
					.setPlaceholder("api_xxx")
					.setValue(this.plugin.settings.umamiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.umamiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});
	}
}
