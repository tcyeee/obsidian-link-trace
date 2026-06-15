export type Language = "zh" | "en";

type Translations = Record<string, string>;

const zh: Translations = {
	"settings.language": "语言 / Language",
	"settings.language.desc": "切换界面语言",

	"settings.general.heading": "通用",
	"settings.export.heading": "导出设置",
	"settings.local.heading": "本地导出",
	"settings.oss.heading": "通过阿里云OSS发布",
	"settings.oss.callout.item1": "请确保 OSS Bucket 权限为「公共读」",
	"settings.oss.callout.item2": "OSS 必须配置域名，否则链接打开只会触发下载",

	"settings.includeLinked.name": "包含二级笔记",
	"settings.includeLinked.desc": "导出单个笔记时，同时导出该笔记中链接的所有二级笔记",
	"settings.shareBanner.name": "在分享的笔记中显示提示框",
	"settings.shareBanner.desc": "已分享的笔记在 Obsidian 中顶部显示提示框（含链接、发布时间、滞后提醒）。该提示框只存在于编辑器，不会写入文件，也不会被导出。",
	"settings.pageLinkLength.name": "页面名称长度",
	"settings.pageLinkLength.desc": "生成分享链接时的路径长度，越长碰撞概率越低",

	"settings.exportPath.name": "导出路径",
	"settings.exportPath.desc": "笔记导出的目标文件夹，默认为桌面",

	"settings.ossRegion.name": "Region",
	"settings.ossRegion.desc": "例如 oss-cn-hangzhou",
	"settings.ossBucket.name": "Bucket",
	"settings.ossKeyId.name": "Access key ID",
	"settings.ossKeySecret.name": "Access key secret",
	"settings.ossPrefix.name": "上传前缀路径",
	"settings.ossPrefix.desc": "OSS 中的目录前缀，例如 notes → notes/<笔记名>/index.html",
	"settings.ossDomain.name": "自定义域名",
	"settings.ossDomain.desc": "替换默认的 OSS 域名，留空则使用默认。例如 https://cdn.example.com",
	"settings.urlPreview.label": "预览：",

	"settings.analytics.heading": "访问统计",
	"settings.analytics.callout.item1": "基于 Umami Cloud 免费档，需先在 cloud.umami.is 注册站点并获取 Website ID 与 API Key",
	"settings.analytics.callout.item2": "脚本由 cloud.umami.is 提供，国内访客加载可能不稳定，统计或有遗漏",
	"settings.analyticsEnabled.name": "启用访问统计",
	"settings.analyticsEnabled.desc": "在发布/导出的页面中嵌入 Umami 埋点脚本",
	"settings.umamiScriptUrl.name": "埋点脚本地址",
	"settings.umamiScriptUrl.desc": "Umami 的 script.js 地址，Cloud 默认 https://cloud.umami.is/script.js",
	"settings.umamiWebsiteId.name": "Website ID",
	"settings.umamiWebsiteId.desc": "Umami 后台站点的 UUID（用作 data-website-id）",
	"settings.umamiApiKey.name": "API Key",
	"settings.umamiApiKey.desc": "用于读取浏览量的 Umami Cloud API Key",
	"modal.views.loading": "浏览 …",
	"modal.views.value": "👁 浏览 {pv} · 访客 {uv}",
	"modal.views.fail": "👁 —",

	"cmd.exportLocal": "导出到本地",
	"cmd.exportOss": "导出到 OSS",

	"statusbar.shareNote": "分享笔记",
	"statusbar.published": "已发布 — 点击管理",

	"toast.uploading": "上传中...",
	"toast.uploadSuccess": "上传成功",
	"toast.exporting": "导出中...",
	"toast.exportSuccess": "导出成功",
	"toast.stopping": "停止分享中...",
	"toast.stopped": "已停止分享",
	"toast.publishSuccess": "发布成功，链接已复制到剪贴板",
	"toast.updateSuccess": "更新成功",
	"toast.publishFailed": "发布失败：{error}",
	"toast.exportFailed": "导出失败：{error}",
	"toast.stopFailed": "停止分享失败：{error}",

	"menu.publish": "发布笔记",
	"menu.exportLocal": "导出到本地",
	"menu.openLink": "打开链接",
	"menu.update": "内容更新",
	"menu.unpublish": "停止分享",

	"notice.onlyMarkdown.share": "只能分享 Markdown 笔记",
	"notice.onlyMarkdown.publish": "只能发布 Markdown 笔记",
	"notice.deleteSubFailed": "删除 {name} 失败，已保留其分享链接",

	"modal.publish.title": "发布笔记",
	"modal.unpublish.title": "停止分享",
	"modal.mainNote": "主笔记",
	"modal.mainNote.stopping": "主笔记（将被停止分享）",
	"modal.subNotes.publish": "关联的二级笔记 ({count})",
	"modal.subNotes.unpublish": "关联的二级笔记（可选择一并停止）",
	"modal.badge.hasLink": "已有链接，跳过",
	"modal.badge.willUpload": "将被上传",
	"modal.btn.cancel": "取消",
	"modal.btn.confirmPublish": "确认发布",
	"modal.btn.confirmUnpublish": "确认停止分享",
};

const en: Translations = {
	"settings.language": "语言 / Language",
	"settings.language.desc": "Switch interface language",

	"settings.general.heading": "General",
	"settings.export.heading": "Export Settings",
	"settings.local.heading": "Local Export",
	"settings.oss.heading": "Publish via Aliyun OSS",
	"settings.oss.callout.item1": "Ensure your OSS Bucket ACL is set to \"Public Read\"",
	"settings.oss.callout.item2": "OSS must have a custom domain configured; otherwise links will trigger a download instead of opening",

	"settings.includeLinked.name": "Include Linked Notes",
	"settings.includeLinked.desc": "When exporting a note, also export all linked sub-notes",
	"settings.shareBanner.name": "Show banner on shared notes",
	"settings.shareBanner.desc": "Shared notes show a banner at the top inside Obsidian (link, publish time, stale warning). The banner lives only in the editor — it is never written to the file or exported.",
	"settings.pageLinkLength.name": "Page Name Length",
	"settings.pageLinkLength.desc": "Length of the share link path; longer means fewer collisions",

	"settings.exportPath.name": "Export Path",
	"settings.exportPath.desc": "Target folder for note export, defaults to Desktop",

	"settings.ossRegion.name": "Region",
	"settings.ossRegion.desc": "e.g. oss-cn-hangzhou",
	"settings.ossBucket.name": "Bucket",
	"settings.ossKeyId.name": "Access key ID",
	"settings.ossKeySecret.name": "Access key secret",
	"settings.ossPrefix.name": "Upload Prefix",
	"settings.ossPrefix.desc": "Directory prefix in OSS, e.g. notes → notes/<note-name>/index.html",
	"settings.ossDomain.name": "Custom Domain",
	"settings.ossDomain.desc": "Replace the default OSS domain. Leave empty for default. e.g. https://cdn.example.com",
	"settings.urlPreview.label": "Preview: ",

	"settings.analytics.heading": "Analytics",
	"settings.analytics.callout.item1": "Uses the free Umami Cloud tier — register a site at cloud.umami.is to get the Website ID and API Key",
	"settings.analytics.callout.item2": "The script is served from cloud.umami.is; loading may be unreliable for mainland-China visitors, so counts can be undercounted",
	"settings.analyticsEnabled.name": "Enable analytics",
	"settings.analyticsEnabled.desc": "Embed the Umami tracking script into published/exported pages",
	"settings.umamiScriptUrl.name": "Tracking script URL",
	"settings.umamiScriptUrl.desc": "Umami script.js URL; Cloud default is https://cloud.umami.is/script.js",
	"settings.umamiWebsiteId.name": "Website ID",
	"settings.umamiWebsiteId.desc": "The Umami site UUID (used as data-website-id)",
	"settings.umamiApiKey.name": "API Key",
	"settings.umamiApiKey.desc": "Umami Cloud API Key used to read page views",
	"modal.views.loading": "Views …",
	"modal.views.value": "👁 {pv} views · {uv} visitors",
	"modal.views.fail": "👁 —",

	"cmd.exportLocal": "Export to local",
	"cmd.exportOss": "Export to OSS",

	"statusbar.shareNote": "Share note",
	"statusbar.published": "Published — click to manage",

	"toast.uploading": "Uploading...",
	"toast.uploadSuccess": "Upload successful",
	"toast.exporting": "Exporting...",
	"toast.exportSuccess": "Export successful",
	"toast.stopping": "Stopping share...",
	"toast.stopped": "Sharing stopped",
	"toast.publishSuccess": "Published, link copied to clipboard",
	"toast.updateSuccess": "Updated successfully",
	"toast.publishFailed": "Publish failed: {error}",
	"toast.exportFailed": "Export failed: {error}",
	"toast.stopFailed": "Stop sharing failed: {error}",

	"menu.publish": "Publish Note",
	"menu.exportLocal": "Export to local",
	"menu.openLink": "Open link",
	"menu.update": "Update content",
	"menu.unpublish": "Stop sharing",

	"notice.onlyMarkdown.share": "Only Markdown notes can be shared",
	"notice.onlyMarkdown.publish": "Only Markdown notes can be published",
	"notice.deleteSubFailed": "Failed to delete {name}, share link retained",

	"modal.publish.title": "Publish Note",
	"modal.unpublish.title": "Stop Sharing",
	"modal.mainNote": "Main Note",
	"modal.mainNote.stopping": "Main Note (sharing will be stopped)",
	"modal.subNotes.publish": "Linked sub-notes ({count})",
	"modal.subNotes.unpublish": "Linked sub-notes (optionally stop sharing)",
	"modal.badge.hasLink": "Has link, skipping",
	"modal.badge.willUpload": "Will be uploaded",
	"modal.btn.cancel": "Cancel",
	"modal.btn.confirmPublish": "Confirm Publish",
	"modal.btn.confirmUnpublish": "Confirm Stop Sharing",
};

const translations: Record<Language, Translations> = { zh, en };

let currentLanguage: Language = "zh";

export function setLanguage(lang: Language): void {
	currentLanguage = lang;
}

export function getLanguage(): Language {
	return currentLanguage;
}

export function t(key: string, replacements?: Record<string, string>): string {
	let str = translations[currentLanguage][key] ?? translations.en[key] ?? key;
	if (replacements) {
		for (const [k, v] of Object.entries(replacements)) {
			str = str.replace(`{${k}}`, v);
		}
	}
	return str;
}

export function formatPageCount(count: number): string {
	if (currentLanguage === "zh") {
		let n: string;
		if (count >= 100_000_000) {
			n = (count / 100_000_000).toFixed(1) + "亿";
		} else if (count >= 10_000) {
			const wan = count / 10_000;
			n = (wan >= 100 ? Math.round(wan).toLocaleString("zh-CN") : wan.toFixed(1)) + "万";
		} else {
			n = count.toLocaleString("zh-CN");
		}
		return `可发布${n}个页面`;
	} else {
		let n: string;
		if (count >= 1_000_000_000) {
			n = (count / 1_000_000_000).toFixed(1) + "B";
		} else if (count >= 1_000_000) {
			n = (count / 1_000_000).toFixed(1) + "M";
		} else {
			n = (count / 1_000).toFixed(1) + "K";
		}
		return `~${n} pages`;
	}
}
