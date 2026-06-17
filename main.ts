import { MarkdownView, Notice, Plugin, TFile, debounce, setIcon, setTooltip } from "obsidian";
import { ShareOnlineSettings, DEFAULT_SETTINGS, ShareOnlineSettingTab } from "./src/settings";
import { exportToLocal, prepareExport, generateUniqueName, collectLinkedNotesWithStatus, rewriteInternalLinks } from "./src/exporter";
import { ShareModal } from "./src/share-modal";
import { uploadToOss, uploadSubNoteToOss, deleteFromOss, listPublishedNames, ensureKatexAssets, katexBaseUrl } from "./src/oss";
import { t, setLanguage } from "./src/i18n";
import { getAnalyticsInjectConfig } from "./src/analytics";
import { hashBody, stripFrontmatter } from "./src/note-hash";
import { SharePopover } from "./src/share-popover";
import { ShareStatsView, VIEW_TYPE_SHARE_STATS } from "./src/stats-view";

export default class ShareOnlinePlugin extends Plugin {
	settings: ShareOnlineSettings;
	sharePopover: SharePopover;
	private statusBarEl: HTMLElement;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ShareOnlineSettingTab(this.app, this));
		this.sharePopover = new SharePopover(this);

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

		// ── Share-stats page (dedicated tab + ribbon + command) ──────────────
		this.registerView(VIEW_TYPE_SHARE_STATS, (leaf) => new ShareStatsView(leaf, this));
		this.addRibbonIcon("bar-chart-3", t("stats.ribbon"), () => void this.activateStatsView());
		this.addCommand({
			id: "open-share-stats",
			name: t("stats.command"),
			callback: () => void this.activateStatsView(),
		});

		// ── Status bar share button ──────────────────────────────────────
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("opal-status-bar-btn");
		setTooltip(this.statusBarEl, t("statusbar.shareNote"));
		setIcon(this.statusBarEl, "share-2");
		void this.updateStatusBar();

		this.statusBarEl.addEventListener("click", () => void this.sharePopover.toggle(this.statusBarEl));

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.sharePopover.close();
				void this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (changedFile) => {
				const active = this.app.workspace.getActiveFile();
				if (active && changedFile.path === active.path) {
					void this.updateStatusBar();
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.sharePopover.close())
		);

		// Reflect stale state on the status-bar icon while the note is edited.
		const debouncedStatusRefresh = debounce(() => void this.updateStatusBar(), 500, true);
		this.registerEvent(
			this.app.workspace.on("editor-change", () => debouncedStatusRefresh())
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ShareOnlineSettings>);
		setLanguage(this.settings.language);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Reveal the share-stats tab, reusing an open one or opening a new main-area tab. */
	async activateStatsView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_SHARE_STATS);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_SHARE_STATS, active: true });
		await workspace.revealLeaf(leaf);
	}

	// ── Frontmatter helpers ───────────────────────────────────────────────

	getShareLink(file: TFile): string {
		return (this.app.metadataCache.getFileCache(file)?.frontmatter?.["share_link"] as string | undefined) ?? "";
	}

	private async setShareMeta(file: TFile, url: string): Promise<void> {
		const raw = await this.app.vault.read(file);
		const hash = hashBody(stripFrontmatter(raw));
		const time = new Date().toISOString();
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["share_link"] = url;
			fm["share_time"] = time;
			fm["share_hash"] = hash;
		});
	}

	private async removeShareMeta(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			delete fm["share_link"];
			delete fm["share_time"];
			delete fm["share_hash"];
		});
	}

	// ── File type helper ──────────────────────────────────────────────────

	/** Only Markdown notes can be published / shared. */
	private isMarkdown(file: TFile | null): file is TFile {
		return !!file && file.extension === "md";
	}

	// ── Status bar ───────────────────────────────────────────────────────

	private async updateStatusBar(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		// Only Markdown notes can be shared — hide the icon for anything else
		if (!this.isMarkdown(file)) {
			this.statusBarEl.hide();
			return;
		}
		this.statusBarEl.show();
		const published = !!this.getShareLink(file);
		const stale = published ? await this.isStale(file) : false;
		// Active file may have changed during the async read — re-check before painting.
		if (this.app.workspace.getActiveFile()?.path !== file.path) return;
		this.statusBarEl.toggleClass("opal-status-published", published && !stale);
		this.statusBarEl.toggleClass("opal-status-stale", published && stale);
		setTooltip(
			this.statusBarEl,
			!published ? t("statusbar.shareNote") : stale ? t("statusbar.stale") : t("statusbar.published")
		);
	}

	/** True when the OSS credentials needed to publish are all present. */
	isOssReady(): boolean {
		return !!(
			this.settings.ossRegion &&
			this.settings.ossBucket &&
			this.settings.ossAccessKeyId &&
			this.settings.ossAccessKeySecret
		);
	}

	/** True when the note's current body differs from the published snapshot. */
	async isStale(file: TFile): Promise<boolean> {
		const shareHash =
			(this.app.metadataCache.getFileCache(file)?.frontmatter?.["share_hash"] as string | undefined) ?? "";
		if (!shareHash) return true;
		// Prefer the live editor so staleness updates while typing; fall back to disk.
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const raw =
			view?.file?.path === file.path && view.editor
				? view.editor.getValue()
				: await this.app.vault.cachedRead(file);
		return hashBody(stripFrontmatter(raw)) !== shareHash;
	}

	// ── Popover-driven actions ─────────────────────────────────────────────

	openShareLink(file: TFile): void {
		const url = this.getShareLink(file);
		if (url) activeWindow.open(url, "_blank");
	}

	publishFromUi(file: TFile): void {
		if (!this.isOssReady()) return;
		new ShareModal(this.app, this, file, "publish", (subNotes) => {
			void this.doPublish(file, subNotes);
		}).open();
	}

	unpublishFromUi(file: TFile): void {
		new ShareModal(this.app, this, file, "unpublish", (subNotes) => {
			void this.doUnpublish(file, subNotes);
		}).open();
	}

	async exportFromUi(file: TFile): Promise<void> {
		await this.exportFile(file);
	}

	// ── Actions ──────────────────────────────────────────────────────────

	private async doPublish(
		file: TFile,
		subNotes: { file: TFile; shareLink: string }[],
		existingName?: string,
		successText = t("toast.publishSuccess"),
		copyToClipboard = true
	): Promise<void> {
		// Progress + success are shown inside the share popover (anchored to the
		// status-bar icon) rather than as a separate toast.
		this.sharePopover.showBusy(this.statusBarEl, t("toast.uploading"));
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
					await this.setShareMeta(sn.file, subUrl);
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
			await this.setShareMeta(file, url);
			void this.updateStatusBar();
			if (copyToClipboard) {
				await navigator.clipboard.writeText(url);
			}
			await this.sharePopover.showResult(this.statusBarEl, file, successText, url);
		} catch (err: unknown) {
			this.sharePopover.showError(this.statusBarEl, t("toast.publishFailed", { error: (err as Error).message }));
			console.error(err);
		}
	}

	private async doUnpublish(
		file: TFile,
		subNotesToDelete: { file: TFile; shareLink: string }[]
	): Promise<void> {
		this.sharePopover.showBusy(this.statusBarEl, t("toast.stopping"));
		try {
			// Delete selected sub-notes first (errors are non-fatal — collected and
			// surfaced in the result banner rather than as a separate notice)
			const failedSubs: string[] = [];
			for (const sn of subNotesToDelete) {
				const snName = this.extractNoteName(sn.shareLink);
				try {
					await deleteFromOss(this.settings, snName);
					await this.removeShareMeta(sn.file);
				} catch (err: unknown) {
					console.error(`删除二级笔记失败 (${sn.file.basename}):`, err);
					failedSubs.push(sn.file.basename);
				}
			}

			// Delete main note (fatal on failure)
			const existingUrl = this.getShareLink(file);
			if (existingUrl) {
				const existingName = this.extractNoteName(existingUrl);
				await deleteFromOss(this.settings, existingName);
			}
			await this.removeShareMeta(file);
			void this.updateStatusBar();
			const successText =
				failedSubs.length > 0
					? t("toast.stoppedWithWarn", { names: failedSubs.join("、") })
					: t("toast.stopped");
			await this.sharePopover.showResult(this.statusBarEl, file, successText, null);
		} catch (err: unknown) {
			this.sharePopover.showError(this.statusBarEl, t("toast.stopFailed", { error: (err as Error).message }));
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

	async updateFromUi(file: TFile): Promise<void> {
		await this.updateNote(file);
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
		}
	}

	/**
	 * 打开 Electron 原生文件夹选择框（desktop-only），默认定位到上次导出目录。
	 * 取消返回 null。
	 */
	private async pickExportDir(): Promise<string | null> {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const electron = require("electron");
		const dialog = electron?.remote?.dialog ?? require("@electron/remote").dialog;
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
			defaultPath: this.settings.exportPath || DEFAULT_SETTINGS.exportPath,
		});
		if (result.canceled || !result.filePaths?.length) return null;
		return result.filePaths[0] as string;
	}

	private async exportFile(file: TFile): Promise<void> {
		const dir = await this.pickExportDir();
		if (!dir) return; // 用户取消
		this.settings.exportPath = dir;
		await this.saveSettings();

		this.sharePopover.showBusy(this.statusBarEl, t("toast.exporting"));
		try {
			await exportToLocal(
				this.app,
				this.app.vault,
				file,
				dir,
				this.settings.includeLinkedNotes,
				this.settings.pageLinkLength,
				getAnalyticsInjectConfig(this.settings)
			);
			// A local export changes no publish state — re-derive the card's current state.
			await this.sharePopover.showResult(this.statusBarEl, file, t("toast.exportSuccess"));
		} catch (err: unknown) {
			this.sharePopover.showError(this.statusBarEl, t("toast.exportFailed", { error: (err as Error).message }));
			console.error(err);
		}
	}

	onunload() {
		this.sharePopover?.close();
	}
}
