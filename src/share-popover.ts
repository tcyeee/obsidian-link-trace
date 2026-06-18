import { TFile, setIcon, setTooltip } from "obsidian";
import type ShareOnlinePlugin from "../main";
import { t } from "./i18n";
import { canReadAnalytics } from "./analytics";
import { fetchPageViews, fetchRecentActiveDays } from "./analytics-client";

const POPOVER_CLASS = "opal-share-popover";

/** Format a date as 24-hour local time, e.g. "2026-06-15 18:54:15". */
function formatDateTime(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

/**
 * A self-managed floating card anchored above the status-bar share icon.
 * Replaces the old in-note banner: it lives in document.body (like the export
 * toast), so CodeMirror / the preview renderer never touch it — no flicker, and
 * it can be styled freely as a card (which the native Menu cannot).
 */
export class SharePopover {
	private el: HTMLElement | null = null;
	private anchor: HTMLElement | null = null;
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
		this.anchor = null;
		if (!el) return;
		el.classList.remove("is-visible");
		window.setTimeout(() => el.remove(), 150);
	}

	private async open(anchor: HTMLElement): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return;

		const card = this.ensureCard(anchor);
		const shareLink = this.plugin.getShareLink(file);
		if (shareLink) {
			const stale = await this.plugin.isStale(file);
			this.renderPublished(card, file, shareLink, this.readPublishedAt(file), stale);
		} else {
			this.renderUnpublished(card, file);
		}
		this.position(card, anchor);
		this.registerDismiss(card, anchor);
	}

	// ── Publish lifecycle (success/progress merged into this card, no separate toast) ──

	/** Open (or re-render) the card in a busy state while a publish/update runs. */
	showBusy(anchor: HTMLElement, text: string): void {
		const card = this.ensureCard(anchor);
		card.addClass(`${POPOVER_CLASS}--progress`);
		const row = card.createDiv({ cls: "opal-share-popover-progress" });
		row.createDiv({ cls: "opal-share-popover-spinner" });
		row.createSpan({ text });
		this.position(card, anchor);
	}

	/**
	 * Re-render the busy card to reflect an operation's result, topped with a
	 * success banner. `state` pins the publish state when the operation just
	 * changed it (the metadata cache may lag a tick): a link string => freshly
	 * published at that link; `null` => just unpublished. Omit it to re-derive
	 * the current state from the cache (e.g. a local export changes nothing).
	 */
	async showResult(
		anchor: HTMLElement,
		file: TFile,
		successText: string,
		state?: string | null
	): Promise<void> {
		const card = this.ensureCard(anchor);
		const pinned = state !== undefined;
		const shareLink = pinned ? state : this.plugin.getShareLink(file);
		if (shareLink) {
			// A freshly published note is by definition up to date, with share_time = now.
			const stale = pinned ? false : await this.plugin.isStale(file);
			if (this.el !== card) return;
			const publishedAt = pinned ? new Date() : this.readPublishedAt(file);
			this.renderPublished(card, file, shareLink, publishedAt, stale, successText);
		} else {
			this.renderUnpublished(card, file, successText);
		}
		this.position(card, anchor);
		this.registerDismiss(card, anchor);
	}

	/** Re-render the busy card to show a publish failure. */
	showError(anchor: HTMLElement, text: string): void {
		const card = this.ensureCard(anchor);
		card.addClass(`${POPOVER_CLASS}--error`);
		const row = card.createDiv({ cls: "opal-share-popover-progress" });
		const icon = row.createDiv({ cls: "opal-share-popover-erroricon" });
		setIcon(icon, "alert-triangle");
		row.createSpan({ text });
		this.position(card, anchor);
		this.registerDismiss(card, anchor);
	}

	/** Return the existing card (cleared for re-render) or mount a fresh one. */
	private ensureCard(anchor: HTMLElement): HTMLElement {
		this.anchor = anchor;
		if (this.el) {
			this.el.empty();
			this.el.removeClass(
				`${POPOVER_CLASS}--fresh`,
				`${POPOVER_CLASS}--stale`,
				`${POPOVER_CLASS}--unpublished`,
				`${POPOVER_CLASS}--progress`,
				`${POPOVER_CLASS}--error`
			);
			return this.el;
		}
		const card = createDiv({ cls: POPOVER_CLASS });
		activeDocument.body.appendChild(card);
		this.el = card;
		window.requestAnimationFrame(() => card.classList.add("is-visible"));
		return card;
	}

	/** Wire up dismiss-on-outside-click / Escape. No-op if already registered. */
	private registerDismiss(card: HTMLElement, anchor: HTMLElement): void {
		if (this.onDocPointerDown) return;
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
			if (!this.el || !this.onDocPointerDown || !this.onKeyDown) return;
			activeDocument.addEventListener("pointerdown", this.onDocPointerDown, true);
			activeDocument.addEventListener("keydown", this.onKeyDown, true);
		}, 0);
	}

	private readPublishedAt(file: TFile): Date | null {
		const shareTime = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.["share_time"] as
			| string
			| undefined;
		if (!shareTime) return null;
		const d = new Date(shareTime);
		return isNaN(d.getTime()) ? null : d;
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

	private renderPublished(
		card: HTMLElement,
		file: TFile,
		shareLink: string,
		publishedAt: Date | null,
		stale: boolean,
		successText?: string
	): void {
		card.addClass(stale ? `${POPOVER_CLASS}--stale` : `${POPOVER_CLASS}--fresh`);

		// Success banner: shown right after a publish/update completes in this card.
		if (successText) {
			const banner = card.createDiv({ cls: "opal-share-popover-success" });
			const check = banner.createDiv({ cls: "opal-share-popover-successicon" });
			setIcon(check, "check");
			banner.createSpan({ text: successText });
		}

		// Header: icon avatar + title/time + status badge
		const header = card.createDiv({ cls: "opal-share-popover-header" });
		const icon = header.createDiv({ cls: "opal-share-popover-icon" });
		setIcon(icon, "globe");
		const headText = header.createDiv({ cls: "opal-share-popover-headtext" });
		headText.createDiv({ cls: "opal-share-popover-title", text: t("popover.title") });
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
		let copiedTimer = 0;
		copyBtn.addEventListener("click", (e) => {
			e.preventDefault();
			void navigator.clipboard.writeText(shareLink).then(() => {
				// In-panel feedback: swap to a check icon and tint green, then revert.
				copyBtn.addClass("is-copied");
				setIcon(copyBtn, "check");
				setTooltip(copyBtn, t("popover.copied"));
				window.clearTimeout(copiedTimer);
				copiedTimer = window.setTimeout(() => {
					if (!copyBtn.isConnected) return;
					copyBtn.removeClass("is-copied");
					setIcon(copyBtn, "copy");
					setTooltip(copyBtn, t("popover.copy"));
				}, 1500);
			});
		});

		// Published time below the link, in 24-hour format (e.g. 2026-06-15 18:54:15)
		if (publishedAt && !isNaN(publishedAt.getTime())) {
			card.createDiv({
				cls: "opal-share-popover-published",
				text: t("popover.published", { time: formatDateTime(publishedAt) }),
			});
		}

		// Analytics: a view-count block (only when analytics is configured) plus a
		// structural "View details" entry to the global stats page (always shown).
		this.renderAnalytics(card, shareLink);

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

	private renderUnpublished(card: HTMLElement, file: TFile, successText?: string): void {
		card.addClass(`${POPOVER_CLASS}--unpublished`);

		if (successText) {
			const banner = card.createDiv({ cls: "opal-share-popover-success" });
			const check = banner.createDiv({ cls: "opal-share-popover-successicon" });
			setIcon(check, "check");
			banner.createSpan({ text: successText });
		}

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

	/**
	 * Render the published-state analytics: a view-count block (only when analytics
	 * is configured) followed by a "View details" entry to the global stats page.
	 * The entry is structural navigation — it always renders, independent of the
	 * fetch or whether analytics is configured.
	 */
	private renderAnalytics(card: HTMLElement, shareLink: string): void {
		if (canReadAnalytics(this.plugin.settings)) {
			const block = card.createDiv({ cls: "opal-share-popover-stats" });

			// Views row: label + number + refresh button.
			const viewsRow = block.createDiv({ cls: "opal-share-popover-statsviews" });
			viewsRow.createSpan({ cls: "opal-share-popover-statslabel", text: t("popover.stats.views") });
			const num = viewsRow.createSpan({ cls: "opal-share-popover-statsnum" });
			const refresh = viewsRow.createDiv({ cls: "opal-share-popover-statsrefresh" });
			setIcon(refresh, "refresh-cw");
			setTooltip(refresh, t("popover.stats.refresh"));

			// Recent active days appear below the views row once fetched.
			const recent = block.createDiv({ cls: "opal-share-popover-statsrecent" });

			const load = () => {
				num.setText("…");
				num.removeClass("is-error");
				recent.empty();
				void this.loadAnalytics(card, shareLink, num, recent);
			};
			refresh.addEventListener("click", (e) => {
				e.preventDefault();
				load();
			});
			load();
		}

		// "View details" → open the global stats page. Always present when published.
		const entry = card.createDiv({ cls: "opal-share-popover-statsentry" });
		const link = entry.createSpan({
			cls: "opal-share-popover-detaillink",
			text: `${t("popover.stats.detail")} →`,
		});
		link.addEventListener("click", () => {
			this.close();
			void this.plugin.activateStatsView();
		});
	}

	/**
	 * Fetch this page's cumulative views + recent active days and fill the block.
	 * Serial (not parallel) to avoid GoatCounter's burst rate-limit. Each write is
	 * guarded against a stale/closed card (same guard `showResult` uses).
	 */
	private async loadAnalytics(
		card: HTMLElement,
		shareLink: string,
		num: HTMLElement,
		recent: HTMLElement
	): Promise<void> {
		const settings = this.plugin.settings;

		const stats = await fetchPageViews(settings, shareLink);
		if (this.el !== card || !card.isConnected) return;
		if (stats === null) {
			num.setText("—");
			num.addClass("is-error");
		} else {
			num.setText(stats.views.toLocaleString());
		}

		const days = await fetchRecentActiveDays(settings, shareLink, { days: 90, limit: 3 });
		if (this.el !== card || !card.isConnected) return;
		recent.empty();
		if (!days || days.length === 0) return;
		for (const d of days) {
			const row = recent.createDiv({ cls: "opal-share-popover-statsday" });
			row.createSpan({ cls: "opal-share-popover-statsdaydate", text: d.day.slice(5) });
			row.createSpan({ cls: "opal-share-popover-statsdaycount", text: `· ${d.count}` });
		}
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
