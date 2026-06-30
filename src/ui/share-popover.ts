import { Notice, TFile, setIcon, setTooltip } from "obsidian";
import type ShareOnlinePlugin from "../../main";
import { t } from "../core/i18n";
import { canReadAnalytics, type DailyPoint, type DimensionItem } from "../analytics/analytics";
import {
	fetchPageViews,
	fetchDailyTrend,
	fetchPopoverDimensions,
	type PopoverDimensionKey,
} from "../analytics/analytics-client";
import { sizeLabel } from "../analytics/stats-detail-modal";
import {
	collectSubNoteTree,
	flattenSubTree,
	makeUniquePrefixStripper,
	MAX_SUB_PAGES,
	type SubNoteNode,
} from "../publish/exporter";

/** A linked note plus its current share link (empty when not yet published). */
type SubNoteStatus = { file: TFile; shareLink: string };

/** Which lifecycle action the inline confirm panel is gathering a confirmation for. */
type ConfirmMode = "publish" | "unpublish";

const POPOVER_CLASS = "opal-share-popover";

/** 分享气泡趋势小图的回看天数。 */
const POPOVER_TREND_DAYS = 14;

/**
 * 单个分享页统计数据的会话内缓存项（按 shareLink 区分）。命中后立即渲染、
 * 不闪烁，再后台刷新顶替。维度存原始 items（sizes 标签在渲染时再推导）。
 */
interface PopoverStatsCacheEntry {
	views?: number;
	trend?: DailyPoint[];
	dimensions?: Record<PopoverDimensionKey, DimensionItem[]>;
}

/**
 * The banner pinned at the very top of the card: either a publish/update result
 * ("更新成功") or live progress while an operation runs. Both occupy the same slot
 * above the published/unpublished details, so progress and success line up.
 */
type TopBanner =
	| { kind: "success"; text: string }
	| { kind: "progress"; label: string; pct: number | null };

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
	/** 统计数据的会话内缓存（按 shareLink 区分），让气泡重开时立即展示旧数据。 */
	private statsCache = new Map<string, PopoverStatsCacheEntry>();
	/** 进度态的可复用节点引用，用于多次上报时就地更新（不重建、条形可过渡）。 */
	private progressLabel: HTMLElement | null = null;
	private progressFill: HTMLElement | null = null;
	/**
	 * 假进度引擎：点击触发忙碌态的那一刻起，进度条就开始向 ~90% 缓动爬升的
	 * 计时器（`fakeTimer`/`fakePct`），给单页发布也带来即时的“正在进行”反馈；
	 * 真实步骤上报的 `realPct` 只作为下限，能把条形推得比假动画更高，完成时再
	 * 一口气填到 100%。展示值始终取两者较大者。
	 */
	private fakeTimer = 0;
	private fakePct = 0;
	private realPct = 0;

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
		this.resetProgress();
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
		await this.renderState(card, file);
	}

	/** Render the card's normal published/unpublished state and wire up dismissal. */
	private async renderState(card: HTMLElement, file: TFile): Promise<void> {
		const shareLink = this.plugin.getShareLink(file);
		if (shareLink) {
			const stale = await this.plugin.isStale(file);
			if (this.el !== card) return;
			this.renderPublished(card, file, shareLink, this.readPublishedAt(file), stale);
		} else {
			this.renderUnpublished(card, file);
		}
		this.position(card, this.anchor ?? card);
		this.registerDismiss(card, this.anchor ?? card);
	}

	// ── Publish lifecycle (success/progress merged into this card, no separate toast) ──

	/** Open (or re-render) the card in a busy state while a publish/update runs. */
	showBusy(anchor: HTMLElement, text: string): void {
		this.showProgress(anchor, text);
	}

	/**
	 * Show busy state in the card, with a progress bar that animates from the moment
	 * the operation begins.
	 *
	 * The progress is drawn as a banner pinned at the top of the card (the same
	 * slot the "更新成功" success banner lands in), while the card's normal
	 * published/unpublished details stay visible below it (action buttons are
	 * disabled via the `--busy` class). The bar always shows: a fake ramp creeps it
	 * toward ~90% on a timer so even a single-page publish gets immediate motion,
	 * and any real `done/total` reported here raises a floor that can push the bar
	 * past the fake ramp (see {@link startFakeRamp}).
	 *
	 * Called repeatedly during a publish: if a progress banner from a previous
	 * step is already mounted it updates in place (no flicker, the bar keeps
	 * animating), instead of tearing down and rebuilding the card on every step.
	 */
	showProgress(anchor: HTMLElement, label: string, done?: number, total?: number): void {
		if (typeof done === "number" && typeof total === "number" && total > 0) {
			this.realPct = Math.round(Math.max(0, Math.min(1, done / total)) * 100);
		}

		// In-place update when a progress banner from a previous step is still mounted.
		if (this.el?.hasClass(`${POPOVER_CLASS}--busy`) && this.progressLabel?.isConnected) {
			this.progressLabel.setText(label);
			this.applyProgress();
			this.position(this.el, anchor);
			return;
		}

		// First step: reset the ramp, render the card in its current publish state with
		// the progress banner on top, then start the fake ramp climbing. While busy we
		// render the published card as fresh (no stale badge/hint) — the operation in
		// flight is bringing it up to date anyway.
		this.fakePct = 8;
		this.realPct = typeof done === "number" && typeof total === "number" && total > 0 ? this.realPct : 0;
		const file = this.plugin.app.workspace.getActiveFile();
		const card = this.ensureCard(anchor);
		card.addClass(`${POPOVER_CLASS}--busy`);
		const banner: TopBanner = { kind: "progress", label, pct: this.displayPct() };
		const shareLink = file ? this.plugin.getShareLink(file) : "";
		if (file && shareLink) {
			this.renderPublished(card, file, shareLink, this.readPublishedAt(file), false, banner);
		} else if (file) {
			this.renderUnpublished(card, file, banner);
		} else {
			this.renderTopBanner(card, banner);
		}
		this.startFakeRamp();
		this.position(card, anchor);
	}

	/** The bar's displayed percentage: the higher of the fake ramp and the real floor. */
	private displayPct(): number {
		return Math.round(Math.max(this.fakePct, this.realPct));
	}

	/** Push the current displayed percentage into the (live) fill node, if mounted. */
	private applyProgress(): void {
		if (this.progressFill?.isConnected) {
			this.progressFill.setCssProps({ "--opal-progress": `${this.displayPct()}%` });
		}
	}

	/**
	 * Start the fake-progress timer: every tick the bar eases a fraction of the way
	 * toward a ~90% cap (decelerating as it approaches), so it climbs fast at first
	 * then lingers just short of full until the operation actually completes. The
	 * CSS width transition smooths each step. No-op if already running.
	 */
	private startFakeRamp(): void {
		if (this.fakeTimer) return;
		const cap = 90;
		this.fakeTimer = window.setInterval(() => {
			this.fakePct += (cap - this.fakePct) * 0.06;
			this.applyProgress();
		}, 150);
	}

	/** Stop the ramp timer and zero the progress state (no visual completion). */
	private resetProgress(): void {
		if (this.fakeTimer) {
			window.clearInterval(this.fakeTimer);
			this.fakeTimer = 0;
		}
		this.fakePct = 0;
		this.realPct = 0;
	}

	/**
	 * Finish the bar before the result is shown: stop the ramp, snap the fill to
	 * 100% and let the CSS transition play out briefly so the user sees it complete,
	 * then reset the state. Awaited by {@link showResult} before it rebuilds the card.
	 */
	private async finishProgress(): Promise<void> {
		if (this.fakeTimer) {
			window.clearInterval(this.fakeTimer);
			this.fakeTimer = 0;
		}
		if (this.progressFill?.isConnected) {
			this.progressFill.setCssProps({ "--opal-progress": "100%" });
			await new Promise((resolve) => window.setTimeout(resolve, 220));
		}
		this.fakePct = 0;
		this.realPct = 0;
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
		// Fill the bar to 100% and let it settle before swapping in the result card.
		await this.finishProgress();
		const card = this.ensureCard(anchor);
		const banner: TopBanner = { kind: "success", text: successText };
		const pinned = state !== undefined;
		const shareLink = pinned ? state : this.plugin.getShareLink(file);
		if (shareLink) {
			// A freshly published note is by definition up to date, with share_time = now.
			const stale = pinned ? false : await this.plugin.isStale(file);
			if (this.el !== card) return;
			const publishedAt = pinned ? new Date() : this.readPublishedAt(file);
			this.renderPublished(card, file, shareLink, publishedAt, stale, banner);
		} else {
			this.renderUnpublished(card, file, banner);
		}
		this.position(card, anchor);
		this.registerDismiss(card, anchor);
	}

	/** Re-render the busy card to show a publish failure. */
	showError(anchor: HTMLElement, text: string): void {
		this.resetProgress();
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
				`${POPOVER_CLASS}--busy`,
				`${POPOVER_CLASS}--confirm`,
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

	/**
	 * Render the banner pinned at the top of the card. A success banner is the
	 * green "更新成功" line; a progress banner is a spinner + stage label (plus a
	 * determinate bar when `pct` is set), whose label/bar nodes are stashed so
	 * later `showProgress` steps can update them in place without a rebuild.
	 */
	private renderTopBanner(card: HTMLElement, banner: TopBanner): void {
		if (banner.kind === "success") {
			this.progressLabel = null;
			this.progressFill = null;
			const el = card.createDiv({ cls: "opal-share-popover-success" });
			const check = el.createDiv({ cls: "opal-share-popover-successicon" });
			setIcon(check, "check");
			el.createSpan({ text: banner.text });
			return;
		}
		const el = card.createDiv({ cls: "opal-share-popover-busybanner" });
		const row = el.createDiv({ cls: "opal-share-popover-busyrow" });
		row.createDiv({ cls: "opal-share-popover-spinner" });
		this.progressLabel = row.createSpan({ cls: "opal-share-popover-busylabel", text: banner.label });
		// The bar always renders now (the fake ramp animates it even with no real
		// step count), so a single-page publish still shows motion from the click.
		const bar = el.createDiv({ cls: "opal-share-popover-progressbar" });
		this.progressFill = bar.createDiv({ cls: "opal-share-popover-progressfill" });
		this.progressFill.setCssProps({ "--opal-progress": `${banner.pct ?? 0}%` });
	}

	private renderPublished(
		card: HTMLElement,
		file: TFile,
		shareLink: string,
		publishedAt: Date | null,
		stale: boolean,
		banner?: TopBanner
	): void {
		card.addClass(stale ? `${POPOVER_CLASS}--stale` : `${POPOVER_CLASS}--fresh`);

		// Top banner: live progress while busy, or the success line after completion.
		if (banner) this.renderTopBanner(card, banner);

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

		// Analytics: view count + a 14-day trend, plus an expandable per-dimension
		// breakdown. Only rendered when analytics is configured.
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

		// Action row: compact icon buttons (re-publish lives in the hint when stale).
		// Primary actions sit on the left; a stats-page shortcut sits on the right.
		const actions = card.createDiv({ cls: "opal-share-popover-actions" });
		const left = actions.createDiv({ cls: "opal-share-popover-actions-left" });
		this.iconAction(left, "external-link", t("menu.openLink"), () => {
			this.close();
			this.plugin.openShareLink(file);
		});
		if (!stale) {
			this.iconAction(left, "refresh-cw", t("menu.update"), () => {
				this.close();
				void this.plugin.updateFromUi(file);
			});
		}
		this.iconAction(left, "download", t("menu.exportLocal"), () => {
			this.close();
			void this.plugin.exportFromUi(file);
		});
		this.iconAction(
			left,
			"trash-2",
			t("menu.unpublish"),
			() => this.showConfirm(file, "unpublish"),
			true
		);

		const right = actions.createDiv({ cls: "opal-share-popover-actions-right" });
		this.iconAction(right, "bar-chart-3", t("stats.title"), () => {
			this.close();
			void this.plugin.activateStatsView();
		});
	}

	private renderUnpublished(card: HTMLElement, file: TFile, banner?: TopBanner): void {
		card.addClass(`${POPOVER_CLASS}--unpublished`);

		if (banner) this.renderTopBanner(card, banner);

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
		const publishBtn = actions.createEl("button", {
			cls: "opal-share-popover-textbtn mod-cta",
			text: t("menu.publish"),
		});
		publishBtn.addEventListener("click", () => this.openPublishConfirm(this.anchor));
		const exportBtn = actions.createEl("button", {
			cls: "opal-share-popover-textbtn",
			text: t("menu.exportLocal"),
		});
		exportBtn.addEventListener("click", () => {
			this.close();
			void this.plugin.exportFromUi(file);
		});
	}

	// ── Inline publish/unpublish confirmation (replaces the old ShareModal) ──

	/**
	 * Open the popover at `anchor` and jump straight to the publish-confirm panel,
	 * running the same route checks as the in-popover Publish button. Shared by that
	 * button and the "export to OSS" command so both take one publish path (with the
	 * sub-page hierarchy, checkboxes and the 50-page cap).
	 */
	openPublishConfirm(anchor: HTMLElement): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice(t("notice.onlyMarkdown.publish"));
			return;
		}
		if (this.plugin.settings.storageProvider === "none") {
			new Notice(t("notice.noRoute"));
			return;
		}
		if (!this.plugin.isPublishReady()) {
			new Notice(t("notice.routeNotConfigured"));
			return;
		}
		this.ensureCard(anchor); // sets this.anchor so showConfirm can position the panel
		this.showConfirm(file, "publish");
	}

	/** Swap the card to the inline confirm panel for a publish/unpublish action. */
	private showConfirm(file: TFile, mode: ConfirmMode): void {
		const anchor = this.anchor;
		if (!anchor) return;
		const card = this.ensureCard(anchor);
		void this.renderConfirm(card, file, mode).then(() => {
			this.position(card, anchor);
			this.registerDismiss(card, anchor);
		});
	}

	/**
	 * Render the inline confirm panel, mirroring the normal card's layout: an
	 * icon-avatar header, the body (main note + linked sub-notes), then the same
	 * full-width Cancel / Confirm button row used elsewhere. Publish lists sub-notes
	 * read-only (each tagged "will upload" / "already linked", with view counts);
	 * unpublish gives each already-published sub-note a checkbox (default on) and
	 * shows no view counts. Cancel restores the normal card; Confirm hands the
	 * selection to the plugin, whose progress + result render back into this card.
	 */
	private async renderConfirm(card: HTMLElement, file: TFile, mode: ConfirmMode): Promise<void> {
		card.addClass(`${POPOVER_CLASS}--confirm`);
		const isPublish = mode === "publish";
		const level = this.plugin.settings.exportLevel;
		const { nodes, truncated } =
			level > 1
				? await collectSubNoteTree(this.plugin.app, file, level - 1)
				: { nodes: [] as SubNoteNode[], truncated: false };
		const flat = flattenSubTree(nodes);
		// Strip the unique-note timestamp prefix from displayed names, matching
		// the exported pages (no-op unless the compatibility toggle is on).
		const displayName = await makeUniquePrefixStripper(
			this.plugin.app,
			this.plugin.settings.stripUniquePrefix
		);

		// checkStates governs which sub-pages are published/stopped; checkboxes lets a
		// parent toggle cascade onto its descendants; descendantsOf maps each node to
		// the paths below it for that cascade.
		const checkStates = new Map<string, boolean>();
		const checkboxes = new Map<string, HTMLInputElement>();
		const descendantsOf = new Map<string, string[]>();
		const computeDesc = (node: SubNoteNode): string[] => {
			const all: string[] = [];
			for (const c of node.children) all.push(c.file.path, ...computeDesc(c));
			descendantsOf.set(node.file.path, all);
			return all;
		};
		nodes.forEach(computeDesc);

		// Header: icon avatar + title, matching the published/unpublished views.
		const header = card.createDiv({ cls: "opal-share-popover-header" });
		const icon = header.createDiv({ cls: "opal-share-popover-icon" });
		if (!isPublish) icon.addClass("opal-share-popover-icon--danger");
		setIcon(icon, isPublish ? "globe" : "trash-2");
		const headText = header.createDiv({ cls: "opal-share-popover-headtext" });
		headText.createDiv({
			cls: "opal-share-popover-title",
			text: isPublish ? t("modal.publish.title") : t("modal.unpublish.title"),
		});

		const body = card.createDiv({ cls: "opal-share-popover-confirm-body" });

		// Main note.
		body.createDiv({
			cls: "opal-share-popover-confirm-label",
			text: isPublish ? t("modal.mainNote") : t("modal.mainNote.stopping"),
		});
		const mainRow = body.createDiv({ cls: "opal-share-popover-confirm-item" });
		setIcon(mainRow.createDiv({ cls: "opal-share-popover-confirm-icon" }), "file-text");
		this.createConfirmName(mainRow, displayName(file.basename) + ".md");
		if (isPublish) this.showConfirmViews(mainRow, this.plugin.getShareLink(file));

		// Gate updater is wired after the confirm button exists below.
		let updateGate = (): void => {};

		// Linked sub-pages, shown as an indented hierarchy with per-page checkboxes.
		if (flat.length > 0) {
			body.createDiv({
				cls: "opal-share-popover-confirm-label",
				text: isPublish
					? t("modal.subNotes.publish", { count: String(flat.length) })
					: t("modal.subNotes.unpublish"),
			});
			if (truncated) {
				body.createDiv({
					cls: "opal-share-popover-confirm-truncated",
					text: t("modal.subNotes.truncated", { max: String(flat.length) }),
				});
			}
			for (const node of flat) {
				const row = body.createDiv({ cls: "opal-share-popover-confirm-item" });
				row.setCssProps({ "--depth": String(node.depth - 1) });
				// Publish: every sub-page is selectable. Unpublish: only already-published ones.
				const canCheck = isPublish || !!node.shareLink;
				if (canCheck) {
					checkStates.set(node.file.path, true);
					const cb = row.createEl("input", { cls: "opal-share-popover-confirm-check" });
					cb.type = "checkbox";
					cb.checked = true;
					checkboxes.set(node.file.path, cb);
					cb.addEventListener("change", () => {
						checkStates.set(node.file.path, cb.checked);
						// A page is only reachable through its parent — cascade the toggle down.
						for (const p of descendantsOf.get(node.file.path) ?? []) {
							const dcb = checkboxes.get(p);
							if (dcb) {
								dcb.checked = cb.checked;
								dcb.disabled = !cb.checked;
								checkStates.set(p, cb.checked);
							}
						}
						updateGate();
					});
				} else {
					row.createDiv({ cls: "opal-share-popover-confirm-check-placeholder" });
				}
				setIcon(row.createDiv({ cls: "opal-share-popover-confirm-icon" }), "file-text");
				this.createConfirmName(row, displayName(node.file.basename) + ".md");
				if (isPublish) {
					row.createSpan({
						cls: "opal-share-popover-confirm-badge",
						text: node.shareLink ? t("modal.badge.hasLink") : t("modal.badge.willUpload"),
					});
				}
				if (isPublish && node.shareLink) this.showConfirmViews(row, node.shareLink);
				if (isPublish && !node.shareLink) row.addClass("is-skip");
			}
		}

		// Over-limit warning (publish only): too many sub-pages selected to publish.
		const warn = card.createDiv({ cls: "opal-share-popover-confirm-warn" });

		// Cancel / confirm — same full-width button row as the unpublished view.
		const actions = card.createDiv({
			cls: "opal-share-popover-actions opal-share-popover-actions--text",
		});
		const cancel = actions.createEl("button", {
			cls: "opal-share-popover-textbtn",
			text: t("modal.btn.cancel"),
		});
		cancel.addEventListener("click", () => {
			const c = this.ensureCard(this.anchor);
			void this.renderState(c, file);
		});
		const confirm = actions.createEl("button", {
			cls: "opal-share-popover-textbtn mod-cta",
			text: isPublish ? t("modal.btn.confirmPublish") : t("modal.btn.confirmUnpublish"),
		});

		// Enforce the sub-page cap: while more than MAX_SUB_PAGES are selected for
		// publishing, warn and block confirm until the user unchecks enough.
		updateGate = () => {
			if (!isPublish) return;
			const selected = [...checkStates.values()].filter(Boolean).length;
			const over = selected > MAX_SUB_PAGES;
			confirm.disabled = over;
			warn.toggleClass("is-visible", over);
			if (over) {
				warn.setText(
					t("modal.subNotes.overLimit", { count: String(selected), max: String(MAX_SUB_PAGES) })
				);
			}
		};
		updateGate();

		confirm.addEventListener("click", () => {
			if (confirm.disabled) return;
			const selected: SubNoteStatus[] = flat
				.filter((n) => checkStates.get(n.file.path) && (isPublish || n.shareLink))
				.map((n) => ({ file: n.file, shareLink: n.shareLink }));
			if (isPublish) {
				this.plugin.publishFromUi(file, selected);
			} else {
				this.plugin.unpublishFromUi(file, selected);
			}
		});
	}

	/**
	 * Render a note name in a confirm row. Long names are clipped with an ellipsis;
	 * hovering scrolls the name horizontally at a steady speed to reveal the full text
	 * (and a native `title` tooltip is set as a fallback).
	 */
	private createConfirmName(parent: HTMLElement, name: string): HTMLSpanElement {
		const el = parent.createSpan({ cls: "opal-share-popover-confirm-name", text: name });
		el.setAttr("title", name);

		const SPEED = 0.04; // px per ms (~40px/s)
		const DELAY = 350; // ms to pause before scrolling starts
		let raf = 0;
		el.addEventListener("mouseenter", () => {
			const max = el.scrollWidth - el.clientWidth;
			if (max <= 0) return;
			// Drop the ellipsis while scrolling so it doesn't sit on top of the text.
			el.addClass("is-scrolling");
			let start = 0;
			let last = 0;
			const tick = (ts: number): void => {
				if (!start) start = last = ts;
				if (ts - start > DELAY) {
					el.scrollLeft = Math.min(max, el.scrollLeft + SPEED * (ts - last));
				}
				last = ts;
				if (el.scrollLeft < max) raf = window.requestAnimationFrame(tick);
			};
			raf = window.requestAnimationFrame(tick);
		});
		el.addEventListener("mouseleave", () => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = 0;
			el.scrollLeft = 0;
			el.removeClass("is-scrolling");
		});
		return el;
	}

	/** Async-load a sub-note/main-note's view count into the confirm row (best-effort). */
	private showConfirmViews(item: HTMLElement, shareLink: string): void {
		if (!shareLink || !canReadAnalytics(this.plugin.settings)) return;
		const span = item.createSpan({
			cls: "opal-share-popover-confirm-views",
			text: t("modal.views.loading"),
		});
		void fetchPageViews(this.plugin.settings, shareLink)
			.then((stats) => {
				if (!span.isConnected) return;
				span.setText(
					stats ? t("modal.views.value", { count: String(stats.views) }) : t("modal.views.fail")
				);
			})
			.catch(() => {
				if (span.isConnected) span.setText(t("modal.views.fail"));
			});
	}

	/**
	 * Render the published-state analytics block (only when analytics is configured):
	 * a view-count row, a 14-day trend sparkline, and an expandable per-dimension
	 * breakdown (countries / OS / browsers / screen sizes), loaded lazily on expand.
	 */
	private renderAnalytics(card: HTMLElement, shareLink: string): void {
		if (!canReadAnalytics(this.plugin.settings)) return;
		const block = card.createDiv({ cls: "opal-share-popover-stats" });

		// Views row: label + number + refresh button.
		const viewsRow = block.createDiv({ cls: "opal-share-popover-statsviews" });
		viewsRow.createSpan({ cls: "opal-share-popover-statslabel", text: t("popover.stats.views") });
		const num = viewsRow.createSpan({ cls: "opal-share-popover-statsnum" });
		const refresh = viewsRow.createDiv({ cls: "opal-share-popover-statsrefresh" });
		setIcon(refresh, "refresh-cw");
		setTooltip(refresh, t("popover.stats.refresh"));

		// 14-day trend sparkline below the views row, filled once fetched.
		const trend = block.createDiv({ cls: "opal-share-popover-statstrend" });

		// 命中缓存：立即用旧数据渲染、不闪烁；未命中：显示占位 spinner。
		const cached = this.statsCache.get(shareLink);
		const hasCache = cached?.views !== undefined || cached?.trend !== undefined;
		if (hasCache) {
			if (cached?.views !== undefined) num.setText(cached.views.toLocaleString());
			else num.setText("—");
			this.renderTrend(trend, cached?.trend ?? null);
		} else {
			num.setText("…");
			trend.createDiv({ cls: "opal-detail-spinner" });
		}

		// 刷新：有数据时只让按钮转圈、展示区不动（后台刷新）；无数据时才占位 spinner。
		const load = () => {
			if (refresh.hasClass("is-loading")) return; // 防抖：上一次刷新未完成时忽略
			const keepOnError = hasCacheNow();
			if (!keepOnError) {
				num.setText("…");
				num.removeClass("is-error");
				trend.empty();
				trend.createDiv({ cls: "opal-detail-spinner" });
			}
			refresh.addClass("is-loading");
			void this.loadAnalytics(card, shareLink, num, trend, keepOnError).finally(() => {
				refresh.removeClass("is-loading");
			});
		};
		const hasCacheNow = (): boolean => {
			const c = this.statsCache.get(shareLink);
			return c?.views !== undefined || c?.trend !== undefined;
		};
		refresh.addEventListener("click", (e) => {
			e.preventDefault();
			load();
		});
		load();

		this.renderExpand(block, card, shareLink);
	}

	/**
	 * Fetch this page's cumulative views + 14-day trend and fill the block. Serial
	 * (not parallel) to avoid GoatCounter's burst rate-limit. Each write is guarded
	 * against a stale/closed card (same guard `showResult` uses) and the result is
	 * cached for instant re-display. When `keepOnError` is set (a background refresh
	 * over already-shown data), a failed fetch keeps the old data instead of clobbering
	 * it with an error placeholder.
	 */
	private async loadAnalytics(
		card: HTMLElement,
		shareLink: string,
		num: HTMLElement,
		trend: HTMLElement,
		keepOnError: boolean
	): Promise<void> {
		const settings = this.plugin.settings;
		const entry = this.cacheEntry(shareLink);

		const stats = await fetchPageViews(settings, shareLink);
		if (this.el !== card || !card.isConnected) return;
		if (stats === null) {
			if (!keepOnError) {
				num.setText("—");
				num.addClass("is-error");
			}
		} else {
			num.setText(stats.views.toLocaleString());
			num.removeClass("is-error");
			entry.views = stats.views;
		}

		const series = await fetchDailyTrend(settings, shareLink, POPOVER_TREND_DAYS);
		if (this.el !== card || !card.isConnected) return;
		if (series !== null) {
			trend.empty();
			this.renderTrend(trend, series);
			entry.trend = series;
		} else if (!keepOnError) {
			trend.empty();
			this.renderTrend(trend, null);
		}
		this.position(card, this.anchor);
	}

	/** Get (or create) the session cache entry for a share link. */
	private cacheEntry(shareLink: string): PopoverStatsCacheEntry {
		let entry = this.statsCache.get(shareLink);
		if (!entry) {
			entry = {};
			this.statsCache.set(shareLink, entry);
		}
		return entry;
	}

	/** A horizontal bar chart of the daily series (height ∝ count, normalized to the max). */
	private renderTrend(parent: HTMLElement, series: DailyPoint[] | null): void {
		if (!series || series.length === 0) {
			parent.createDiv({ cls: "opal-detail-empty", text: t("popover.stats.noTrend") });
			return;
		}
		const max = Math.max(1, ...series.map((d) => d.count));
		const chart = parent.createDiv({ cls: "opal-detail-spark" });
		for (const point of series) {
			const bar = chart.createDiv({ cls: "opal-detail-spark-bar" });
			bar.setCssProps({ "--opal-bar-h": `${Math.round((point.count / max) * 100)}%` });
			bar.setAttribute("aria-label", `${point.day}: ${point.count}`);
			bar.setAttribute("data-tooltip-position", "top");
			if (point.count > 0) bar.addClass("is-active");
		}
	}

	/**
	 * Render the "expand" toggle plus its collapsed panel. The per-dimension
	 * breakdown (countries / OS / browsers / sizes) is fetched lazily the first
	 * time the panel is opened; re-toggling just shows/hides the cached panel.
	 */
	private renderExpand(block: HTMLElement, card: HTMLElement, shareLink: string): void {
		const toggle = block.createDiv({ cls: "opal-share-popover-expand-toggle" });
		const chevron = toggle.createSpan({ cls: "opal-share-popover-expand-chevron" });
		setIcon(chevron, "chevron-down");
		const label = toggle.createSpan({ text: t("popover.stats.expand") });

		const panel = block.createDiv({ cls: "opal-share-popover-expand-panel is-collapsed" });

		// Keep the card anchored as the panel grows/shrinks: the max-height transition
		// changes the card's height over time, so reposition once it finishes settling.
		panel.addEventListener("transitionend", (e) => {
			if (e.propertyName !== "max-height") return;
			this.position(card, this.anchor);
		});

		let expanded = false;
		let loaded = false;
		toggle.addEventListener("click", () => {
			expanded = !expanded;
			toggle.toggleClass("is-expanded", expanded);
			panel.toggleClass("is-collapsed", !expanded);
			label.setText(t(expanded ? "popover.stats.collapse" : "popover.stats.expand"));
			if (expanded && !loaded) {
				loaded = true;
				void this.loadExpand(card, shareLink, panel);
			}
			this.position(card, this.anchor);
		});
	}

	/**
	 * Fetch the four breakdown dimensions and fill the expand panel. Each section
	 * shows its own spinner and fills the moment its slice arrives (parts are fetched
	 * separately). Writes are guarded against a stale/closed card.
	 */
	private async loadExpand(card: HTMLElement, shareLink: string, panel: HTMLElement): Promise<void> {
		const titles: Record<PopoverDimensionKey, string> = {
			locations: t("stats.detail.locations"),
			systems: t("stats.detail.systems"),
			browsers: t("stats.detail.browsers"),
			sizes: t("stats.detail.sizes"),
		};
		const order: PopoverDimensionKey[] = ["locations", "systems", "browsers", "sizes"];
		const cached = this.statsCache.get(shareLink)?.dimensions;
		const slots = {} as Record<PopoverDimensionKey, HTMLElement>;
		for (const key of order) {
			const section = panel.createDiv({ cls: "opal-detail-section" });
			section.createDiv({ cls: "opal-detail-section-title", text: titles[key] });
			const body = section.createDiv({ cls: "opal-detail-section-body" });
			// 命中缓存：立即填旧数据、不闪烁；未命中：占位 spinner，等后台到手顶替。
			if (cached?.[key]) this.fillDimension(body, key, cached[key]);
			else body.createDiv({ cls: "opal-detail-section-spinner opal-detail-spinner" });
			slots[key] = body;
		}

		const result = await fetchPopoverDimensions(this.plugin.settings, shareLink, (key, items) => {
			if (this.el !== card || !card.isConnected) return;
			const body = slots[key];
			if (!body) return;
			this.fillDimension(body, key, items);
			const entry = this.cacheEntry(shareLink);
			(entry.dimensions ??= {} as Record<PopoverDimensionKey, DimensionItem[]>)[key] = items;
			this.position(card, this.anchor);
		});

		if (this.el !== card || !card.isConnected) return;
		// 拉取失败：有缓存就保留旧数据，否则才提示未配置。
		if (result === null && !cached) {
			panel.empty();
			panel.createDiv({ cls: "opal-stats-notice", text: t("stats.notConfigured") });
			this.position(card, this.anchor);
		}
	}

	/** Render one dimension slot, deriving readable size labels (name is always empty for sizes). */
	private fillDimension(body: HTMLElement, key: PopoverDimensionKey, items: DimensionItem[]): void {
		body.empty();
		// 屏幕尺寸维度 name 恒为空，可读标签需由 id 推导（与详情弹窗一致）。
		const mapped = key === "sizes" ? items.map((s) => ({ ...s, name: sizeLabel(s.id) })) : items;
		this.renderDimension(body, mapped);
	}

	/** A ranked list of one dimension; mini bar per row, normalized to the dimension max. */
	private renderDimension(parent: HTMLElement, items: DimensionItem[]): void {
		if (items.length === 0) {
			parent.createDiv({ cls: "opal-detail-empty", text: t("stats.detail.noData") });
			return;
		}
		const max = Math.max(1, ...items.map((i) => i.count));
		const list = parent.createDiv({ cls: "opal-detail-list" });
		for (const item of items) {
			const rowEl = list.createDiv({ cls: "opal-detail-row" });
			const fill = rowEl.createDiv({ cls: "opal-detail-row-fill" });
			fill.setCssProps({ "--opal-bar-w": `${Math.round((item.count / max) * 100)}%` });
			const label = rowEl.createDiv({ cls: "opal-detail-row-label" });
			label.setText(item.name || t("stats.detail.unknownName"));
			rowEl.createDiv({ cls: "opal-detail-row-count", text: item.count.toLocaleString() });
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
