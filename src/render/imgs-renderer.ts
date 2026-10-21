import { App, TFile } from "obsidian";

/* ── Image registration helper ──────────────────────────────────────────── */

/**
 * Register an image TFile into the export map.
 * Returns the de-duplicated filename that will be used under images/.
 */
export function registerImage(imgFile: TFile, images: Map<string, TFile>): string {
  for (const [name, f] of images) {
    if (f.path === imgFile.path) return name; // already registered
  }
  let name = imgFile.name;
  if (images.has(name)) {
    const ext  = imgFile.extension ? `.${imgFile.extension}` : "";
    const base = imgFile.basename;
    let i = 1;
    while (images.has(`${base}_${i}${ext}`)) i++;
    name = `${base}_${i}${ext}`;
  }
  images.set(name, imgFile);
  return name;
}

/* ── imgs block parser ───────────────────────────────────────────────────── */

/**
 * Extensions the image-cluster plugin now embeds as `<video>` (cover-frame
 * thumbnail + play badge) rather than `<img>`. Mirrors that plugin's
 * `VIDEO_EXTENSIONS` — mkv/avi deliberately excluded, same reasoning: browser
 * `<video>` codec support for them is unreliable.
 */
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

function extensionOf(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : "";
}

interface ImgsConfig {
  border: boolean;
  shadow: boolean;
}

interface ImgsBlock {
  config: ImgsConfig;
  paths:  string[];   // vault-relative paths (leading `/` stripped)
}

/**
 * Parse the raw text of an `imgs` code block.
 *
 * Format (image-cluster plugin):
 *   - Optional first line of query parameters ending with `;;`
 *     e.g. size=90&gap=5&radius=8&shadow=false&border=true;;
 *   - Remaining lines: markdown image syntax  ![alt](/vault/path)
 *                      OR bare vault paths     /assets/foo.webp
 */
function parseImgsBlock(raw: string): ImgsBlock {
  // border defaults on; only an explicit `border=false` turns it off.
  const config: ImgsConfig = { border: true, shadow: false };
  const paths: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Config line: ends with `;;`
    if (trimmed.endsWith(";;")) {
      const params = trimmed.slice(0, -2); // strip trailing ;;
      for (const pair of params.split("&")) {
        const [key, val] = pair.split("=").map(s => s.trim().toLowerCase());
        if (key === "border") config.border = val === "true";
        if (key === "shadow") config.shadow = val === "true";
      }
      continue;
    }

    // Markdown image: ![alt](/path)  or  ![alt](path)
    const mdMatch = trimmed.match(/^!\[.*?\]\(([^)]+)\)$/);
    if (mdMatch) {
      paths.push(mdMatch[1].replace(/^\//, ""));
      continue;
    }

    // Bare path fallback: /assets/foo.webp  or  assets/foo.webp
    if (trimmed.startsWith("/") || trimmed.includes(".")) {
      paths.push(trimmed.replace(/^\//, ""));
    }
  }

  return { config, paths };
}

/* ── imgs code-block renderer ───────────────────────────────────────────── */

/**
 * Find all `code.language-imgs` blocks (image-cluster syntax), resolve each
 * path to a vault TFile, register it in `images`, and replace the
 * `<pre><code>` with a `<div class="imgs-gallery">` of thumbnails pointing
 * to the exported `images/{name}` paths.
 *
 * Plain images become `<img>`. Videos (`VIDEO_EXTENSIONS`) become a
 * `div.imgs-video-item` wrapping a muted, controls-less `<video>` (so only
 * its first frame shows, never autoplaying inline) plus a play-badge
 * overlay — the lightbox script in `page-template.ts` is what actually
 * plays them, once the user clicks through to preview.
 *
 * Applies `data-border` and `data-shadow` attributes to the gallery div
 * so CSS can style thumbnails accordingly.
 */
export function processImgsBlocks(
  app: App,
  sourceFile: TFile,
  el: HTMLElement,
  images: Map<string, TFile>
): void {
  el.querySelectorAll<HTMLElement>("code.language-imgs").forEach(code => {
    const pre = code.closest("pre") ?? code.parentElement;
    if (!pre) return;

    const { config, paths } = parseImgsBlock(code.textContent ?? "");

    const gallery = createDiv({ cls: "imgs-gallery" });
    if (config.border) gallery.dataset.border = "true";
    if (config.shadow) gallery.dataset.shadow = "true";

    for (const vaultPath of paths) {
      const imgFile =
        app.vault.getAbstractFileByPath(vaultPath) ??
        app.metadataCache.getFirstLinkpathDest(vaultPath, sourceFile.path);

      const extension = imgFile instanceof TFile ? imgFile.extension : extensionOf(vaultPath);
      const isVideo = VIDEO_EXTENSIONS.has(extension.toLowerCase());
      const src = imgFile instanceof TFile ? `images/${registerImage(imgFile, images)}` : vaultPath;

      if (isVideo) {
        const item = createDiv({ cls: "imgs-video-item" });
        const video = createEl("video");
        video.setAttribute("muted", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("preload", "metadata");
        video.setAttribute("src", src);
        item.appendChild(video);
        const badge = createSpan({ cls: "imgs-play-badge" });
        badge.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
        item.appendChild(badge);
        gallery.appendChild(item);
      } else {
        const img = createEl("img");
        img.setAttribute("src", src);
        img.setAttribute("alt", imgFile instanceof TFile ? imgFile.name : vaultPath);
        gallery.appendChild(img);
      }
    }

    pre.replaceWith(gallery);
  });
}
