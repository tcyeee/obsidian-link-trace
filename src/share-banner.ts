import { MarkdownView, Notice, TFile, setIcon, setTooltip } from "obsidian";
import type ShareOnlinePlugin from "../main";
import { t } from "./i18n";
import { hashBody, stripFrontmatter } from "./note-hash";

const BANNER_CLASS = "opal-share-banner";

/**
 * Injects a runtime banner at the top of a shared note's MarkdownView (reading and
 * editing). The banner lives only in the view DOM — it is never written to the file
 * and therefore never exported. Call refresh() on every relevant view/content change.
 */
export class ShareBanner {
	private token = 0;

	constructor(private plugin: ShareOnlinePlugin) {}

	/** Remove every banner this plugin has mounted, anywhere in the workspace. */
	remove(): void {
		this.plugin.app.workspace.containerEl
			.querySelectorAll(`.${BANNER_CLASS}`)
			.forEach((el) => el.remove());
	}

	/** Rebuild the banner for the active MarkdownView, or remove it if not applicable. */
	async refresh(): Promise<void> {
		const token = ++this.token;
		this.remove();
		const { app, settings } = this.plugin;
		if (!settings.shareBannerEnabled) return;

		const view = app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (!view || !file) return;

		const shareLink = this.plugin.getShareLink(file);
		if (!shareLink) return;

		const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const shareTime = (fm["share_time"] as string | undefined) ?? "";
		const shareHash = (fm["share_hash"] as string | undefined) ?? "";

		// Prefer live editor content so the stale state updates while typing;
		// fall back to disk in reading mode where there is no editor.
		const raw = view.editor ? view.editor.getValue() : await app.vault.cachedRead(file);
		if (token !== this.token) return;
		const currentHash = hashBody(stripFrontmatter(raw));
		const stale = !shareHash || currentHash !== shareHash;

		this.render(view, file, shareLink, shareTime, stale);
	}

	private render(
		view: MarkdownView,
		file: TFile,
		shareLink: string,
		shareTime: string,
		stale: boolean
	): void {
		const banner = createDiv({ cls: BANNER_CLASS });
		if (stale) banner.addClass(`${BANNER_CLASS}--stale`);

		// URL row
		const urlRow = banner.createDiv({ cls: "opal-share-banner-row" });
		urlRow.createSpan({ cls: "opal-share-banner-label", text: t("banner.url.label") });
		const link = urlRow.createEl("a", {
			cls: "opal-share-banner-url",
			text: shareLink,
			href: shareLink,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");
		const copyBtn = urlRow.createDiv({ cls: "opal-share-banner-copy" });
		setIcon(copyBtn, "copy");
		setTooltip(copyBtn, t("banner.copy"));
		copyBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			await navigator.clipboard.writeText(shareLink);
			new Notice(t("banner.copied"));
		});

		// Time row
		const publishedAt = shareTime ? new Date(shareTime) : null;
		if (publishedAt && !isNaN(publishedAt.getTime())) {
			const timeRow = banner.createDiv({ cls: "opal-share-banner-row" });
			timeRow.createSpan({ cls: "opal-share-banner-label", text: t("banner.time.label") });
			timeRow.createSpan({
				cls: "opal-share-banner-time",
				text: publishedAt.toLocaleString(),
			});
		}

		// Status row
		const statusRow = banner.createDiv({ cls: "opal-share-banner-row" });
		statusRow.createSpan({
			cls: "opal-share-banner-status",
			text: stale ? t("banner.status.stale") : t("banner.status.fresh"),
		});
		if (stale) {
			const updateBtn = statusRow.createEl("button", {
				cls: "opal-share-banner-update",
				text: t("banner.btn.update"),
			});
			updateBtn.addEventListener("click", () => {
				void this.plugin.updateNoteFromBanner(file);
			});
		}

		view.contentEl.prepend(banner);
	}
}
