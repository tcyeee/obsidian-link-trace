/* Static page styling for exported/published HTML. */

export const THEME = "#65A692";

/* ── CSS ───────────────────────────────────────────────────────────────── */
export function buildCss(): string {
  return `/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; }

/* ── Page ── */
body {
  margin: 0;
  padding: 2rem 1rem;
  background: #fff;
  font-family: "Chinese Quote", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.74;
  color: #262626;
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;
  letter-spacing: 0.008em;
  word-break: break-word;
  word-wrap: break-word;
  font-variant-ligatures: none;
  text-indent: 0;
}

/* ── TOC sidebar (desktop: fixed to viewport left) ── */
.toc-sidebar {
  position: fixed;
  left: 1.5rem;
  top: 2rem;
  width: 180px;
  max-height: calc(100vh - 4rem);
  overflow-y: auto;
  font-size: 13px;
  z-index: 50;
}
.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.toc-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #aaa;
}
.toc-close { display: none; }
.toc-toggle { display: none; }
.toc-backdrop { display: none; }
.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.toc-item { margin: 0; }
.toc-link {
  display: block;
  padding: 3px 8px;
  color: #888;
  font-size: 12.5px;
  text-decoration: none;
  line-height: 1.45;
  border-left: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toc-link:hover { color: #444; text-decoration: none; }
.toc-link.is-active { color: ${THEME}; border-left-color: ${THEME}; }
.toc-h2 .toc-link { padding-left: 8px; }
.toc-h3 .toc-link { padding-left: 20px; font-size: 12px; }
.toc-h4 .toc-link { padding-left: 32px; font-size: 11.5px; color: #aaa; }

/* ── TOC hidden on narrow desktop ── */
@media (max-width: 1199px) {
  /* Sidebar becomes a slide-in drawer */
  .toc-sidebar {
    left: 0;
    top: 0;
    width: 280px;
    height: 100dvh;
    max-height: none;
    background: #fff;
    box-shadow: none;
    transform: translateX(-100%);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.28s;
    z-index: 200;
    overflow-y: auto;
    padding: 0;
  }
  .toc-sidebar.is-open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15); }
  .toc-header {
    position: sticky;
    top: 0;
    background: #fff;
    padding: 1.1rem 1rem 0.8rem;
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 0;
  }
  #toc-inner { padding: 0.75rem 1rem; }
  .toc-title { font-size: 12px; color: #555; }
  .toc-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px; height: 28px;
    background: none;
    border: none;
    cursor: pointer;
    color: #aaa;
    padding: 0;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .toc-close:hover { background: #f5f5f5; color: #555; }
  /* Mobile toggle button */
  .toc-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    left: 1rem;
    bottom: 1.5rem;
    width: 44px; height: 44px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 50%;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    z-index: 150;
    color: #555;
    padding: 0;
  }
  .toc-toggle:active { background: #f5f5f5; }
  /* Backdrop */
  .toc-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 199;
    display: none;
  }
  .toc-backdrop.is-visible { display: block; }
}

/* ── Content container ── */
.markdown-preview-view {
  max-width: 780px;
  margin: 0 auto;
  padding: 2.5rem 3rem;
}

/* ── Mobile content padding ── */
@media (max-width: 600px) {
  body { padding: 0; }
  .markdown-preview-view { padding: 1.5rem 1.25rem; }
}

/* ── Headings ── */
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: 1.3;
  margin: 1.5em 0 0.5em;
}
h1 { font-size: 1.75em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.15em; }
h4, h5, h6 { font-size: 1em; }

/* ── Paragraph ── */
p { margin: 0.8em 0; }

/* ── Links ── */
a {
  color: ${THEME};
  font-size: 0.9rem;
  text-decoration: none;
}
a:hover { text-decoration: underline; }
a:not(.internal-link):not(.footnote-backref)[href^="http"]::after {
  content: '↗';
  font-size: 0.65em;
  margin-left: 2px;
  opacity: 0.7;
  vertical-align: super;
}

/* ── Highlight ── */
mark { background: #FCEDB5; color: inherit; border-radius: 2px; padding: 0 2px; }

/* ── Inline code ── */
:not(pre) > code {
  font-family: "SF Mono", "Fira Code", Menlo, Courier, monospace;
  font-size: 0.8em;
  color: #347698;
  background: #F3F3F3;
  padding: 0.15em 0.4em;
  border-radius: 4px;
}

/* ── Code block ── */
pre {
  position: relative;
  background: #f8f8f8;
  border: 1px solid #DADCDE;
  border-radius: 5px;
  padding: 1rem 1.2rem;
  overflow: auto;
  font-size: 13px;
  line-height: 1.5;
}
pre code {
  font-family: "SF Mono", "Fira Code", Menlo, Courier, monospace;
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
  border-radius: 0;
}

/* ── pre wrapper (allows label to escape overflow:auto clipping) ── */
.pre-wrapper { position: relative; min-width: 0; max-width: 100%; }

/* ── Code language label ── */
.code-lang {
  position: absolute;
  bottom: 8px; right: 12px;
  font-size: 11px;
  font-family: "SF Mono", Menlo, Courier, monospace;
  color: #bbb;
  text-transform: lowercase;
  user-select: none;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.pre-wrapper:hover .code-lang { opacity: 1; }

/* ── Copy button ── */
.copy-btn {
  position: absolute;
  top: 8px; right: 8px;
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #DADCDE;
  border-radius: 5px;
  cursor: pointer;
  color: #888;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0;
}
.pre-wrapper:hover .copy-btn { opacity: 1; }
.copy-btn:hover { background: #f0f0f0; color: #444; }

/* ── Syntax highlighting (Prism GitHub light) ── */
.token.comment, .token.prolog, .token.doctype, .token.cdata, .token.shebang { color: #6e7781; font-style: italic; font-weight: normal; }
.token.string, .token.attr-value, .token.char, .token.inserted { color: #0a3069; }
.token.punctuation, .token.operator { color: #24292f; }
.token.number, .token.boolean, .token.variable, .token.constant, .token.regex { color: #0550ae; }
.token.keyword, .token.atrule, .token.attr-name { color: #cf222e; }
.token.function, .token.class-name, .token.builtin { color: #8250df; }
.token.tag, .token.selector, .token.property { color: #116329; }
.token.deleted { color: #82071e; background: #ffebe9; }
.token.important, .token.bold { font-weight: bold; }
.token.italic { font-style: italic; }

/* ── Block math ── */
.math-d {
  display: block;
  text-align: center;
  margin: 1.2em 0;
  overflow-x: auto;
}
.math-i { display: inline; }

/* ── Blockquote ── */
blockquote {
  position: relative;
  margin: 1em 0;
  padding: 0.8rem 1rem 0.8rem 1.3rem;
  background: rgba(101, 166, 146, 0.05);
  border-radius: 6px;
  border: none;
}
blockquote::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  width: 0.3rem;
  background: ${THEME};
  border-radius: 6px 0 0 6px;
}
blockquote p { color: #81888D; font-size: 14px; margin: 0; }

/* ── Task list ── */
.contains-task-list { list-style: none; padding-left: 0.25em; }
.task-list-item { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.5em; margin: 0.3em 0; }
/* Loose lists wrap item text in a block <p>; let it fill the remaining row width
   and wrap its text internally, instead of its max-content width bumping the
   whole block onto a new flex line (which would strand the checkbox alone). */
.task-list-item > p { flex: 1 1 0; min-width: 0; }
.task-list-item > ul, .task-list-item > ol { flex: 0 0 100%; padding-left: 1.5em; margin: 0.2em 0 0; }
/* A code block nested in a task item is wrapped in .pre-wrapper (a flex item).
   Without min-width:0 its non-wrapping min-content (longest code line) becomes the
   flex floor and bumps the whole row wider than the viewport — horizontal page
   scroll on narrow screens. Pin it to its own full-width line and let it shrink so
   the inner pre's overflow:auto handles long lines. */
.task-list-item > .pre-wrapper, .task-list-item > pre { flex: 0 0 100%; min-width: 0; }
.task-list-item-checkbox {
  -webkit-appearance: none;
  appearance: none;
  flex-shrink: 0;
  width: 14px; height: 14px;
  border: 1.5px solid ${THEME};
  border-radius: 3px;
  background: #fff;
  cursor: default;
  pointer-events: none;
  translate: 0 1px;
}
.task-list-item-checkbox:checked {
  background-color: ${THEME};
  border-color: ${THEME};
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 10 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='1,4 3.5,7 9,1' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size: 72%;
  background-position: center;
  background-repeat: no-repeat;
}
.task-list-item.is-checked > *:not(.task-list-item-checkbox):not(ul):not(ol) { color: #aaa; text-decoration: line-through; }

/* ── Lists ── */
ul, ol { padding-left: 1.5em; margin: 0.8em 0; }
li { margin: 0.3em 0; }
/* A blank line inside a list makes it "loose": each item's text is wrapped in a
   <p> whose margins open a large gap. Collapse them so it renders like a normal
   tight list (matching standard markdown), keeping separation only between
   multiple paragraphs in the same item. */
li > p { margin: 0; }
li > p + p { margin-top: 0.5em; }
/* Hide stray empty paragraphs left by blank lines. */
p:empty { display: none; }

/* ── Table ── */
.table-wrapper {
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid #DADCDE;
  margin: 1em 0;
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { background: #F3F9F7; border-bottom: 1px solid #DADCDE; }
th, td { color: rgb(107, 107, 107); padding: 7px 13px; border-left: 1px solid #DADCDE; }
th { font-weight: 700; }
th:first-child, td:first-child { border-left: none; }
tbody tr { border-bottom: 1px solid #DADCDE; }
tbody tr:last-child { border-bottom: none; }
tbody tr:nth-child(even) { background: rgba(101, 166, 146, 0.03); }

/* ── Callout ── */
.callout {
  border-radius: 6px;
  margin: 1em 0;
  overflow: hidden;
  border-left: 4px solid ${THEME};
  background: rgba(101, 166, 146, 0.05);
}
.callout-title {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px;
  background: rgba(101, 166, 146, 0.1);
  font-weight: 600; font-size: 0.9em;
  color: ${THEME};
}
.callout-icon { display: flex; align-items: center; flex-shrink: 0; }
.callout-icon svg {
  width: 16px; height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.callout-title-inner { flex: 1; }
.callout-fold {
  margin-left: auto;
  opacity: 0.5;
  display: flex; align-items: center;
  transition: transform 0.2s ease;
}
.callout-fold svg { width: 14px; height: 14px; }
.callout.is-collapsed .callout-fold { transform: rotate(-90deg); }
.callout-content {
  padding: 10px 14px;
  font-size: 0.9rem;
  color: inherit;
  overflow: hidden;
  max-height: 4000px;
  opacity: 0.85;
  transition: max-height 0.35s ease, opacity 0.25s ease, padding 0.3s ease;
}
.callout.is-collapsed .callout-content {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.callout-content > p:first-child { margin-top: 0; }
.callout-content > p:last-child { margin-bottom: 0; }

.callout[data-callout="warning"],
.callout[data-callout="caution"],
.callout[data-callout="attention"] { border-left-color: #E6AC44; background: rgba(230,172,68,0.05); }
.callout[data-callout="warning"] .callout-title,
.callout[data-callout="caution"] .callout-title,
.callout[data-callout="attention"] .callout-title { background: rgba(230,172,68,0.1); color: #E6AC44; }

.callout[data-callout="danger"],.callout[data-callout="error"],
.callout[data-callout="failure"],.callout[data-callout="fail"],
.callout[data-callout="missing"],.callout[data-callout="bug"] { border-left-color: #E06C75; background: rgba(224,108,117,0.05); }
.callout[data-callout="danger"] .callout-title,.callout[data-callout="error"] .callout-title,
.callout[data-callout="failure"] .callout-title,.callout[data-callout="fail"] .callout-title,
.callout[data-callout="missing"] .callout-title,.callout[data-callout="bug"] .callout-title { background: rgba(224,108,117,0.1); color: #E06C75; }

.callout[data-callout="info"],.callout[data-callout="abstract"],
.callout[data-callout="summary"],.callout[data-callout="tldr"],.callout[data-callout="todo"] { border-left-color: #4A90D9; background: rgba(74,144,217,0.05); }
.callout[data-callout="info"] .callout-title,.callout[data-callout="abstract"] .callout-title,
.callout[data-callout="summary"] .callout-title,.callout[data-callout="tldr"] .callout-title,
.callout[data-callout="todo"] .callout-title { background: rgba(74,144,217,0.1); color: #4A90D9; }

.callout[data-callout="example"] { border-left-color: #7B8CDE; background: rgba(123,140,222,0.05); }
.callout[data-callout="example"] .callout-title { background: rgba(123,140,222,0.1); color: #7B8CDE; }

.callout[data-callout="quote"],.callout[data-callout="cite"] { border-left-color: #999; background: rgba(153,153,153,0.05); }
.callout[data-callout="quote"] .callout-title,.callout[data-callout="cite"] .callout-title { background: rgba(153,153,153,0.1); color: #888; }

/* ── Footnote ref ── */
.footnote-ref a, sup.footnote-ref a { color: ${THEME}; font-size: 0.8em; }

/* ── Footnote content ── */
.footnotes { margin-top: 2em; padding-top: 1em; }
.footnotes > hr { display: none; }
.footnotes ol { padding-left: 1.5em; }
.footnotes li, .footnotes p { font-size: 0.75rem; color: #666; margin: 0.3em 0; }
.footnote-backref { color: #bbb !important; font-size: 0.75em; margin-left: 4px; }
.footnote-backref:hover { color: ${THEME} !important; }

/* ── HR ── */
hr { border: none; border-top: 1px dashed #DADCDE; margin: 1.5em 0; }

/* ── Image ── */
img { max-width: 100%; border-radius: 4px; }

/* ── Imgs gallery ── */
.imgs-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 1em 0;
}
.imgs-gallery img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
  cursor: zoom-in;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.imgs-gallery img:hover { opacity: 0.85; }
.imgs-gallery[data-border="true"] img { border: 1px solid #DADCDE; }
.imgs-gallery[data-shadow="true"] img { box-shadow: 0 2px 8px rgba(0,0,0,0.18); }

/* ── Lightbox ── */
.lightbox {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}
.lightbox.is-open { display: flex; }
.lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: default;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

/* ── Mermaid ── */
.mermaid {
  text-align: center;
  margin: 1.2em 0;
}
/* 所有 mermaid SVG 允许 viewBox 外的文字标签可见，防止节点边缘文字被裁断 */
.mermaid svg {
  overflow: visible;
}
/* 溢出块两种状态共用：横向滚动容器，滚动条完全隐藏 */
.mermaid.mermaid-overflows {
  overflow-x: auto;
  scrollbar-width: none;
}
.mermaid.mermaid-overflows::-webkit-scrollbar {
  display: none;
}
/* fit-view 默认态：SVG 缩放至容器宽度
   - 不加 overflow-x:hidden，SVG width:100% 已不会溢出，加了反而裁断边缘文字
   - overflow:visible 让 SVG viewport 不裁断 viewBox 外侧的文字标签 */
.mermaid.mermaid-fit-view {
  cursor: zoom-in;
}
.mermaid.mermaid-fit-view svg {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  overflow: visible !important;
}
/* 展开态：cursor 提示可收回 */
.mermaid.mermaid-overflows:not(.mermaid-fit-view) {
  cursor: zoom-out;
}

/* ── Misc ── */
strong { font-weight: 600; }
em { font-style: italic; }

/* ── Base embed ── */
.base-empty { color: #aaa; font-size: 13px; margin: 0.8em 0; }
.base-error { color: #E06C75; font-size: 13px; margin: 0.8em 0; }
.base-link  { color: ${THEME}; text-decoration: none; font-size: inherit; }
.base-link:hover { text-decoration: underline; }

/* ── Base cards / list view ── */
.base-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 1em 0;
}
.base-card {
  border: 1px solid #DADCDE;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.base-card-banner {
  display: block;
  width: 100%;
  object-fit: cover;
  flex-shrink: 0;
}
.base-card-body {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.base-card-row {
  font-size: 0.88em;
  line-height: 1.45;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Base list view ── */
.base-list {
  margin: 1em 0;
  padding-left: 1.5em;
}
.base-list-plain {
  list-style: none;
  padding-left: 0;
}
.base-list-item {
  font-size: 0.9em;
  line-height: 1.6;
  color: #333;
  margin: 0.25em 0;
}
.base-list-sub {
  padding-left: 1.2em;
  color: #666;
}

/* ── Dataview list ── */
ul.dv-list { padding-left: 1.5em; margin: 0.5em 0; }
ul.dv-list li { margin: 0.25em 0; line-height: 1.6; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-thumb { background: transparent; border-radius: 999px; transition: background 0.3s; }
body:hover ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); }
::-webkit-scrollbar-track { background: transparent; }
`;
}
