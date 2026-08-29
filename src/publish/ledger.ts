import { extractNoteName, isPublishedFrontmatter } from "../core/share-status";

/**
 * One page this plugin has uploaded to OSS, recorded independently of the
 * owning note's frontmatter. Frontmatter is convenient but lives in an
 * undoable text buffer (a Cmd+Z right after publish wipes `share_link`) and is
 * rewritten by Obsidian Sync conflict resolution — so it can't be the only
 * record of "this page exists on the internet". The ledger is the durable one;
 * frontmatter is treated as a derived cache. See {@link findOrphans}.
 */
export interface LedgerEntry {
	/** Short page name — the OSS key segment and this entry's stable identity. */
	name: string;
	/** Full public URL at the last successful upload. */
	url: string;
	/** Vault path of the owning note. Best-effort — kept fresh via rename events. */
	notePath: string;
	/** ISO timestamp of the last successful upload. */
	publishedAt: string;
	/** djb2 hash of the note body at upload time (mirrors `share_hash`). */
	bodyHash: string;
	/** Whether the object is currently believed to be live on OSS. */
	live: boolean;
	/** Uploaded as a linked sub-page rather than a primary publish. */
	sub: boolean;
}

export interface LedgerData {
	version: 1;
	entries: LedgerEntry[];
}

export function emptyLedger(): LedgerData {
	return { version: 1, entries: [] };
}

/** Coerce whatever was persisted (or nothing) into a well-formed ledger. */
export function normalizeLedger(raw: unknown): LedgerData {
	const ledger = emptyLedger();
	if (!raw || typeof raw !== "object") return ledger;
	const entries = (raw as { entries?: unknown }).entries;
	if (!Array.isArray(entries)) return ledger;
	for (const e of entries) {
		if (!e || typeof e !== "object") continue;
		const { name, url, notePath, publishedAt, bodyHash, live, sub } = e as Record<string, unknown>;
		if (typeof name !== "string" || !name) continue;
		if (typeof url !== "string" || typeof notePath !== "string") continue;
		ledger.entries.push({
			name,
			url,
			notePath,
			publishedAt: typeof publishedAt === "string" ? publishedAt : "",
			bodyHash: typeof bodyHash === "string" ? bodyHash : "",
			live: live !== false,
			sub: sub === true,
		});
	}
	return ledger;
}

export function findByName(ledger: LedgerData, name: string): LedgerEntry | undefined {
	return ledger.entries.find((e) => e.name === name);
}

/** The live entry whose owning note is `notePath`, if any. */
export function findLiveByNotePath(ledger: LedgerData, notePath: string): LedgerEntry | undefined {
	return ledger.entries.find((e) => e.live && e.notePath === notePath);
}

/** Insert or refresh the entry for `entry.name` (the stable OSS key segment). */
export function recordPublish(ledger: LedgerData, entry: LedgerEntry): void {
	const existing = findByName(ledger, entry.name);
	if (existing) Object.assign(existing, entry);
	else ledger.entries.push(entry);
}

/** Mark a page taken down. Returns true if this changed anything. */
export function markUnpublished(ledger: LedgerData, name: string): boolean {
	const e = findByName(ledger, name);
	if (!e || !e.live) return false;
	e.live = false;
	return true;
}

/** Follow a note rename so `notePath` back-references stay valid. Returns true if anything changed. */
export function renameNotePath(ledger: LedgerData, oldPath: string, newPath: string): boolean {
	let changed = false;
	for (const e of ledger.entries) {
		if (e.notePath === oldPath) {
			e.notePath = newPath;
			changed = true;
		}
	}
	return changed;
}

export type OrphanKind = "detached" | "note-missing";

export interface Orphan {
	entry: LedgerEntry;
	kind: OrphanKind;
}

/**
 * Live ledger entries the vault no longer accounts for — the "ghost page" case
 * (page online, but the system lost track of it).
 *
 * - `detached`: the note still exists but its frontmatter no longer vouches for
 *   this page (lost `share_link`, `share_status` flipped, or the link points
 *   elsewhere) — typically an undo right after publish, or a Sync conflict.
 *   Recoverable by writing the frontmatter back from the ledger.
 * - `note-missing`: the owning note file is gone. Recoverable only by taking
 *   the page down.
 *
 * A healthy entry (note present, frontmatter still published and pointing at
 * this same name) is not returned.
 */
export function findOrphans(
	ledger: LedgerData,
	getFrontmatter: (notePath: string) => Record<string, unknown> | null | undefined,
	noteExists: (notePath: string) => boolean
): Orphan[] {
	const orphans: Orphan[] = [];
	for (const entry of ledger.entries) {
		if (!entry.live) continue;
		if (!noteExists(entry.notePath)) {
			orphans.push({ entry, kind: "note-missing" });
			continue;
		}
		const fm = getFrontmatter(entry.notePath);
		const link = fm?.["share_link"];
		const healthy =
			isPublishedFrontmatter(fm) &&
			typeof link === "string" &&
			extractNoteName(link) === entry.name;
		if (!healthy) orphans.push({ entry, kind: "detached" });
	}
	return orphans;
}
