import { describe, expect, it } from "vitest";
import { resolveBannerMount } from "./share-banner";

function fakeEl(matches: Record<string, unknown>): HTMLElement {
	return {
		querySelector: (sel: string) => matches[sel] ?? null,
	} as unknown as HTMLElement;
}

describe("resolveBannerMount", () => {
	it("prefers the reading-view preview sizer", () => {
		const preview = {} as HTMLElement;
		const cm = {} as HTMLElement;
		const contentEl = fakeEl({
			".markdown-preview-sizer": preview,
			".cm-sizer": cm,
		});
		expect(resolveBannerMount(contentEl)).toBe(preview);
	});

	it("falls back to the editor cm-sizer", () => {
		const cm = {} as HTMLElement;
		const contentEl = fakeEl({ ".cm-sizer": cm });
		expect(resolveBannerMount(contentEl)).toBe(cm);
	});

	it("falls back to contentEl when no sizer exists", () => {
		const contentEl = fakeEl({});
		expect(resolveBannerMount(contentEl)).toBe(contentEl);
	});
});
