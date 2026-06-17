import { Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import { t } from "./i18n";
import type { ShareOnlineSettings } from "./settings";
import type { DimensionItem, StatsRow } from "./analytics";
import { fetchPageDetail } from "./analytics-client";

/** Format a timestamp as local date + 24h time, e.g. "2026-06-15 14:30"; null → em dash. */
function formatDateTime(ms: number | null): string {
	if (ms == null) return t("stats.views.unknown");
	const d = new Date(ms);
	if (isNaN(d.getTime())) return t("stats.views.unknown");
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}`
	);
}

/**
 * Per-page analytics detail modal. Opened by clicking a row in the stats view.
 * Uses Obsidian's `Modal` (which supplies the dimmed background mask); a CSS class
 * adds a scale+fade entrance animation. Shows every GoatCounter-readable dimension
 * for the single page: a daily trend sparkline plus ranked lists for referrers,
 * browsers, systems, locations, languages and screen sizes.
 */
export class StatsDetailModal extends Modal {
	constructor(
		app: App,
		private settings: ShareOnlineSettings,
		private row: StatsRow,
		private countsAvailable: boolean
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("opal-detail-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("opal-detail");

		this.renderHeader(contentEl);

		const body = contentEl.createDiv({ cls: "opal-detail-body" });
		body.createDiv({ cls: "opal-detail-loading", text: t("stats.loading") });

		const detail = await fetchPageDetail(this.settings, this.row.shareLink);
		body.empty();

		if (detail === null) {
			body.createDiv({ cls: "opal-stats-notice", text: t("stats.notConfigured") });
			return;
		}

		// ── Overview number + daily trend sparkline ──
		const overview = body.createDiv({ cls: "opal-detail-overview" });
		const numEl = overview.createDiv({ cls: "opal-detail-bignum" });
		numEl.setText(this.countsAvailable ? this.row.views.toLocaleString() : t("stats.views.unknown"));
		overview.createDiv({ cls: "opal-detail-bignum-label", text: t("stats.detail.totalViews") });

		const trend = body.createDiv({ cls: "opal-detail-section" });
		trend.createDiv({ cls: "opal-detail-section-title", text: t("stats.detail.trend") });
		this.renderSparkline(trend, detail.daily);

		// ── Ranked dimension lists ──
		const grid = body.createDiv({ cls: "opal-detail-grid" });
		this.renderDimension(grid, t("stats.detail.referrers"), detail.referrers);
		this.renderDimension(grid, t("stats.detail.browsers"), detail.browsers);
		this.renderDimension(grid, t("stats.detail.systems"), detail.systems);
		this.renderDimension(grid, t("stats.detail.locations"), detail.locations);
		this.renderDimension(grid, t("stats.detail.languages"), detail.languages);
		this.renderDimension(grid, t("stats.detail.sizes"), detail.sizes);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderHeader(parent: HTMLElement): void {
		const header = parent.createDiv({ cls: "opal-detail-header" });
		header.createDiv({ cls: "opal-detail-title", text: this.row.title });

		const urlEl = header.createDiv({ cls: "opal-detail-url" });
		const linkIcon = urlEl.createSpan({ cls: "opal-detail-url-icon" });
		setIcon(linkIcon, "external-link");
		const linkText = urlEl.createSpan({ cls: "opal-detail-url-text", text: this.row.shareLink });
		const open = () => window.open(this.row.shareLink, "_blank");
		urlEl.addEventListener("click", open);
		linkText.addEventListener("click", open);

		header.createDiv({
			cls: "opal-detail-published",
			text: t("stats.detail.published", { time: formatDateTime(this.row.publishedAt) }),
		});
	}

	/** A horizontal bar chart of the daily series (height ∝ count, normalized to the max). */
	private renderSparkline(parent: HTMLElement, daily: { day: string; count: number }[]): void {
		if (daily.length === 0) {
			parent.createDiv({ cls: "opal-detail-empty", text: t("stats.detail.noTrend") });
			return;
		}
		const max = Math.max(1, ...daily.map((d) => d.count));
		const chart = parent.createDiv({ cls: "opal-detail-spark" });
		for (const point of daily) {
			const bar = chart.createDiv({ cls: "opal-detail-spark-bar" });
			bar.setCssProps({ "--opal-bar-h": `${Math.round((point.count / max) * 100)}%` });
			bar.setAttribute("aria-label", `${point.day}: ${point.count}`);
			bar.setAttribute("data-tooltip-position", "top");
			if (point.count > 0) bar.addClass("is-active");
		}
	}

	/** A titled, ranked list of one dimension; mini bar per row, normalized to the dimension max. */
	private renderDimension(parent: HTMLElement, title: string, items: DimensionItem[]): void {
		const section = parent.createDiv({ cls: "opal-detail-section" });
		section.createDiv({ cls: "opal-detail-section-title", text: title });
		if (items.length === 0) {
			section.createDiv({ cls: "opal-detail-empty", text: t("stats.detail.noData") });
			return;
		}
		const max = Math.max(1, ...items.map((i) => i.count));
		const list = section.createDiv({ cls: "opal-detail-list" });
		for (const item of items) {
			const rowEl = list.createDiv({ cls: "opal-detail-row" });
			const fill = rowEl.createDiv({ cls: "opal-detail-row-fill" });
			fill.setCssProps({ "--opal-bar-w": `${Math.round((item.count / max) * 100)}%` });
			const label = rowEl.createDiv({ cls: "opal-detail-row-label" });
			label.setText(item.name || t("stats.detail.unknownName"));
			rowEl.createDiv({ cls: "opal-detail-row-count", text: item.count.toLocaleString() });
		}
	}
}
