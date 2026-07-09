import { ItemView, WorkspaceLeaf, TFile, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import type ShareOnlinePlugin from "../../main";
import { t } from "../core/i18n";
import {
	extractPathname,
	canReadAnalytics,
	buildStatsRows,
	type PublishedPage,
	type StatsRow,
} from "./analytics";
import { fetchAllPathHits } from "./analytics-client";
import { StatsDetailModal } from "./stats-detail-modal";
import { isPublishedFrontmatter } from "../core/share-status";
import { makeUniquePrefixStripper } from "../publish/exporter";

export const VIEW_TYPE_SHARE_STATS = "share-stats-view";

/** Format a timestamp as a local date, e.g. "2026-06-15"; null → em dash. */
function formatDate(ms: number | null): string {
	if (ms == null) return t("stats.views.unknown");
	const d = new Date(ms);
	if (isNaN(d.getTime())) return t("stats.views.unknown");
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Scan every Markdown note for a currently-live `share_link` — the canonical
 * local record of what this plugin has published (main notes and sub-notes alike).
 * Notes taken down keep their `share_link` (so republishing can reuse it) but are
 * excluded here via `share_status`. Pages with zero views still show up here;
 * GoatCounter only knows the visited ones.
 *
 * `titleFor` strips the unique-note timestamp prefix when the compatibility
 * toggle is on, matching the title shown on the exported page itself; pass
 * the identity function (the default) to keep the raw basename.
 */
export function collectPublishedPages(
	app: App,
	titleFor: (name: string) => string = (n) => n
): PublishedPage[] {
	const pages: PublishedPage[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!isPublishedFrontmatter(fm)) continue;
		const shareLink = fm?.["share_link"] as string;
		const path = extractPathname(shareLink);
		if (!path) continue;
		const shareTime = fm?.["share_time"] as unknown;
		const parsed = typeof shareTime === "string" ? Date.parse(shareTime) : NaN;
		pages.push({
			path,
			title: titleFor(file.basename),
			shareLink,
			publishedAt: isNaN(parsed) ? null : parsed,
			filePath: file.path,
		});
	}
	return pages;
}

/**
 * A dedicated tab listing every published share page and its cumulative views.
 * The page list comes from local frontmatter; view counts come from one bulk
 * GoatCounter call. The two are joined by URL pathname.
 */
export class ShareStatsView extends ItemView {
	private loading = false;

	constructor(leaf: WorkspaceLeaf, private plugin: ShareOnlinePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_SHARE_STATS;
	}

	getDisplayText(): string {
		return t("stats.title");
	}

	getIcon(): string {
		return "bar-chart-3";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("opal-stats-view");
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Rebuild the whole view: header + (loading → table). Re-entrancy guarded. */
	private async render(): Promise<void> {
		if (this.loading) return;
		this.loading = true;

		const root = this.contentEl;
		root.empty();

		// ── Header: title + summary slot + refresh ──
		const header = root.createDiv({ cls: "opal-stats-header" });
		const headLeft = header.createDiv({ cls: "opal-stats-headleft" });
		const titleRow = headLeft.createDiv({ cls: "opal-stats-titlerow" });
		const titleIcon = titleRow.createDiv({ cls: "opal-stats-titleicon" });
		setIcon(titleIcon, "bar-chart-3");
		titleRow.createSpan({ cls: "opal-stats-title", text: t("stats.title") });
		const cardsEl = headLeft.createDiv({ cls: "opal-stats-cards" });

		const refreshBtn = header.createDiv({ cls: "opal-stats-refresh" });
		setIcon(refreshBtn, "refresh-cw");
		setTooltip(refreshBtn, t("stats.refresh"));
		refreshBtn.addEventListener("click", () => void this.render());

		const body = root.createDiv({ cls: "opal-stats-body" });
		body.createDiv({ cls: "opal-stats-loading", text: t("stats.loading") });

		try {
			const titleFor = await makeUniquePrefixStripper(
				this.app,
				this.plugin.settings.stripUniquePrefix
			);
			const pages = collectPublishedPages(this.app, titleFor);
			const configured = canReadAnalytics(this.plugin.settings);
			const hits = configured ? await fetchAllPathHits(this.plugin.settings) : null;
			const countsAvailable = hits !== null;
			const rows = buildStatsRows(pages, hits ?? new Map<string, number>());
			const totalViews = countsAvailable
				? rows.reduce((sum, r) => sum + r.views, 0)
				: null;

			// Header stat cards: page count + total views (— when counts unavailable).
			this.renderCards(cardsEl, pages.length, totalViews);

			body.empty();

			// A line explaining missing counts (unconfigured vs. fetch failure).
			if (!configured) {
				body.createDiv({ cls: "opal-stats-notice", text: t("stats.notConfigured") });
			} else if (!countsAvailable) {
				body.createDiv({ cls: "opal-stats-notice", text: t("stats.fetchFailed") });
			}

			if (rows.length === 0) {
				body.createDiv({ cls: "opal-stats-empty", text: t("stats.empty") });
				return;
			}

			this.renderListHeader(body, rows.length);
			this.renderList(body, rows, countsAvailable);
		} catch (err) {
			body.empty();
			body.createDiv({ cls: "opal-stats-notice", text: t("stats.fetchFailed") });
			console.error(err);
		} finally {
			this.loading = false;
		}
	}

	/** Render the two header stat cards: published page count + total views. */
	private renderCards(parent: HTMLElement, pageCount: number, totalViews: number | null): void {
		parent.empty();
		const card = (value: string, unit: string, label: string, accent: "blue" | "green") => {
			const el = parent.createDiv({ cls: `opal-stat-card opal-stat-card-${accent}` });
			el.createDiv({ cls: "opal-stat-card-label", text: label });
			const valueRow = el.createDiv({ cls: "opal-stat-card-valuerow" });
			valueRow.createSpan({ cls: "opal-stat-card-value", text: value });
			if (unit) valueRow.createSpan({ cls: "opal-stat-card-unit", text: unit });
			el.createDiv({ cls: "opal-stat-card-accent" });
		};
		card(pageCount.toLocaleString(), "", t("stats.card.pages"), "blue");
		card(
			totalViews == null ? t("stats.views.unknown") : totalViews.toLocaleString(),
			totalViews == null ? "" : t("stats.card.unit.views"),
			t("stats.card.views"),
			"green"
		);
	}

	/** Section heading above the page list: title + total item count. */
	private renderListHeader(parent: HTMLElement, count: number): void {
		const header = parent.createDiv({ cls: "opal-stats-listheader" });
		header.createDiv({ cls: "opal-stats-listtitle", text: t("stats.list.title") });
		header.createDiv({
			cls: "opal-stats-listcount",
			text: t("stats.list.count", { count: count.toLocaleString() }),
		});
	}

	/** Stacked cards — one per published page — sized for a narrow sidebar. */
	private renderList(parent: HTMLElement, rows: StatsRow[], countsAvailable: boolean): void {
		const list = parent.createDiv({ cls: "opal-stats-list" });
		for (const row of rows) {
			const item = list.createDiv({ cls: "opal-stats-item" });
			setTooltip(item, t("stats.openDetail"));
			item.addEventListener("click", () =>
				new StatsDetailModal(this.app, this.plugin.settings, row, countsAvailable).open()
			);

			// Title row: note name opens the note; external-link icon opens the page.
			// Both stop propagation so they don't also trigger the item's detail modal.
			const titleRow = item.createDiv({ cls: "opal-stats-itemtitle" });
			const nameEl = titleRow.createSpan({ cls: "opal-stats-notename", text: row.title });
			setTooltip(nameEl, t("stats.openNote"));
			nameEl.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.openNote(row.filePath);
			});
			const linkEl = titleRow.createDiv({ cls: "opal-stats-openlink" });
			setIcon(linkEl, "external-link");
			setTooltip(linkEl, t("stats.openLink"));
			linkEl.addEventListener("click", (e) => {
				e.stopPropagation();
				window.open(row.shareLink, "_blank");
			});

			// Meta row: short-link pill, view count, and published date.
			const metaRow = item.createDiv({ cls: "opal-stats-itemmeta" });

			const chip = metaRow.createDiv({ cls: "opal-stats-linkchip" });
			const chipIcon = chip.createSpan({ cls: "opal-stats-linkchip-icon" });
			setIcon(chipIcon, "link");
			chip.createSpan({ text: row.path });
			setTooltip(chip, row.shareLink);
			chip.addEventListener("click", (e) => {
				e.stopPropagation();
				window.open(row.shareLink, "_blank");
			});

			const metaGroup = metaRow.createDiv({ cls: "opal-stats-metagroup" });

			const viewsEl = metaGroup.createDiv({ cls: "opal-stats-metaitem" });
			setIcon(viewsEl.createSpan({ cls: "opal-stats-metaicon" }), "eye");
			viewsEl.createSpan({
				text: countsAvailable
					? t("stats.viewsCount", { count: row.views.toLocaleString() })
					: t("stats.views.unknown"),
			});

			const dateEl = metaGroup.createDiv({ cls: "opal-stats-metaitem" });
			setIcon(dateEl.createSpan({ cls: "opal-stats-metaicon" }), "calendar");
			dateEl.createSpan({ text: formatDate(row.publishedAt) });
		}
	}

	private async openNote(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}
