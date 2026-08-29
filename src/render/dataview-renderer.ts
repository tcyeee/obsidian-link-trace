import { App, TFile } from "obsidian";

/* ── Dataview plugin API access ───────────────────────────────────────────
   Dataview (https://github.com/blacksmithgu/obsidian-dataview) is a community
   plugin, not a core Obsidian feature (unlike Bases — see base-renderer.ts),
   so it exposes a genuine query engine at `app.plugins.plugins.dataview.api`
   when installed and enabled. We lean on that real engine instead of
   re-implementing DQL: `queryMarkdown()` runs a query and hands back the
   result already formatted as markdown (a table/list/task list), which we
   splice back into the note and let the normal render pass turn into HTML —
   this keeps styling, internal-link resolution etc. identical to the rest of
   the page. Only the minimal surface we use is typed here. ──────────────── */

interface DataviewQueryResult {
  successful: boolean;
  value?: string;
  error?: string;
}

interface DataviewApi {
  queryMarkdown(
    source: string,
    originFile?: string,
    settings?: unknown
  ): Promise<DataviewQueryResult>;
}

/** Look up the installed Dataview plugin's API, or null if not installed/enabled. */
function getDataviewApi(app: App): DataviewApi | null {
  const plugins = (
    app as unknown as { plugins?: { plugins?: Record<string, { api?: DataviewApi }> } }
  ).plugins?.plugins;
  return plugins?.["dataview"]?.api ?? null;
}

/**
 * Matches a fenced ```dataview code block. Capture group 1 is the fence
 * (backtick run, so a closing fence of the same length is required); group 2
 * is the raw query source. Mirrors INLINE_BASE_RE in base-renderer.ts.
 */
const DATAVIEW_RE = /^(`{3,})dataview[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gim;

/**
 * Replace every ```dataview code block with a data-dataview-query placeholder
 * carrying the base64-encoded query source. Running the query needs the real
 * (async) Dataview API, so it's resolved later via DOM post-processing in
 * renderNote — mirrors the ```base inline-block placeholder pattern in
 * base-renderer.ts's resolveInlineBaseBlocks.
 */
export function resolveDataviewBlocks(content: string): string {
  return content.replace(DATAVIEW_RE, (_match, _fence: string, source: string) => {
    const encoded = Buffer.from(source, "utf-8").toString("base64");
    return `\n\n<div data-dataview-query="${encoded}"></div>\n\n`;
  });
}

/**
 * Run a Dataview query and return its result as markdown text, via the
 * plugin's own `queryMarkdown` so tables/lists/tasks match Dataview's real
 * formatting. Returns null when the Dataview plugin isn't installed/enabled;
 * the caller falls back to showing the raw query as a code block.
 */
export async function runDataviewQuery(
  app: App,
  source: string,
  originFile: TFile
): Promise<string | null> {
  const api = getDataviewApi(app);
  if (!api) return null;
  try {
    const result = await api.queryMarkdown(source, originFile.path);
    if (result.successful && result.value !== undefined) return result.value;
    return `> [!error] Dataview\n> ${(result.error ?? "query failed").replace(/\n/g, "\n> ")}`;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return `> [!error] Dataview\n> ${message.replace(/\n/g, "\n> ")}`;
  }
}
