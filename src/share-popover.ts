import { Notice, TFile, setIcon, setTooltip } from "obsidian";
import type ShareOnlinePlugin from "../main";
import { t } from "./i18n";

const POPOVER_CLASS = "opal-share-popover";

/**
 * A self-managed floating card anchored above the status-bar share icon.
 * Replaces the old in-note banner: it lives in document.body (like the export
 * toast), so CodeMirror / the preview renderer never touch it — no flicker, and
 * it can be styled freely as a card (which the native Menu cannot).
 */
export class SharePopover {
	private el: HTMLElement | null = null;
	private onDocPointerDown?: (e: MouseEvent) => void;
	private onKeyDown?: (e: KeyboardEvent) => void;

	constructor(private plugin: ShareOnlinePlugin) {}

	isOpen(): boolean {
		return !!this.el;
	}

	/** Toggle the card relative to the given anchor (the status-bar icon). */
	async toggle(anchor: HTMLElement): Promise<void> {
		if (this.el) {
			this.close();
			return;
		}
		await this.open(anchor);
	}

	close(): void {
		if (this.onDocPointerDown) {
			activeDocument.removeEventListener("pointerdown", this.onDocPointerDown, true);
		}
		if (this.onKeyDown) {
			activeDocument.removeEventListener("keydown", this.onKeyDown, true);
		}
		this.onDocPointerDown = undefined;
		this.onKeyDown = undefined;
		const el = this.el;
		this.el = null;
		if (!el) return;
		el.classList.remove("is-visible");
		window.setTimeout(() => el.remove(), 150);
	}

	private async open(anchor: HTMLElement): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return;

		const card = createDiv({ cls: POPOVER_CLASS });
		const shareLink = this.plugin.getShareLink(file);
		if (shareLink) {
			const stale = await this.plugin.isStale(file);
			this.renderPublished(card, file, shareLink, stale);
		} else {
			this.renderUnpublished(card, file);
		}

		activeDocument.body.appendChild(card);
		this.el = card;
		this.position(card, anchor);
		window.requestAnimationFrame(() => card.classList.add("is-visible"));

		this.onDocPointerDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (card.contains(target) || anchor.contains(target)) return;
			this.close();
		};
		this.onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.close();
		};
		// Defer registration so the click that opened the card doesn't dismiss it.
		window.setTimeout(() => {
			if (!this.el) return;
			activeDocument.addEventListener("pointerdown", this.onDocPointerDown!, true);
			activeDocument.addEventListener("keydown", this.onKeyDown!, true);
		}, 0);
	}

	/**
	 * Anchor the card next to the status-bar icon, flipping above/below based on
	 * available space and clamping into the viewport. The status bar's position
	 * varies by theme, so we never assume it sits at the bottom.
	 */
	private position(card: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const gap = 8;
		const margin = 8;
		const vw = activeWindow.innerWidth;
		const vh = activeWindow.innerHeight;
		const cw = card.offsetWidth;
		const ch = card.offsetHeight;

		// Horizontal: align the card's left edge to the icon, clamp into view.
		let left = rect.left;
		if (left + cw + margin > vw) left = vw - cw - margin;
		if (left < margin) left = margin;

		// Vertical: prefer above the icon; flip below when there isn't room.
		const spaceAbove = rect.top;
		const spaceBelow = vh - rect.bottom;
		let top =
			spaceAbove >= ch + gap || spaceAbove >= spaceBelow
				? rect.top - gap - ch
				: rect.bottom + gap;
		if (top + ch + margin > vh) top = vh - ch - margin;
		if (top < margin) top = margin;

		card.setCssProps({
			"--opal-popover-left": `${Math.round(left)}px`,
			"--opal-popover-top": `${Math.round(top)}px`,
		});
	}

	private renderPublished(card: HTMLElement, file: TFile, shareLink: string, stale: boolean): void {
		card.addClass(stale ? `${POPOVER_CLASS}--stale` : `${POPOVER_CLASS}--fresh`);

		// Header: icon avatar + title/time + status badge
		const header = card.createDiv({ cls: "opal-share-popover-header" });
		const icon = header.createDiv({ cls: "opal-share-popover-icon" });
		setIcon(icon, "globe");
		const headText = header.createDiv({ cls: "opal-share-popover-headtext" });
		headText.createDiv({ cls: "opal-share-popover-title", text: t("popover.title") });
		const shareTime =
			(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.["share_time"] as
				| string
				| undefined) ?? "";
		const publishedAt = shareTime ? new Date(shareTime) : null;
		if (publishedAt && !isNaN(publishedAt.getTime())) {
			headText.createDiv({
				cls: "opal-share-popover-subline",
				text: t("popover.published", { time: publishedAt.toLocaleString() }),
			});
		}
		header.createSpan({
			cls: "opal-share-popover-badge",
			text: stale ? t("popover.badge.stale") : t("popover.badge.fresh"),
		});

		// URL row: framed link + copy
		const urlRow = card.createDiv({ cls: "opal-share-popover-urlrow" });
		const link = urlRow.createEl("a", {
			cls: "opal-share-popover-url",
			text: shareLink,
			href: shareLink,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");
		const copyBtn = urlRow.createDiv({ cls: "opal-share-popover-copy" });
		setIcon(copyBtn, "copy");
		setTooltip(copyBtn, t("popover.copy"));
		copyBtn.addEventListener("click", (e) => {
			e.preventDefault();
			void navigator.clipboard.writeText(shareLink).then(() => new Notice(t("popover.copied")));
		});

		// Stale hint + emphasized re-publish
		if (stale) {
			const hint = card.createDiv({ cls: "opal-share-popover-hint" });
			hint.createSpan({ text: t("popover.hint.stale") });
			const updateBtn = hint.createEl("button", {
				cls: "opal-share-popover-republish mod-cta",
				text: t("popover.btn.update"),
			});
			updateBtn.addEventListener("click", () => {
				this.close();
				void this.plugin.updateFromUi(file);
			});
		}

		// Action row: compact icon buttons (re-publish lives in the hint when stale)
		const actions = card.createDiv({ cls: "opal-share-popover-actions" });
		this.iconAction(actions, "external-link", t("menu.openLink"), () => {
			this.close();
			this.plugin.openShareLink(file);
		});
		if (!stale) {
			this.iconAction(actions, "refresh-cw", t("menu.update"), () => {
				this.close();
				void this.plugin.updateFromUi(file);
			});
		}
		this.iconAction(actions, "download", t("menu.exportLocal"), () => {
			this.close();
			void this.plugin.exportFromUi(file);
		});
		this.iconAction(
			actions,
			"eye-off",
			t("menu.unpublish"),
			() => {
				this.close();
				this.plugin.unpublishFromUi(file);
			},
			true
		);
	}

	private renderUnpublished(card: HTMLElement, file: TFile): void {
		card.addClass(`${POPOVER_CLASS}--unpublished`);

		const header = card.createDiv({ cls: "opal-share-popover-header" });
		const icon = header.createDiv({ cls: "opal-share-popover-icon" });
		setIcon(icon, "globe");
		const headText = header.createDiv({ cls: "opal-share-popover-headtext" });
		headText.createDiv({ cls: "opal-share-popover-title", text: t("popover.unpublished.title") });
		headText.createDiv({
			cls: "opal-share-popover-subline",
			text: t("popover.unpublished.subline"),
		});

		const actions = card.createDiv({
			cls: "opal-share-popover-actions opal-share-popover-actions--text",
		});
		const ossReady = this.plugin.isOssReady();
		const publishBtn = actions.createEl("button", {
			cls: "opal-share-popover-textbtn mod-cta",
			text: t("menu.publish"),
		});
		publishBtn.disabled = !ossReady;
		publishBtn.addEventListener("click", () => {
			if (!ossReady) return;
			this.close();
			this.plugin.publishFromUi(file);
		});
		const exportBtn = actions.createEl("button", {
			cls: "opal-share-popover-textbtn",
			text: t("menu.exportLocal"),
		});
		exportBtn.addEventListener("click", () => {
			this.close();
			void this.plugin.exportFromUi(file);
		});
	}

	private iconAction(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void,
		danger = false
	): void {
		const btn = parent.createDiv({ cls: "opal-share-popover-action" });
		if (danger) btn.addClass("opal-share-popover-action--danger");
		setIcon(btn, icon);
		setTooltip(btn, tooltip);
		btn.addEventListener("click", onClick);
	}
}
