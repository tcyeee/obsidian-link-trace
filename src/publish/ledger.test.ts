import { describe, it, expect } from "vitest";
import {
	emptyLedger,
	normalizeLedger,
	recordPublish,
	markUnpublished,
	renameNotePath,
	findLiveByNotePath,
	findOrphans,
	type LedgerEntry,
} from "./ledger";

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
	name: "ab3",
	url: "https://cdn.example.com/notes/ab3",
	notePath: "Notes/My Note.md",
	publishedAt: "2026-08-01T00:00:00.000Z",
	bodyHash: "abc",
	live: true,
	sub: false,
	...over,
});

describe("normalizeLedger", () => {
	it("returns an empty ledger for junk input", () => {
		expect(normalizeLedger(null)).toEqual({ version: 1, entries: [] });
		expect(normalizeLedger("nope")).toEqual({ version: 1, entries: [] });
		expect(normalizeLedger({ entries: "no" })).toEqual({ version: 1, entries: [] });
	});

	it("keeps well-formed entries and drops nameless / malformed ones", () => {
		const led = normalizeLedger({
			version: 1,
			entries: [
				entry(),
				{ name: "", url: "x", notePath: "y" },
				{ url: "x", notePath: "y" },
				{ name: "cd4", url: "u", notePath: "p" },
			],
		});
		expect(led.entries.map((e) => e.name)).toEqual(["ab3", "cd4"]);
		// missing optional fields are defaulted
		expect(led.entries[1]).toMatchObject({ publishedAt: "", bodyHash: "", live: true, sub: false });
	});

	it("treats live only as false when explicitly false", () => {
		const led = normalizeLedger({ entries: [entry({ live: undefined as unknown as boolean })] });
		expect(led.entries[0].live).toBe(true);
	});
});

describe("recordPublish / markUnpublished", () => {
	it("inserts a new entry then updates it in place by name", () => {
		const led = emptyLedger();
		recordPublish(led, entry());
		recordPublish(led, entry({ url: "https://cdn.example.com/notes/ab3?v=2", bodyHash: "def" }));
		expect(led.entries).toHaveLength(1);
		expect(led.entries[0]).toMatchObject({ bodyHash: "def" });
	});

	it("markUnpublished flips live once and reports whether it changed anything", () => {
		const led = emptyLedger();
		recordPublish(led, entry());
		expect(markUnpublished(led, "ab3")).toBe(true);
		expect(markUnpublished(led, "ab3")).toBe(false);
		expect(markUnpublished(led, "missing")).toBe(false);
		expect(led.entries[0].live).toBe(false);
	});
});

describe("renameNotePath / findLiveByNotePath", () => {
	it("moves every matching back-reference and only reports a change when one moved", () => {
		const led = emptyLedger();
		recordPublish(led, entry({ name: "a", notePath: "old.md" }));
		recordPublish(led, entry({ name: "b", notePath: "old.md", sub: true }));
		expect(renameNotePath(led, "old.md", "new.md")).toBe(true);
		expect(renameNotePath(led, "old.md", "new.md")).toBe(false);
		expect(led.entries.every((e) => e.notePath === "new.md")).toBe(true);
	});

	it("findLiveByNotePath ignores taken-down entries", () => {
		const led = emptyLedger();
		recordPublish(led, entry({ notePath: "n.md", live: false }));
		expect(findLiveByNotePath(led, "n.md")).toBeUndefined();
		recordPublish(led, entry({ name: "x2", notePath: "n.md", live: true }));
		expect(findLiveByNotePath(led, "n.md")?.name).toBe("x2");
	});
});

describe("findOrphans", () => {
	const healthyFm = { share_link: "https://cdn.example.com/notes/ab3", share_status: "published" };

	it("returns nothing when the note still vouches for the page", () => {
		const led = emptyLedger();
		recordPublish(led, entry());
		const orphans = findOrphans(led, () => healthyFm, () => true);
		expect(orphans).toHaveLength(0);
	});

	it("flags a detached note (frontmatter lost the link) as recoverable", () => {
		const led = emptyLedger();
		recordPublish(led, entry());
		const orphans = findOrphans(led, () => ({}), () => true);
		expect(orphans).toEqual([{ entry: led.entries[0], kind: "detached" }]);
	});

	it("flags a link that now points at a different page", () => {
		const led = emptyLedger();
		recordPublish(led, entry());
		const orphans = findOrphans(
			led,
			() => ({ share_link: "https://cdn.example.com/notes/zzz", share_status: "published" }),
			() => true
		);
		expect(orphans[0].kind).toBe("detached");
	});

	it("flags a missing note file", () => {
		const led = emptyLedger();
		recordPublish(led, entry());
		const orphans = findOrphans(led, () => null, () => false);
		expect(orphans).toEqual([{ entry: led.entries[0], kind: "note-missing" }]);
	});

	it("ignores entries already marked taken-down", () => {
		const led = emptyLedger();
		recordPublish(led, entry({ live: false }));
		expect(findOrphans(led, () => ({}), () => true)).toHaveLength(0);
	});
});
