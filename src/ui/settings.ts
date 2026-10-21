import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	SettingGroupItem,
} from "obsidian";
import type ShareOnlinePlugin from "../../main";
import { Language, t, setLanguage, formatPageCount } from "../core/i18n";

export interface ShareOnlineSettings {
	/** Export depth: 1 = main note only, 2 = + direct sub-pages, 3 = + one more level. */
	exportLevel: number;
	/** Strip the core "Unique note creator" timestamp prefix from the exported <title>. */
	stripUniquePrefix: boolean;
	storageProvider: "none" | "aliyun" | "tencent";
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

export const DEFAULT_SETTINGS: ShareOnlineSettings = {
	exportLevel: 1,
	stripUniquePrefix: true,
	storageProvider: "none",
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

export class ShareOnlineSettingTab extends PluginSettingTab {
	plugin: ShareOnlinePlugin;

	/** Live URL-preview span, set by whichever route's config items are rendered. */
	private previewEl?: HTMLElement;

	constructor(app: App, plugin: ShareOnlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

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

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				heading: t("settings.general.heading"),
				items: this.generalItems(),
			},
			{
				type: "group",
				heading: t("settings.export.heading"),
				items: this.exportItems(),
			},
			{
				type: "group",
				heading: t("settings.route.heading"),
				items: this.routeItems(),
			},
		];
	}

	// ── 通用 / General ────────────────────────
	private generalItems(): SettingGroupItem[] {
		return [
			{
				name: t("settings.language"),
				desc: t("settings.language.desc"),
				render: (setting: Setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption("zh", "中文")
							.addOption("en", "English")
							.setValue(this.plugin.settings.language)
							.onChange(async (value) => {
								this.plugin.settings.language = value as Language;
								setLanguage(value as Language);
								await this.plugin.saveSettings();
								this.update();
							})
					);
				},
			},
		];
	}

	// ── 导出设置 / Export Settings ────────────
	private exportItems(): SettingGroupItem[] {
		return [
			{
				name: t("settings.exportLevel.name"),
				desc: t("settings.exportLevel.desc"),
				render: (setting: Setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption("1", t("settings.exportLevel.option.1"))
							.addOption("2", t("settings.exportLevel.option.2"))
							.addOption("3", t("settings.exportLevel.option.3"))
							.setValue(String(this.plugin.settings.exportLevel))
							.onChange(async (value) => {
								this.plugin.settings.exportLevel = parseInt(value, 10);
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				name: t("settings.pageLinkLength.name"),
				desc: t("settings.pageLinkLength.desc"),
				render: (setting: Setting) => {
					setting.addDropdown((dropdown) => {
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
								this.previewEl?.setText(this.buildPreviewUrl());
							});
					});
				},
			},
			{
				name: t("settings.stripUniquePrefix.name"),
				desc: t("settings.stripUniquePrefix.desc"),
				render: (setting: Setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.stripUniquePrefix)
							.onChange(async (value) => {
								this.plugin.settings.stripUniquePrefix = value;
								await this.plugin.saveSettings();
							})
					);
				},
			},
		];
	}

	// ── 发布路线配置 / Publish Route ──────────
	// One route, two choices (Aliyun OSS / Tencent COS). The matching credential
	// items only appear once a route is picked; "none" shows just the selector.
	private routeItems(): SettingGroupItem[] {
		const items: SettingGroupItem[] = [
			{
				name: t("settings.route.name"),
				desc: t("settings.route.desc"),
				render: (setting: Setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption("none", t("settings.route.option.none"))
							.addOption("aliyun", "阿里云 OSS")
							.addOption("tencent", "腾讯云 COS")
							.setValue(this.plugin.settings.storageProvider)
							.onChange(async (value) => {
								this.plugin.settings.storageProvider = value as ShareOnlineSettings["storageProvider"];
								await this.plugin.saveSettings();
								this.update();
							})
					);
				},
			},
		];

		if (this.plugin.settings.storageProvider === "aliyun") {
			items.push(...this.aliyunConfigItems());
		} else if (this.plugin.settings.storageProvider === "tencent") {
			items.push(...this.tencentConfigItems());
		}

		return items;
	}

	/** Aliyun OSS credential items; the second item captures the live URL-preview span. */
	private aliyunConfigItems(): SettingGroupItem[] {
		return [
			{
				name: t("settings.oss.heading"),
				render: (setting: Setting) => {
					setting.settingEl.empty();
					setting.settingEl.addClass("opal-oss-callout");
					const calloutList = setting.settingEl.createEl("ul");
					calloutList.createEl("li", { text: t("settings.oss.callout.item1") });
					calloutList.createEl("li", { text: t("settings.oss.callout.item2") });
				},
			},
			{
				name: t("settings.urlPreview.label"),
				render: (setting: Setting) => {
					setting.settingEl.empty();
					setting.settingEl.addClass("opal-url-preview");
					setting.settingEl.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
					this.previewEl = setting.settingEl.createSpan({
						cls: "opal-url-preview-url",
						text: this.buildPreviewUrl(),
					});
				},
			},
			{
				name: t("settings.ossRegion.name"),
				desc: t("settings.ossRegion.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("oss-cn-hangzhou")
							.setValue(this.plugin.settings.ossRegion)
							.onChange(async (value) => {
								this.plugin.settings.ossRegion = value.trim();
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
			{
				name: t("settings.ossBucket.name"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("my-bucket")
							.setValue(this.plugin.settings.ossBucket)
							.onChange(async (value) => {
								this.plugin.settings.ossBucket = value.trim();
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
			{
				name: t("settings.ossKeyId.name"),
				render: (setting: Setting) => {
					setting.addText((text) => {
						text
							.setPlaceholder("AccessKey ID")
							.setValue(this.plugin.settings.ossAccessKeyId)
							.onChange(async (value) => {
								this.plugin.settings.ossAccessKeyId = value.trim();
								await this.plugin.saveSettings();
							});
						text.inputEl.type = "password";
					});
				},
			},
			{
				name: t("settings.ossKeySecret.name"),
				render: (setting: Setting) => {
					setting.addText((text) => {
						text
							.setPlaceholder("AccessKey Secret")
							.setValue(this.plugin.settings.ossAccessKeySecret)
							.onChange(async (value) => {
								this.plugin.settings.ossAccessKeySecret = value.trim();
								await this.plugin.saveSettings();
							});
						text.inputEl.type = "password";
					});
				},
			},
			{
				name: t("settings.ossPrefix.name"),
				desc: t("settings.ossPrefix.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("notes")
							.setValue(this.plugin.settings.ossPrefix)
							.onChange(async (value) => {
								this.plugin.settings.ossPrefix = value.trim() || DEFAULT_SETTINGS.ossPrefix;
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
			{
				name: t("settings.ossDomain.name"),
				desc: t("settings.ossDomain.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("https://cdn.example.com")
							.setValue(this.plugin.settings.ossDomain)
							.onChange(async (value) => {
								this.plugin.settings.ossDomain = value.trim().replace(/\/$/, "");
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
		];
	}

	/** Tencent COS credential items; the second item captures the live URL-preview span. */
	private tencentConfigItems(): SettingGroupItem[] {
		return [
			{
				name: t("settings.cos.heading"),
				render: (setting: Setting) => {
					setting.settingEl.empty();
					setting.settingEl.addClass("opal-oss-callout");
					const calloutList = setting.settingEl.createEl("ul");
					calloutList.createEl("li", { text: t("settings.cos.callout.item1") });
					calloutList.createEl("li", { text: t("settings.cos.callout.item2") });
				},
			},
			{
				name: t("settings.urlPreview.label"),
				render: (setting: Setting) => {
					setting.settingEl.empty();
					setting.settingEl.addClass("opal-url-preview");
					setting.settingEl.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
					this.previewEl = setting.settingEl.createSpan({
						cls: "opal-url-preview-url",
						text: this.buildPreviewUrl(),
					});
				},
			},
			{
				name: t("settings.cosRegion.name"),
				desc: t("settings.cosRegion.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("ap-guangzhou")
							.setValue(this.plugin.settings.cosRegion)
							.onChange(async (value) => {
								this.plugin.settings.cosRegion = value.trim();
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
			{
				name: t("settings.cosBucket.name"),
				desc: t("settings.cosBucket.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("my-bucket-1250000000")
							.setValue(this.plugin.settings.cosBucket)
							.onChange(async (value) => {
								this.plugin.settings.cosBucket = value.trim();
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
			{
				name: t("settings.cosSecretId.name"),
				render: (setting: Setting) => {
					setting.addText((text) => {
						text
							.setPlaceholder("SecretId")
							.setValue(this.plugin.settings.cosSecretId)
							.onChange(async (value) => {
								this.plugin.settings.cosSecretId = value.trim();
								await this.plugin.saveSettings();
							});
						text.inputEl.type = "password";
					});
				},
			},
			{
				name: t("settings.cosSecretKey.name"),
				render: (setting: Setting) => {
					setting.addText((text) => {
						text
							.setPlaceholder("SecretKey")
							.setValue(this.plugin.settings.cosSecretKey)
							.onChange(async (value) => {
								this.plugin.settings.cosSecretKey = value.trim();
								await this.plugin.saveSettings();
							});
						text.inputEl.type = "password";
					});
				},
			},
			{
				name: t("settings.cosPrefix.name"),
				desc: t("settings.cosPrefix.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("notes")
							.setValue(this.plugin.settings.cosPrefix)
							.onChange(async (value) => {
								this.plugin.settings.cosPrefix = value.trim() || DEFAULT_SETTINGS.cosPrefix;
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
			{
				name: t("settings.cosDomain.name"),
				desc: t("settings.cosDomain.desc"),
				render: (setting: Setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("https://cdn.example.com")
							.setValue(this.plugin.settings.cosDomain)
							.onChange(async (value) => {
								this.plugin.settings.cosDomain = value.trim().replace(/\/$/, "");
								await this.plugin.saveSettings();
								this.previewEl?.setText(this.buildPreviewUrl());
							})
					);
				},
			},
		];
	}
}
