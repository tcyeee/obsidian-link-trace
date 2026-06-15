/** Remove a leading YAML frontmatter block — mirrors renderer.ts before render. */
export function stripFrontmatter(raw: string): string {
	return raw.replace(/^---[\s\S]*?---\n?/, "");
}

/**
 * Fast, dependency-free djb2 hash of the note body. Used only to detect whether
 * the local body differs from the body that was last published — not for security.
 */
export function hashBody(body: string): string {
	let h = 5381;
	for (let i = 0; i < body.length; i++) {
		h = ((h << 5) + h + body.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}
