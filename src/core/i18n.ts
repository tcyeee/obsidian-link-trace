export type Language = "zh" | "en";

type Translations = Record<string, string>;

const zh: Translations = {
	"settings.language": "语言 / Language",
	"settings.language.desc": "切换界面语言",

	"settings.general.heading": "通用",
	"settings.export.heading": "导出设置",
	"settings.oss.heading": "通过阿里云OSS发布",
	"settings.oss.callout.item1": "请确保 OSS Bucket 权限为「公共读」",
	"settings.oss.callout.item2": "OSS 必须配置域名，否则链接打开只会触发下载",

	"settings.exportLevel.name": "导出层级",
	"settings.exportLevel.desc": "导出时向下展开多少层链接 / base 条目；越深包含的子页面越多",
	"settings.exportLevel.option.1": "一级（仅当前笔记）",
	"settings.exportLevel.option.2": "二级（含直接子页面）",
	"settings.exportLevel.option.3": "三级（含子页面的子页面）",
	"settings.stripUniquePrefix.name": "兼容 Unique 笔记前缀",
	"settings.stripUniquePrefix.desc": "读取核心插件「唯一笔记创建器」的格式，导出时从 HTML 标题中去掉对应的时间戳前缀（如 202606281230- 我的笔记 → 我的笔记）",
	"settings.pageLinkLength.name": "页面名称长度",
	"settings.pageLinkLength.desc": "生成分享链接时的路径长度，越长碰撞概率越低",


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

	"settings.route.heading": "发布路线配置",
	"settings.route.name": "发布路线",
	"settings.route.desc": "选择一条发布路线（二选一），选择后下方会显示对应配置",
	"settings.route.option.none": "— 请选择 —",
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

	"modal.views.loading": "浏览 …",
	"modal.views.value": "👁 {count}",
	"modal.views.fail": "👁 —",

	"stats.title": "分享统计",
	"stats.ribbon": "分享统计",
	"stats.command": "打开分享统计页",
	"stats.refresh": "刷新",
	"stats.card.pages": "正在分享",
	"stats.card.views": "总浏览量",
	"stats.card.unit.views": "次",
	"stats.viewsCount": "{count} 次浏览",
	"stats.views.unknown": "—",
	"stats.list.title": "正在分享的笔记",
	"stats.list.count": "共 {count} 条内容",
	"stats.list.unpublished.title": "已下架",
	"stats.unpublished.republish": "重新上架",
	"stats.unpublished.hide": "隐藏记录",
	"stats.unpublished.collapse": "收起",
	"stats.unpublished.expand": "展开",
	"stats.unpublished.loadMore": "加载更多（还有 {count} 条）",
	"stats.empty": "还没有已发布的分享页",
	"stats.notConfigured": "未配置 GoatCounter API Token，无法读取访问数据（仅列出已发布页面）",
	"stats.fetchFailed": "访问数据读取失败，仅列出已发布页面",
	"stats.openNote": "打开笔记",
	"stats.openLink": "打开分享页",
	"stats.openDetail": "查看详细统计",
	"stats.detail.totalViews": "总浏览量",
	"stats.detail.published": "发布于 {time}",
	"stats.detail.trend": "近 30 天趋势",
	"stats.detail.noTrend": "近 30 天暂无访问",
	"stats.detail.referrers": "来源",
	"stats.detail.browsers": "浏览器",
	"stats.detail.systems": "操作系统",
	"stats.detail.locations": "国家／地区",
	"stats.detail.languages": "语言",
	"stats.detail.sizes": "屏幕尺寸",
	"stats.detail.size.phone": "手机",
	"stats.detail.size.tablet": "平板／大屏手机",
	"stats.detail.size.desktop": "电脑显示器",
	"stats.detail.size.desktophd": "高清以上显示器",
	"stats.detail.noData": "暂无数据",
	"stats.detail.unknownName": "（未知）",
	"stats.detail.directReferrer": "直接访问",

	"cmd.exportLocal": "导出为 ZIP",
	"cmd.exportOss": "导出到 OSS",

	"statusbar.shareNote": "分享笔记",
	"statusbar.published": "已发布 — 点击管理",
	"statusbar.stale": "内容有更新 — 点击管理",

	"toast.uploading": "上传中...",
	"toast.progress.rendering": "正在渲染页面...",
	"toast.progress.subPage": "上传关联页 {done}/{total}...",
	"toast.progress.mainPage": "上传主页面...",
	"toast.progress.deleteSub": "删除关联页 {done}/{total}...",
	"toast.progress.deleteMain": "删除主页面...",
	"toast.uploadSuccess": "上传成功",
	"toast.exporting": "导出中...",
	"toast.exportSuccess": "已下载 ZIP",
	"toast.stopping": "停止分享中...",
	"toast.stopped": "已停止分享",
	"toast.stoppedWithWarn": "已停止分享，但部分二级笔记未删除：{names}",
	"toast.publishSuccess": "发布成功，链接已复制到剪贴板",
	"toast.updateSuccess": "更新成功",
	"toast.republishSuccess": "重新上架成功",
	"toast.publishFailed": "发布失败：{error}",
	"toast.exportFailed": "导出失败：{error}",
	"toast.stopFailed": "停止分享失败：{error}",

	"menu.publish": "发布笔记",
	"menu.exportLocal": "导出为 ZIP",
	"menu.openLink": "打开链接",
	"menu.update": "内容更新",
	"menu.unpublish": "停止分享",

	"notice.onlyMarkdown.share": "只能分享 Markdown 笔记",
	"notice.onlyMarkdown.publish": "只能发布 Markdown 笔记",
	"notice.noRoute": "请先在插件设置中选择发布路线（阿里云 OSS 或 腾讯云 COS）",
	"notice.routeNotConfigured": "请先在插件设置中填写所选发布路线的配置信息",

	"modal.publish.title": "发布笔记",
	"modal.unpublish.title": "停止分享",
	"modal.mainNote": "主笔记",
	"modal.mainNote.stopping": "主笔记（将被停止分享）",
	"modal.subNotes.publish": "关联的子页面 ({count})",
	"modal.subNotes.unpublish": "关联的子页面（可勾选一并停止）",
	"modal.badge.hasLink": "已有链接",
	"modal.badge.willUpload": "将被上传",
	"modal.check.notShared": "未分享，无需停止",
	"modal.subNotes.truncated": "子页面过多，仅显示前 {max} 个",
	"modal.subNotes.overLimit": "已选 {count} 个子页面，超过上限 {max}，请取消勾选部分页面后再发布",
	"modal.btn.cancel": "取消",
	"modal.btn.confirmPublish": "确认发布",
	"modal.btn.confirmUnpublish": "确认停止分享",

	"popover.title": "已发布到网络",
	"popover.published": "发布于 {time}",
	"popover.badge.fresh": "已是最新",
	"popover.badge.stale": "待更新",
	"popover.hint.stale": "内容已修改，建议重新发布",
	"popover.btn.update": "重新发布",
	"popover.copied": "链接已复制",
	"popover.copy": "复制链接",
	"popover.unpublished.title": "尚未发布",
	"popover.unpublished.subline": "发布后可获得分享链接",
	"popover.stats.views": "阅读量",
	"popover.stats.refresh": "刷新阅读量",
	"popover.stats.noTrend": "近 14 天暂无访问",
	"popover.stats.expand": "展开",
	"popover.stats.collapse": "收起",
};

const en: Translations = {
	"settings.language": "语言 / Language",
	"settings.language.desc": "Switch interface language",

	"settings.general.heading": "General",
	"settings.export.heading": "Export Settings",
	"settings.oss.heading": "Publish via Aliyun OSS",
	"settings.oss.callout.item1": "Ensure your OSS Bucket ACL is set to \"Public Read\"",
	"settings.oss.callout.item2": "OSS must have a custom domain configured; otherwise links will trigger a download instead of opening",

	"settings.exportLevel.name": "Export depth",
	"settings.exportLevel.desc": "How many levels of links / base entries to expand when exporting; deeper includes more sub-pages",
	"settings.exportLevel.option.1": "Level 1 (this note only)",
	"settings.exportLevel.option.2": "Level 2 (+ direct sub-pages)",
	"settings.exportLevel.option.3": "Level 3 (+ sub-pages of sub-pages)",
	"settings.stripUniquePrefix.name": "Unique-note prefix compatibility",
	"settings.stripUniquePrefix.desc": "Read the core \"Unique note creator\" format and strip its timestamp prefix from the exported HTML title (e.g. 202606281230-My Note → My Note)",
	"settings.pageLinkLength.name": "Page Name Length",
	"settings.pageLinkLength.desc": "Length of the share link path; longer means fewer collisions",


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

	"settings.route.heading": "Publish Route",
	"settings.route.name": "Publish route",
	"settings.route.desc": "Pick one publish route; its configuration appears below once selected",
	"settings.route.option.none": "— Select —",
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

	"modal.views.loading": "Views …",
	"modal.views.value": "👁 {count}",
	"modal.views.fail": "👁 —",

	"stats.title": "Share Stats",
	"stats.ribbon": "Share stats",
	"stats.command": "Open share stats page",
	"stats.refresh": "Refresh",
	"stats.card.pages": "Sharing",
	"stats.card.views": "Total views",
	"stats.card.unit.views": "",
	"stats.viewsCount": "{count} views",
	"stats.views.unknown": "—",
	"stats.list.title": "Currently sharing",
	"stats.list.count": "{count} total",
	"stats.list.unpublished.title": "Unpublished",
	"stats.unpublished.republish": "Republish",
	"stats.unpublished.hide": "Hide record",
	"stats.unpublished.collapse": "Collapse",
	"stats.unpublished.expand": "Expand",
	"stats.unpublished.loadMore": "Load more ({count} left)",
	"stats.empty": "No published share pages yet",
	"stats.notConfigured": "No GoatCounter API Token configured — listing pages only, without view counts",
	"stats.fetchFailed": "Failed to read view data — listing pages only",
	"stats.openNote": "Open note",
	"stats.openLink": "Open share page",
	"stats.openDetail": "View detailed stats",
	"stats.detail.totalViews": "Total views",
	"stats.detail.published": "Published {time}",
	"stats.detail.trend": "Last 30 days",
	"stats.detail.noTrend": "No visits in the last 30 days",
	"stats.detail.referrers": "Referrers",
	"stats.detail.browsers": "Browsers",
	"stats.detail.systems": "Operating systems",
	"stats.detail.locations": "Countries / regions",
	"stats.detail.languages": "Languages",
	"stats.detail.sizes": "Screen sizes",
	"stats.detail.size.phone": "Phones",
	"stats.detail.size.tablet": "Tablets and large phones",
	"stats.detail.size.desktop": "Computer monitors",
	"stats.detail.size.desktophd": "Computer monitors larger than HD",
	"stats.detail.noData": "No data",
	"stats.detail.unknownName": "(unknown)",
	"stats.detail.directReferrer": "Direct",

	"cmd.exportLocal": "Export as ZIP",
	"cmd.exportOss": "Export to OSS",

	"statusbar.shareNote": "Share note",
	"statusbar.published": "Published — click to manage",
	"statusbar.stale": "Content changed — click to manage",

	"toast.uploading": "Uploading...",
	"toast.progress.rendering": "Rendering page...",
	"toast.progress.subPage": "Uploading linked page {done}/{total}...",
	"toast.progress.mainPage": "Uploading main page...",
	"toast.progress.deleteSub": "Deleting linked page {done}/{total}...",
	"toast.progress.deleteMain": "Deleting main page...",
	"toast.uploadSuccess": "Upload successful",
	"toast.exporting": "Exporting...",
	"toast.exportSuccess": "ZIP downloaded",
	"toast.stopping": "Stopping share...",
	"toast.stopped": "Sharing stopped",
	"toast.stoppedWithWarn": "Sharing stopped, but some sub-notes were not removed: {names}",
	"toast.publishSuccess": "Published, link copied to clipboard",
	"toast.updateSuccess": "Updated successfully",
	"toast.republishSuccess": "Republished successfully",
	"toast.publishFailed": "Publish failed: {error}",
	"toast.exportFailed": "Export failed: {error}",
	"toast.stopFailed": "Stop sharing failed: {error}",

	"menu.publish": "Publish Note",
	"menu.exportLocal": "Export as ZIP",
	"menu.openLink": "Open link",
	"menu.update": "Update content",
	"menu.unpublish": "Stop sharing",

	"notice.onlyMarkdown.share": "Only Markdown notes can be shared",
	"notice.onlyMarkdown.publish": "Only Markdown notes can be published",
	"notice.noRoute": "Please choose a publish route (Aliyun OSS or Tencent COS) in the plugin settings first",
	"notice.routeNotConfigured": "Please fill in the configuration for the selected publish route in the plugin settings first",

	"modal.publish.title": "Publish Note",
	"modal.unpublish.title": "Stop Sharing",
	"modal.mainNote": "Main Note",
	"modal.mainNote.stopping": "Main Note (sharing will be stopped)",
	"modal.subNotes.publish": "Linked sub-pages ({count})",
	"modal.subNotes.unpublish": "Linked sub-pages (optionally stop sharing)",
	"modal.badge.hasLink": "Has link",
	"modal.badge.willUpload": "Will be uploaded",
	"modal.check.notShared": "Not shared, nothing to stop",
	"modal.subNotes.truncated": "Too many sub-pages; showing the first {max}",
	"modal.subNotes.overLimit": "{count} sub-pages selected, over the limit of {max}. Uncheck some pages before publishing.",
	"modal.btn.cancel": "Cancel",
	"modal.btn.confirmPublish": "Confirm Publish",
	"modal.btn.confirmUnpublish": "Confirm Stop Sharing",

	"popover.title": "Published online",
	"popover.published": "Published {time}",
	"popover.badge.fresh": "Up to date",
	"popover.badge.stale": "Needs update",
	"popover.hint.stale": "Content changed — re-publish recommended",
	"popover.btn.update": "Re-publish",
	"popover.copied": "Link copied",
	"popover.copy": "Copy link",
	"popover.unpublished.title": "Not published yet",
	"popover.unpublished.subline": "Publish to get a shareable link",
	"popover.stats.views": "Views",
	"popover.stats.refresh": "Refresh views",
	"popover.stats.noTrend": "No visits in the last 14 days",
	"popover.stats.expand": "Expand",
	"popover.stats.collapse": "Collapse",
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
