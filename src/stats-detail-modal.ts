import { Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import { t } from "./i18n";
import type { ShareOnlineSettings } from "./settings";
import type { DimensionItem, PageDetail, StatsRow } from "./analytics";
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
 * Map a GoatCounter screen-size id to a localized label. The sizes dimension
 * returns its value in `id` (phone/tablet/desktop/desktophd/unknown) with `name`
 * always empty, so the label must be derived here; unknown/missing → "(unknown)".
 */
export function sizeLabel(id: string | undefined): string {
	switch (id) {
		case "phone":
			return t("stats.detail.size.phone");
		case "tablet":
			return t("stats.detail.size.tablet");
		case "desktop":
			return t("stats.detail.size.desktop");
		case "desktophd":
			return t("stats.detail.size.desktophd");
		default:
			return t("stats.detail.unknownName");
	}
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

		// ── Overview: available immediately from the list's known count ──
		const overview = body.createDiv({ cls: "opal-detail-overview" });
		const numEl = overview.createDiv({ cls: "opal-detail-bignum" });
		numEl.setText(this.countsAvailable ? this.row.views.toLocaleString() : t("stats.views.unknown"));
		overview.createDiv({ cls: "opal-detail-bignum-label", text: t("stats.detail.totalViews") });

		// ── Per-part skeletons: each section spins on its own and fills as soon
		//    as its slice of data arrives (the parts are fetched separately). ──
		const daily = this.createSection(body, t("stats.detail.trend"));
		const grid = body.createDiv({ cls: "opal-detail-grid" });
		const slots: Record<string, HTMLElement> = {
			daily,
			referrers: this.createSection(grid, t("stats.detail.referrers")),
			browsers: this.createSection(grid, t("stats.detail.browsers")),
			systems: this.createSection(grid, t("stats.detail.systems")),
			locations: this.createSection(grid, t("stats.detail.locations")),
			languages: this.createSection(grid, t("stats.detail.languages")),
			sizes: this.createSection(grid, t("stats.detail.sizes")),
		};

		const detail = await fetchPageDetail(this.settings, this.row.shareLink, (key, value) => {
			const slot = slots[key];
			if (!slot) return;
			slot.empty();
			if (key === "daily") {
				this.renderSparkline(slot, value as PageDetail["daily"]);
			} else if (key === "referrers") {
				// GoatCounter 用空 name 表示无来源（直接访问），改用可读标签替代“（未知）”。
				const referrers = (value as DimensionItem[]).map((r) => ({
					...r,
					name: r.name || t("stats.detail.directReferrer"),
				}));
				this.renderDimension(slot, referrers);
			} else if (key === "sizes") {
				// 屏幕尺寸维度 name 恒为空，可读标签需由 id 推导。
				const sizes = (value as DimensionItem[]).map((s) => ({
					...s,
					name: sizeLabel(s.id),
				}));
				this.renderDimension(slot, sizes);
			} else {
				this.renderDimension(slot, value as DimensionItem[]);
			}
		});

		// Unconfigured / invalid link: no parts ever arrived — replace the whole
		// skeleton with a single notice.
		if (detail === null) {
			body.empty();
			body.createDiv({ cls: "opal-stats-notice", text: t("stats.notConfigured") });
		}
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

	/**
	 * Create a titled section with its own loading spinner and return the inner
	 * body element to fill once the section's data arrives. Each section loads
	 * independently, so whichever part resolves first replaces its own spinner.
	 */
	private createSection(parent: HTMLElement, title: string): HTMLElement {
		const section = parent.createDiv({ cls: "opal-detail-section" });
		section.createDiv({ cls: "opal-detail-section-title", text: title });
		const sectionBody = section.createDiv({ cls: "opal-detail-section-body" });
		sectionBody.createDiv({ cls: "opal-detail-section-spinner opal-detail-spinner" });
		return sectionBody;
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
}
