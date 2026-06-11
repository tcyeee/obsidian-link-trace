import { Menu, Notice, Plugin, TFile, setIcon, setTooltip } from "obsidian";
import { ShareOnlineSettings, DEFAULT_SETTINGS, ShareOnlineSettingTab } from "./src/settings";
import { exportToLocal, prepareExport, collectLinkedNotesWithStatus, rewriteInternalLinks } from "./src/exporter";
import { ShareModal } from "./src/share-modal";
import { uploadToOss, uploadSubNoteToOss, deleteFromOss } from "./src/oss";

/* ── Export Toast ──────────────────────────────────────────────────────── */

class ExportToast {
	private el: HTMLElement;
	private state: "loading" | "done" = "loading";
	private timer = 0;

	constructor(loadingText = "上传中...") {
		this.el = createDiv({ cls: "opal-toast" });
		this.el.createDiv({ cls: "opal-spinner" });
		this.el.createSpan({ text: loadingText });
		activeDocument.body.appendChild(this.el);
		window.requestAnimationFrame(() => this.el.classList.add("is-visible"));
	}

	setSuccess(text = "上传成功") {
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
			name: "导出到本地",
			callback: () => this.exportCurrentNote(),
		});

		this.addCommand({
			id: "export-current-note-to-oss",
			name: "导出到 OSS",
			callback: () => this.exportCurrentNote(true),
		});

		// ── Status bar share button ──────────────────────────────────────
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("opal-status-bar-btn");
		setTooltip(this.statusBarEl, "分享笔记");
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
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ── Frontmatter helpers ───────────────────────────────────────────────

	private getShareLink(file: TFile): string {
		return this.app.metadataCache.getFileCache(file)?.frontmatter?.share_link ?? "";
	}

	private async setShareLink(file: TFile, url: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.share_link = url;
		});
	}

	private async removeShareLink(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			delete fm.share_link;
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
		setTooltip(this.statusBarEl, published ? "已发布 — 点击管理" : "分享笔记");
	}

	private showShareMenu(event: MouseEvent) {
		const file = this.app.workspace.getActiveFile();
		if (!this.isMarkdown(file)) {
			new Notice("只能分享 Markdown 笔记");
			return;
		}

		const published = !!this.getShareLink(file);
		const menu = new Menu();

		if (!published) {
			menu.addItem((item) =>
				item
					.setTitle("发布到线上")
					.setIcon("upload-cloud")
					.onClick(() => {
						new ShareModal(this.app, this, file, "publish", (subNotes) => {
							this.doPublish(file, subNotes);
						}).open();
					})
			);
			menu.addItem((item) =>
				item
					.setTitle("导出到本地")
					.setIcon("download")
					.onClick(async () => {
						await this.exportFile(file);
						this.currentToast?.setSuccess("导出成功");
					})
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle("打开链接")
					.setIcon("external-link")
					.onClick(() => {
						const url = this.getShareLink(file);
						activeWindow.open(url, "_blank");
					})
			);
			menu.addItem((item) =>
				item
					.setTitle("内容更新")
					.setIcon("refresh-cw")
					.onClick(() => this.updateNote(file))
			);
			menu.addItem((item) =>
				item
					.setTitle("停止分享")
					.setIcon("eye-off")
					.onClick(() => {
						new ShareModal(this.app, this, file, "unpublish", (subNotes) => {
							this.doUnpublish(file, subNotes);
						}).open();
					})
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("导出到本地")
					.setIcon("download")
					.onClick(async () => {
						await this.exportFile(file);
						this.currentToast?.setSuccess("导出成功");
					})
			);
		}

		menu.showAtMouseEvent(event);
	}

	// ── Actions ──────────────────────────────────────────────────────────

	private async doPublish(
		file: TFile,
		subNotes: { file: TFile; shareLink: string }[],
		existingName?: string,
		successText = "发布成功，链接已复制到剪贴板",
		copyToClipboard = true
	): Promise<void> {
		this.currentToast?.dismiss();
		this.currentToast = new ExportToast("上传中...");
		try {
			const result = await prepareExport(this.app, this.app.vault, file, existingName);
			const subFolderMap = new Map<string, string>();
			let mainHtml = result.html;

			for (const sn of subNotes) {
				if (sn.shareLink) {
					// Already published — reuse existing noteName for link rewriting
					const noteName = this.extractNoteName(sn.shareLink);
					subFolderMap.set(sn.file.basename, noteName);
					subFolderMap.set(sn.file.path.replace(/\.md$/i, ""), noteName);
				} else {
					const subResult = await prepareExport(this.app, this.app.vault, sn.file);
					subFolderMap.set(sn.file.basename, subResult.noteName);
					subFolderMap.set(sn.file.path.replace(/\.md$/i, ""), subResult.noteName);
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

			mainHtml = rewriteInternalLinks(mainHtml, subFolderMap);
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
		} catch (err) {
			this.currentToast?.setError(`发布失败：${(err as Error).message}`);
			console.error(err);
		}
	}

	private async doUnpublish(
		file: TFile,
		subNotesToDelete: { file: TFile; shareLink: string }[]
	): Promise<void> {
		this.currentToast?.dismiss();
		this.currentToast = new ExportToast("停止分享中...");
		try {
			// Delete selected sub-notes first (errors are non-fatal)
			for (const sn of subNotesToDelete) {
				const snName = this.extractNoteName(sn.shareLink);
				try {
					await deleteFromOss(this.settings, snName);
					await this.removeShareLink(sn.file);
				} catch (err) {
					console.error(`删除二级笔记失败 (${sn.file.basename}):`, err);
					new Notice(`删除 ${sn.file.basename} 失败，已保留其分享链接`);
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
			this.currentToast?.setSuccess("已停止分享");
		} catch (err) {
			this.currentToast?.setError(`停止分享失败：${(err as Error).message}`);
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
		await this.doPublish(file, subNotes, existingName, "更新成功", false);
	}

	private async exportCurrentNote(toOss = false) {
		const file = this.app.workspace.getActiveFile();
		if (!this.isMarkdown(file)) {
			new Notice("只能发布 Markdown 笔记");
			return;
		}
		if (toOss) {
			const subNotes = this.settings.includeLinkedNotes
				? collectLinkedNotesWithStatus(this.app, file)
				: [];
			await this.doPublish(file, subNotes, undefined, "上传成功", false);
		} else {
			await this.exportFile(file);
			this.currentToast?.setSuccess("导出成功");
		}
	}

	private async exportFile(file: TFile): Promise<void> {
		this.currentToast?.dismiss();
		this.currentToast = new ExportToast("导出中...");
		try {
			await exportToLocal(
				this.app,
				this.app.vault,
				file,
				this.settings.exportPath || DEFAULT_SETTINGS.exportPath,
				this.settings.includeLinkedNotes
			);
		} catch (err) {
			this.currentToast?.setError(`导出失败：${(err as Error).message}`);
			console.error(err);
		}
	}

	onunload() {
		this.currentToast?.dismiss();
	}
}
