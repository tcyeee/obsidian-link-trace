import { Menu, Notice, Plugin, TFile, setIcon, setTooltip } from "obsidian";
import { ShareOnlineSettings, DEFAULT_SETTINGS, ShareOnlineSettingTab } from "./src/settings";
import { exportToLocal, prepareExport, generateUniqueName, collectLinkedNotesWithStatus, rewriteInternalLinks } from "./src/exporter";
import { ShareModal } from "./src/share-modal";
import { uploadToOss, uploadSubNoteToOss, deleteFromOss, listPublishedNames, ensureKatexAssets, katexBaseUrl } from "./src/oss";
import { t, setLanguage } from "./src/i18n";
import { getAnalyticsInjectConfig } from "./src/analytics";

/* ── Export Toast ──────────────────────────────────────────────────────── */

class ExportToast {
	private el: HTMLElement;
	private state: "loading" | "done" = "loading";
	private timer = 0;

	constructor(loadingText = t("toast.uploading")) {
		this.el = createDiv({ cls: "opal-toast" });
		this.el.createDiv({ cls: "opal-spinner" });
		this.el.createSpan({ text: loadingText });
		activeDocument.body.appendChild(this.el);
		window.requestAnimationFrame(() => this.el.classList.add("is-visible"));
	}

	setSuccess(text = t("toast.uploadSuccess")) {
		if (this.state === "done") return;
		this.state = "done";
		window.clearTimeout(this.timer);
		this.el.empty();
		const iconEl = this.el.createDiv();
		setIcon(iconEl, "check");
		this.el.createSpan({ text });
		this.timer = window.setTimeout(() => this.dismiss(), 2800);
	}

	setError(text: string) {
		if (this.state === "done") return;
		this.state = "done";
		window.clearTimeout(this.timer);
		this.el.empty();
		const iconEl = this.el.createDiv();
		setIcon(iconEl, "x");
		this.el.createSpan({ text });
		this.timer = window.setTimeout(() => this.dismiss(), 4000);
	}

	dismiss() {
		window.clearTimeout(this.timer);
		this.el.classList.remove("is-visible");
		window.setTimeout(() => this.el.remove(), 250);
	}
}

export default class ShareOnlinePlugin extends Plugin {
	settings: ShareOnlineSettings;
	private statusBarEl: HTMLElement;
	private currentToast: ExportToast | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ShareOnlineSettingTab(this.app, this));

		this.addCommand({
			id: "export-current-note-to-desktop",
			name: t("cmd.exportLocal"),
			callback: () => this.exportCurrentNote(),
		});

		this.addCommand({
			id: "export-current-note-to-oss",
			name: t("cmd.exportOss"),
			callback: () => this.exportCurrentNote(true),
		});

		// ── Status bar share button ──────────────────────────────────────
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("opal-status-bar-btn");
		setTooltip(this.statusBarEl, t("statusbar.shareNote"));
		setIcon(this.statusBarEl, "share-2");
		this.updateStatusBar();

		this.statusBarEl.addEventListener("click", (e) => this.showShareMenu(e));

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.updateStatusBar())
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (changedFile) => {
				const active = this.app.workspace.getActiveFile();
				if (active && changedFile.path === active.path) this.updateStatusBar();
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ShareOnlineSettings>);
		setLanguage(this.settings.language);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ── Frontmatter helpers ───────────────────────────────────────────────

	getShareLink(file: TFile): string {
		return (this.app.metadataCache.getFileCache(file)?.frontmatter?.["share_link"] as string | undefined) ?? "";
	}

	private async setShareLink(file: TFile, url: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["share_link"] = url;
		});
	}

	private async removeShareLink(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			delete fm["share_link"];
		});
	}

	// ── File type helper ──────────────────────────────────────────────────

	/** Only Markdown notes can be published / shared. */
	private isMarkdown(file: TFile | null): file is TFile {
		return !!file && file.extension === "md";
	}

	// ── Status bar ───────────────────────────────────────────────────────

	private updateStatusBar() {
		const file = this.app.workspace.getActiveFile();
		// Only Markdown notes can be shared — hide the icon for anything else
		if (!this.isMarkdown(file)) {
			this.statusBarEl.hide();
			return;
		}
		this.statusBarEl.show();
		const published = !!this.getShareLink(file);
		this.statusBarEl.toggleClass("opal-status-published", published);
		setTooltip(this.statusBarEl, published ? t("statusbar.published") : t("statusbar.shareNote"));
	}

	private showShareMenu(event: MouseEvent) {
		const file = this.app.workspace.getActiveFile();
		if (!this.isMarkdown(file)) {
			new Notice(t("notice.onlyMarkdown.share"));
			return;
		}

		const published = !!this.getShareLink(file);
		const menu = new Menu();

		const ossReady = !!(
			this.settings.ossRegion &&
			this.settings.ossBucket &&
			this.settings.ossAccessKeyId &&
			this.settings.ossAccessKeySecret
		);

		if (!published) {
			menu.addItem((item) =>
				item
					.setTitle(t("menu.publish"))
					.setIcon("upload-cloud")
					.setDisabled(!ossReady)
					.onClick(() => {
						if (!ossReady) return;
						new ShareModal(this.app, this, file, "publish", (subNotes) => {
							void this.doPublish(file, subNotes);
						}).open();
					})
			);
			menu.addItem((item) =>
				item
					.setTitle(t("menu.exportLocal"))
					.setIcon("download")
					.onClick(async () => {
						await this.exportFile(file);
						this.currentToast?.setSuccess(t("toast.exportSuccess"));
					})
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle(t("menu.openLink"))
					.setIcon("external-link")
					.onClick(() => {
						const url = this.getShareLink(file);
						activeWindow.open(url, "_blank");
					})
			);
			menu.addItem((item) =>
				item
					.setTitle(t("menu.update"))
					.setIcon("refresh-cw")
					.onClick(() => this.updateNote(file))
			);
			menu.addItem((item) =>
				item
					.setTitle(t("menu.unpublish"))
					.setIcon("eye-off")
					.onClick(() => {
						new ShareModal(this.app, this, file, "unpublish", (subNotes) => {
							void this.doUnpublish(file, subNotes);
						}).open();
					})
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(t("menu.exportLocal"))
					.setIcon("download")
					.onClick(async () => {
						await this.exportFile(file);
						this.currentToast?.setSuccess(t("toast.exportSuccess"));
					})
			);
		}

		menu.showAtPosition({ x: event.clientX + 12, y: event.clientY + 28 });
	}

	// ── Actions ──────────────────────────────────────────────────────────

	private async doPublish(
		file: TFile,
		subNotes: { file: TFile; shareLink: string }[],
		existingName?: string,
		successText = t("toast.publishSuccess"),
		copyToClipboard = true
	): Promise<void> {
		this.currentToast?.dismiss();
		this.currentToast = new ExportToast(t("toast.uploading"));
		try {
			// Seed with every name already published to OSS so new names never
			// overwrite an unrelated note; reused names go in too so freshly
			// generated sub-note names avoid them.
			const usedNames = await listPublishedNames(this.settings);
			const mainName = existingName ?? generateUniqueName(usedNames, this.settings.pageLinkLength);
			usedNames.add(mainName);
			const katexBase = katexBaseUrl(this.settings);
			const analytics = getAnalyticsInjectConfig(this.settings);
			// Self-hosted KaTeX is provisioned once, the first time a math page is published.
			let katexProvisioned = false;
			const ensureKatex = async () => {
				if (katexProvisioned) return;
				await ensureKatexAssets(this.settings);
				katexProvisioned = true;
			};
			const result = await prepareExport(this.app, this.app.vault, file, mainName, katexBase, analytics);
			const subFolderMap = new Map<string, string>();
			let mainHtml = result.html;

			for (const sn of subNotes) {
				if (sn.shareLink) {
					// Already published — reuse existing noteName for link rewriting
					const noteName = this.extractNoteName(sn.shareLink);
					usedNames.add(noteName);
					subFolderMap.set(sn.file.basename, noteName);
					subFolderMap.set(sn.file.path.replace(/\.md$/i, ""), noteName);
				} else {
					const subResult = await prepareExport(this.app, this.app.vault, sn.file, generateUniqueName(usedNames, this.settings.pageLinkLength), katexBase, analytics);
					subFolderMap.set(sn.file.basename, subResult.noteName);
					subFolderMap.set(sn.file.path.replace(/\.md$/i, ""), subResult.noteName);
					if (subResult.hasMath) await ensureKatex();
					const subUrl = await uploadSubNoteToOss(
						this.settings,
						this.app.vault,
						subResult.noteName,
						subResult.html,
						subResult.images
					);
					await this.setShareLink(sn.file, subUrl);
				}
			}

			mainHtml = rewriteInternalLinks(mainHtml, subFolderMap, false);
			if (result.hasMath) await ensureKatex();
			const url = await uploadToOss(
				this.settings,
				this.app.vault,
				result.noteName,
				mainHtml,
				result.images
			);
			await this.setShareLink(file, url);
			this.updateStatusBar();
			if (copyToClipboard) {
				await navigator.clipboard.writeText(url);
			}
			this.currentToast?.setSuccess(successText);
		} catch (err: unknown) {
			this.currentToast?.setError(t("toast.publishFailed", { error: (err as Error).message }));
			console.error(err);
		}
	}

	private async doUnpublish(
		file: TFile,
		subNotesToDelete: { file: TFile; shareLink: string }[]
	): Promise<void> {
		this.currentToast?.dismiss();
		this.currentToast = new ExportToast(t("toast.stopping"));
		try {
			// Delete selected sub-notes first (errors are non-fatal)
			for (const sn of subNotesToDelete) {
				const snName = this.extractNoteName(sn.shareLink);
				try {
					await deleteFromOss(this.settings, snName);
					await this.removeShareLink(sn.file);
				} catch (err: unknown) {
					console.error(`删除二级笔记失败 (${sn.file.basename}):`, err);
					new Notice(t("notice.deleteSubFailed", { name: sn.file.basename }));
				}
			}

			// Delete main note (fatal on failure)
			const existingUrl = this.getShareLink(file);
			if (existingUrl) {
				const existingName = this.extractNoteName(existingUrl);
				await deleteFromOss(this.settings, existingName);
			}
			await this.removeShareLink(file);
			this.updateStatusBar();
			this.currentToast?.setSuccess(t("toast.stopped"));
		} catch (err: unknown) {
			this.currentToast?.setError(t("toast.stopFailed", { error: (err as Error).message }));
			console.error(err);
		}
	}

	private extractNoteName(url: string): string {
		const parts = url.split("/");
		const last = parts[parts.length - 1];
		// Old format: .../noteName/index.html — new format: .../noteName.html
		return last === "index.html" ? (parts[parts.length - 2] ?? "") : last.replace(/\.html$/i, "");
	}

	private async updateNote(file: TFile) {
		const existingUrl = this.getShareLink(file);
		const existingName = existingUrl ? this.extractNoteName(existingUrl) : undefined;
		const subNotes = this.settings.includeLinkedNotes
			? collectLinkedNotesWithStatus(this.app, file)
			: [];
		await this.doPublish(file, subNotes, existingName, t("toast.updateSuccess"), false);
	}

	private async exportCurrentNote(toOss = false) {
		const file = this.app.workspace.getActiveFile();
		if (!this.isMarkdown(file)) {
			new Notice(t("notice.onlyMarkdown.publish"));
			return;
		}
		if (toOss) {
			const subNotes = this.settings.includeLinkedNotes
				? collectLinkedNotesWithStatus(this.app, file)
				: [];
			await this.doPublish(file, subNotes, undefined, t("toast.uploadSuccess"), false);
		} else {
			await this.exportFile(file);
			this.currentToast?.setSuccess("导出成功");
		}
	}

	private async exportFile(file: TFile): Promise<void> {
		this.currentToast?.dismiss();
		this.currentToast = new ExportToast(t("toast.exporting"));
		try {
			await exportToLocal(
				this.app,
				this.app.vault,
				file,
				this.settings.exportPath || DEFAULT_SETTINGS.exportPath,
				this.settings.includeLinkedNotes,
				this.settings.pageLinkLength,
				getAnalyticsInjectConfig(this.settings)
			);
		} catch (err: unknown) {
			this.currentToast?.setError(t("toast.exportFailed", { error: (err as Error).message }));
			console.error(err);
		}
	}

	onunload() {
		this.currentToast?.dismiss();
	}
}
