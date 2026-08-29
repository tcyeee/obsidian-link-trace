/**
 * Frontmatter key holding the note's publish status
 * (`"published"` | `"unpublished"` | `"hidden"`).
 */
export const SHARE_STATUS_KEY = "share_status";

/**
 * True when frontmatter represents a currently-live published page. A
 * `share_link` with no explicit `share_status` is treated as published, for
 * compatibility with notes published before this field existed. `share_link`
 * itself is kept around after unpublish (not deleted) so a later republish
 * can reuse the same address — so its mere presence is no longer sufficient
 * to mean "currently published".
 */
export function isPublishedFrontmatter(fm: Record<string, unknown> | null | undefined): boolean {
	const shareLink = fm?.["share_link"];
	if (typeof shareLink !== "string" || !shareLink) return false;
	const status = fm?.[SHARE_STATUS_KEY];
	return status === undefined || status === "published";
}

/**
 * The short page name embedded in a share link — the stable OSS key segment,
 * and the key the publish ledger is stored under. Handles both the current
 * `.../{name}.html` (or bare `.../{name}`) form and the legacy
 * `.../{name}/index.html` form. Returns "" for an empty/garbage link.
 */
export function extractNoteName(shareLink: string): string {
	const parts = (shareLink || "").split("/");
	const last = parts[parts.length - 1] ?? "";
	return last === "index.html" ? (parts[parts.length - 2] ?? "") : last.replace(/\.html$/i, "");
}

/**
 * True when frontmatter represents a taken-down page that should still show up
 * in the stats page's "unpublished" list (so it can be republished or hidden).
 * `"hidden"` is a further, user-chosen state on top of `"unpublished"` — once
 * hidden, a page drops out of both lists but `share_link` is still kept for reuse.
 */
export function isUnpublishedVisibleFrontmatter(
	fm: Record<string, unknown> | null | undefined
): boolean {
	const shareLink = fm?.["share_link"];
	if (typeof shareLink !== "string" || !shareLink) return false;
	return fm?.[SHARE_STATUS_KEY] === "unpublished";
}
