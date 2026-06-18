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
 * Scan every Markdown note for a `share_link` frontmatter entry — the canonical
 * local record of what this plugin has published (main notes and sub-notes alike).
 * Pages with zero views still show up here; GoatCounter only knows the visited ones.
 */
export function collectPublishedPages(app: App): PublishedPage[] {
	const pages: PublishedPage[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const shareLink = fm?.["share_link"] as unknown;
		if (typeof shareLink !== "string" || !shareLink) continue;
		const path = extractPathname(shareLink);
		if (!path) continue;
		const shareTime = fm["share_time"] as unknown;
		const parsed = typeof shareTime === "string" ? Date.parse(shareTime) : NaN;
		pages.push({
			path,
			title: file.basename,
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
			const pages = collectPublishedPages(this.app);
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

			this.renderTable(body, rows, countsAvailable);
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
		const card = (value: string, label: string) => {
			const el = parent.createDiv({ cls: "opal-stat-card" });
			el.createDiv({ cls: "opal-stat-card-value", text: value });
			el.createDiv({ cls: "opal-stat-card-label", text: label });
		};
		card(pageCount.toLocaleString(), t("stats.card.pages"));
		card(
			totalViews == null ? t("stats.views.unknown") : totalViews.toLocaleString(),
			t("stats.card.views")
		);
	}

	private renderTable(parent: HTMLElement, rows: StatsRow[], countsAvailable: boolean): void {
		const table = parent.createEl("table", { cls: "opal-stats-table" });
		const thead = table.createEl("thead").createEl("tr");
		thead.createEl("th", { text: t("stats.col.title") });
		thead.createEl("th", { cls: "opal-stats-url", text: t("stats.col.url") });
		thead.createEl("th", { cls: "opal-stats-num", text: t("stats.col.views") });
		thead.createEl("th", { cls: "opal-stats-date", text: t("stats.col.published") });

		const tbody = table.createEl("tbody");
		for (const row of rows) {
			const tr = tbody.createEl("tr", { cls: "opal-stats-row" });
			setTooltip(tr, t("stats.openDetail"));
			tr.addEventListener("click", () =>
				new StatsDetailModal(this.app, this.plugin.settings, row, countsAvailable).open()
			);

			// Title cell: note name opens the note; external-link icon opens the page.
			// Both stop propagation so they don't also trigger the row's detail modal.
			const titleTd = tr.createEl("td", { cls: "opal-stats-titlecol" });
			const titleWrap = titleTd.createDiv({ cls: "opal-stats-titlecell" });
			const nameEl = titleWrap.createSpan({ cls: "opal-stats-notename", text: row.title });
			setTooltip(nameEl, t("stats.openNote"));
			nameEl.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.openNote(row.filePath);
			});
			const linkEl = titleWrap.createSpan({ cls: "opal-stats-openlink" });
			setIcon(linkEl, "external-link");
			setTooltip(linkEl, t("stats.openLink"));
			linkEl.addEventListener("click", (e) => {
				e.stopPropagation();
				window.open(row.shareLink, "_blank");
			});

			// URL cell: the short-link path, click opens the page (stops row propagation).
			const urlTd = tr.createEl("td", { cls: "opal-stats-url" });
			const urlEl = urlTd.createSpan({ cls: "opal-stats-urltext", text: row.path });
			setTooltip(urlEl, row.shareLink);
			urlEl.addEventListener("click", (e) => {
				e.stopPropagation();
				window.open(row.shareLink, "_blank");
			});

			tr.createEl("td", {
				cls: "opal-stats-num",
				text: countsAvailable ? row.views.toLocaleString() : t("stats.views.unknown"),
			});
			tr.createEl("td", { cls: "opal-stats-date", text: formatDate(row.publishedAt) });
		}
	}

	private async openNote(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}
