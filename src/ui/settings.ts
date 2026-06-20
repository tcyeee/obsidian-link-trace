import { App, PluginSettingTab, Setting } from "obsidian";
import type ShareOnlinePlugin from "../../main";
import { Language, t, setLanguage, formatPageCount } from "../core/i18n";

export interface ShareOnlineSettings {
	includeLinkedNotes: boolean;
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
	includeLinkedNotes: false,
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

	display(): void {
		this.buildUI();
	}

	private buildUI(): void {
		const { containerEl } = this;
		containerEl.empty();

		// previewEl is created inside the selected route's config block (if any),
		// so it stays undefined when no route is chosen. Captured by closure here
		// so the page-length dropdown below can refresh it too.
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

		// ── 发布路线配置 / Publish Route ──────────
		// One route, two choices (Aliyun OSS / Tencent COS). The matching credential
		// block only appears once a route is picked; "none" shows just the selector.
		const routeDetails = containerEl.createEl("details", { cls: "opal-collapsible" });
		routeDetails.setAttribute("open", "");
		routeDetails.createEl("summary", {
			cls: "opal-collapsible-heading",
			text: t("settings.route.heading"),
		});

		new Setting(routeDetails)
			.setName(t("settings.route.name"))
			.setDesc(t("settings.route.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", t("settings.route.option.none"))
					.addOption("aliyun", "阿里云 OSS")
					.addOption("tencent", "腾讯云 COS")
					.setValue(this.plugin.settings.storageProvider)
					.onChange(async (value) => {
						this.plugin.settings.storageProvider = value as ShareOnlineSettings["storageProvider"];
						await this.plugin.saveSettings();
						this.buildUI();
					})
			);

		if (this.plugin.settings.storageProvider === "aliyun") {
			previewEl = this.renderAliyunConfig(routeDetails);
		} else if (this.plugin.settings.storageProvider === "tencent") {
			previewEl = this.renderTencentConfig(routeDetails);
		}
	}

	/** Render the Aliyun OSS credential block; returns the live URL-preview span. */
	private renderAliyunConfig(parent: HTMLElement): HTMLElement {
		const callout = parent.createDiv({ cls: "opal-oss-callout" });
		const calloutList = callout.createEl("ul");
		calloutList.createEl("li", { text: t("settings.oss.callout.item1") });
		calloutList.createEl("li", { text: t("settings.oss.callout.item2") });

		const previewWrap = parent.createDiv({ cls: "opal-url-preview" });
		previewWrap.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
		const preview = previewWrap.createSpan({ cls: "opal-url-preview-url", text: this.buildPreviewUrl() });

		new Setting(parent)
			.setName(t("settings.ossRegion.name"))
			.setDesc(t("settings.ossRegion.desc"))
			.addText((text) =>
				text
					.setPlaceholder("oss-cn-hangzhou")
					.setValue(this.plugin.settings.ossRegion)
					.onChange(async (value) => {
						this.plugin.settings.ossRegion = value.trim();
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		new Setting(parent)
			.setName(t("settings.ossBucket.name"))
			.addText((text) =>
				text
					.setPlaceholder("my-bucket")
					.setValue(this.plugin.settings.ossBucket)
					.onChange(async (value) => {
						this.plugin.settings.ossBucket = value.trim();
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		new Setting(parent)
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

		new Setting(parent)
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

		new Setting(parent)
			.setName(t("settings.ossPrefix.name"))
			.setDesc(t("settings.ossPrefix.desc"))
			.addText((text) =>
				text
					.setPlaceholder("notes")
					.setValue(this.plugin.settings.ossPrefix)
					.onChange(async (value) => {
						this.plugin.settings.ossPrefix = value.trim() || DEFAULT_SETTINGS.ossPrefix;
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		new Setting(parent)
			.setName(t("settings.ossDomain.name"))
			.setDesc(t("settings.ossDomain.desc"))
			.addText((text) =>
				text
					.setPlaceholder("https://cdn.example.com")
					.setValue(this.plugin.settings.ossDomain)
					.onChange(async (value) => {
						this.plugin.settings.ossDomain = value.trim().replace(/\/$/, "");
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		return preview;
	}

	/** Render the Tencent COS credential block; returns the live URL-preview span. */
	private renderTencentConfig(parent: HTMLElement): HTMLElement {
		const callout = parent.createDiv({ cls: "opal-oss-callout" });
		const calloutList = callout.createEl("ul");
		calloutList.createEl("li", { text: t("settings.cos.callout.item1") });
		calloutList.createEl("li", { text: t("settings.cos.callout.item2") });

		const previewWrap = parent.createDiv({ cls: "opal-url-preview" });
		previewWrap.createSpan({ cls: "opal-url-preview-label", text: t("settings.urlPreview.label") });
		const preview = previewWrap.createSpan({ cls: "opal-url-preview-url", text: this.buildPreviewUrl() });

		new Setting(parent)
			.setName(t("settings.cosRegion.name"))
			.setDesc(t("settings.cosRegion.desc"))
			.addText((text) =>
				text
					.setPlaceholder("ap-guangzhou")
					.setValue(this.plugin.settings.cosRegion)
					.onChange(async (value) => {
						this.plugin.settings.cosRegion = value.trim();
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		new Setting(parent)
			.setName(t("settings.cosBucket.name"))
			.setDesc(t("settings.cosBucket.desc"))
			.addText((text) =>
				text
					.setPlaceholder("my-bucket-1250000000")
					.setValue(this.plugin.settings.cosBucket)
					.onChange(async (value) => {
						this.plugin.settings.cosBucket = value.trim();
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		new Setting(parent)
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

		new Setting(parent)
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

		new Setting(parent)
			.setName(t("settings.cosPrefix.name"))
			.setDesc(t("settings.cosPrefix.desc"))
			.addText((text) =>
				text
					.setPlaceholder("notes")
					.setValue(this.plugin.settings.cosPrefix)
					.onChange(async (value) => {
						this.plugin.settings.cosPrefix = value.trim() || DEFAULT_SETTINGS.cosPrefix;
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		new Setting(parent)
			.setName(t("settings.cosDomain.name"))
			.setDesc(t("settings.cosDomain.desc"))
			.addText((text) =>
				text
					.setPlaceholder("https://cdn.example.com")
					.setValue(this.plugin.settings.cosDomain)
					.onChange(async (value) => {
						this.plugin.settings.cosDomain = value.trim().replace(/\/$/, "");
						await this.plugin.saveSettings();
						preview.setText(this.buildPreviewUrl());
					})
			);

		return preview;
	}
}
