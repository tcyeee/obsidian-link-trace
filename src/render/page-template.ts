import { getGoatCounterScriptTag, type GoatCounterInjectConfig } from "../analytics/analytics";
import { getLanguage } from "../core/i18n";
import { THEME } from "./page-css";

/* ── HTML builder ──────────────────────────────────────────────────────── */

/** jsdelivr fallback, used for local export where no OSS base is available. */
const KATEX_CDN_BASE = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist";

/** True if the rendered body contains KaTeX math placeholders. */
export function containsMath(htmlBody: string): boolean {
  return /class="math-[di]"/.test(htmlBody);
}

/**
 * Build the full HTML page. `katexBase` is the directory that hosts
 * katex.min.css / katex.min.js (e.g. a self-hosted OSS path); when omitted it
 * falls back to the jsdelivr CDN. KaTeX assets are referenced only when the
 * page actually contains math, so math-free pages load nothing extra.
 */
export function buildHtml(title: string, htmlBody: string, css: string, katexBase?: string, analytics?: GoatCounterInjectConfig): string {
  const svgCopy = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const svgCheck = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${THEME}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  // Minimal Lucide SVG paths for common callout types
  const calloutIcons: Record<string, string> = {
    note: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>`,
    info: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
    tip: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
    warning: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    danger: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
    success: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
    question: `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    bug: `<path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>`,
    example: `<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>`,
    quote: `<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>`,
    abstract: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    todo: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
  };
  const calloutAliases: Record<string, string> = {
    caution: "warning", attention: "warning",
    error: "danger", failure: "danger", fail: "danger", missing: "danger",
    check: "success", done: "success",
    help: "question", faq: "question",
    hint: "tip", important: "tip",
    summary: "abstract", tldr: "abstract",
    cite: "quote",
  };

  const iconsJson = JSON.stringify(calloutIcons);
  const aliasJson = JSON.stringify(calloutAliases);

  const base = katexBase ?? KATEX_CDN_BASE;
  const hasMath = containsMath(htmlBody);
  const katexCssTag = hasMath
    ? `\n  <link rel="stylesheet" href="${base}/katex.min.css">`
    : "";
  const katexJsTag = hasMath
    ? `\n  <script src="${base}/katex.min.js"></script>`
    : "";
  const analyticsTag = analytics ? `\n  ${getGoatCounterScriptTag(analytics)}` : "";

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>${katexCssTag}${analyticsTag}
  <style>${css}</style>
</head>
<body>
  <button class="toc-toggle" id="toc-toggle" title="OUTLINE">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  </button>
  <div class="toc-backdrop" id="toc-backdrop"></div>
  <div class="lightbox" id="lightbox"><img id="lightbox-img" src="" alt=""></div>
  <nav class="toc-sidebar" id="toc-sidebar">
    <div class="toc-header">
      <span class="toc-title">OUTLINE</span>
      <button class="toc-close" id="toc-close" title="关闭">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="toc-inner"></div>
  </nav>
  <div class="markdown-preview-view">
${htmlBody}
  </div>

${katexJsTag}
  <script>
    (function() {
      var COPY_ICON  = '${svgCopy}';
      var CHECK_ICON = '${svgCheck}';
      var ICONS   = ${iconsJson};
      var ALIASES = ${aliasJson};

      /* ── KaTeX math ── */
      document.querySelectorAll('.math-d').forEach(function(el) {
        try { katex.render(el.textContent.trim(), el, { displayMode: true,  throwOnError: false }); } catch(e) {}
      });
      document.querySelectorAll('.math-i').forEach(function(el) {
        try { katex.render(el.textContent.trim(), el, { displayMode: false, throwOnError: false }); } catch(e) {}
      });

      /* ── Callout icons ── */
      document.querySelectorAll('.callout').forEach(function(callout) {
        var iconEl = callout.querySelector('.callout-icon');
        if (!iconEl) return;
        var hasSvg = iconEl.querySelector('svg') && iconEl.querySelector('svg').childElementCount > 0;
        if (hasSvg) return;
        var type = (callout.getAttribute('data-callout') || 'note').toLowerCase();
        type = ALIASES[type] || type;
        var paths = ICONS[type] || ICONS['note'];
        iconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
      });

      /* ── Callout fold/unfold ── */
      document.querySelectorAll('.callout').forEach(function(callout) {
        var hasFold = callout.hasAttribute('data-callout-fold') ||
                      callout.classList.contains('is-collapsed');
        if (!hasFold) return;
        var title   = callout.querySelector('.callout-title');
        var content = callout.querySelector('.callout-content');
        if (!title) return;

        // Clear any inline display:none Obsidian may have set — CSS handles visibility
        if (content) content.style.display = '';

        title.style.cursor = 'pointer';
        title.addEventListener('click', function() {
          callout.classList.toggle('is-collapsed');
        });
      });

      /* ── Code block: language label (via wrapper) + copy button ── */
      document.querySelectorAll('pre').forEach(function(pre) {
        var code = pre.querySelector('code');

        // Wrap pre so label can escape pre's overflow:auto clipping
        var wrapper = document.createElement('div');
        wrapper.className = 'pre-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        // Language label — attached to wrapper, not pre
        if (code) {
          var m = code.className.match(/language-(\\S+)/);
          if (m && m[1] && m[1] !== 'undefined' && m[1] !== 'text') {
            var label = document.createElement('span');
            label.className = 'code-lang';
            label.textContent = m[1];
            wrapper.appendChild(label);
          }
        }

        // Copy button — stays inside pre (positioned relative to pre)
        var btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.title = '复制代码';
        btn.innerHTML = COPY_ICON;
        pre.appendChild(btn);
        btn.addEventListener('click', function() {
          navigator.clipboard.writeText(code ? code.innerText : pre.innerText).then(function() {
            btn.innerHTML = CHECK_ICON;
            setTimeout(function() { btn.innerHTML = COPY_ICON; }, 2000);
          });
        });
      });
    })();

    /* ── TOC generation ── */
    (function() {
      var sidebar  = document.getElementById('toc-sidebar');
      var tocInner = document.getElementById('toc-inner');
      if (!sidebar || !tocInner) return;

      var headings = Array.prototype.slice.call(
        document.querySelectorAll('.markdown-preview-view h1, .markdown-preview-view h2, .markdown-preview-view h3, .markdown-preview-view h4')
      );
      if (headings.length < 2) {
        sidebar.style.display = 'none';
        var tog = document.getElementById('toc-toggle');
        if (tog) tog.style.display = 'none';
        return;
      }

      // Ensure each heading has an id
      headings.forEach(function(h, i) {
        if (!h.id) h.id = 'toc-h-' + i;
      });

      // Build list
      var ul = document.createElement('ul');
      ul.className = 'toc-list';
      headings.forEach(function(h) {
        var li = document.createElement('li');
        li.className = 'toc-item toc-' + h.tagName.toLowerCase();
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.className = 'toc-link';
        a.textContent = h.textContent.replace(/¶$/, '').trim(); // strip Obsidian ¶
        a.addEventListener('click', function(e) {
          e.preventDefault();
          document.getElementById(h.id).scrollIntoView({ behavior: 'smooth' });
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      tocInner.appendChild(ul);

      // Active link tracking
      var links = tocInner.querySelectorAll('.toc-link');
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            links.forEach(function(l) { l.classList.remove('is-active'); });
            var active = tocInner.querySelector('[href="#' + entry.target.id + '"]');
            if (active) active.classList.add('is-active');
          }
        });
      }, { rootMargin: '-8% 0px -80% 0px', threshold: 0 });
      headings.forEach(function(h) { observer.observe(h); });

      // Close drawer on link click (mobile)
      tocInner.querySelectorAll('.toc-link').forEach(function(a) {
        a.addEventListener('click', function() {
          sidebar.classList.remove('is-open');
          document.getElementById('toc-backdrop').classList.remove('is-visible');
          document.body.style.overflow = '';
        });
      });
    })();

    /* ── Imgs lightbox ── */
    (function() {
      var lightbox = document.getElementById('lightbox');
      var lbImg    = document.getElementById('lightbox-img');
      if (!lightbox || !lbImg) return;
      document.querySelectorAll('.imgs-gallery img').forEach(function(img) {
        img.addEventListener('click', function(e) {
          e.stopPropagation();
          lbImg.setAttribute('src', img.getAttribute('src'));
          lbImg.setAttribute('alt', img.getAttribute('alt') || '');
          lightbox.classList.add('is-open');
          document.body.style.overflow = 'hidden';
        });
      });
      lightbox.addEventListener('click', function(e) {
        if (e.target === lbImg) return; // click on image itself does nothing
        lightbox.classList.remove('is-open');
        document.body.style.overflow = '';
        lbImg.setAttribute('src', '');
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          lightbox.classList.remove('is-open');
          document.body.style.overflow = '';
          lbImg.setAttribute('src', '');
        }
      });
    })();

    /* ── Mermaid zoom toggle ── */
    (function() {
      document.querySelectorAll('.mermaid').forEach(function(block) {
        var svg = block.querySelector('svg');
        if (!svg) return;

        // 修正节点宽度不足：mermaid 在计算节点尺寸时漏掉了约 20px 的 padding，
        // 导致 rect（节点框）和 foreignObject（文字容器）都偏窄 20px。
        // foreignObject 会裁断超出其宽度的 HTML 内容（与 SVG overflow:visible 无关），
        // 必须直接修正 width。同时将 label 组左移 10px 以保持居中，rect 也同步扩宽。
        (function() {
          var EXTRA = 20;
          svg.querySelectorAll('foreignObject').forEach(function(fo) {
            var fw = parseFloat(fo.getAttribute('width') || '0');
            if (fw <= 0) return;
            fo.setAttribute('width', String(fw + EXTRA));
            // 将 label 父组左移 EXTRA/2，保持文字在节点内居中
            var labelG = fo.parentElement;
            if (labelG && labelG !== svg && labelG.getAttribute) {
              var tr = labelG.getAttribute('transform') || '';
              var ti = tr.indexOf('translate(');
              if (ti >= 0) {
                var te = tr.indexOf(')', ti);
                if (te > ti) {
                  var coords = tr.slice(ti + 10, te).split(',');
                  if (coords.length >= 2) {
                    labelG.setAttribute('transform',
                      tr.slice(0, ti) + 'translate(' +
                      (parseFloat(coords[0]) - EXTRA / 2) + ',' +
                      parseFloat(coords[1]) + ')' +
                      tr.slice(te + 1));
                  }
                }
              }
            }
          });
          svg.querySelectorAll('rect.label-container').forEach(function(rect) {
            var rw = parseFloat(rect.getAttribute('width') || '0');
            var rx = parseFloat(rect.getAttribute('x') || '0');
            if (rw <= 0) return;
            rect.setAttribute('width', String(rw + EXTRA));
            rect.setAttribute('x', String(rx - EXTRA / 2));
          });
        })();

        // 修正 viewBox 裁断：mermaid 用 canvas 测量文字宽度，实际渲染可能稍宽，
        // 导致最后一个字符被 viewBox 边界裁断。用 getBBox() 测量实际内容边界，
        // 按需扩展 viewBox，并同步更新 width/max-width，保持 1:1 比例。
        (function() {
          var vbStr = svg.getAttribute('viewBox');
          if (!vbStr) return;
          var parts = vbStr.trim().replace(/,/g, ' ').split(' ').filter(Boolean).map(parseFloat);
          if (parts.length < 4 || isNaN(parts[2]) || isNaN(parts[3])) return;
          var minPadW = 8, minPadH = 4;
          var extraW = minPadW, extraH = 0;
          try {
            var bbox = svg.getBBox();
            var vbRight  = parts[0] + parts[2];
            var vbBottom = parts[1] + parts[3];
            var overflowW = Math.ceil(bbox.x + bbox.width  + minPadW - vbRight);
            var overflowH = Math.ceil(bbox.y + bbox.height + minPadH - vbBottom);
            if (overflowW > extraW) extraW = overflowW;
            if (overflowH > 0)      extraH = overflowH;
          } catch(e) {}
          if (extraW > 0) {
            parts[2] += extraW;
            var wAttr = parseFloat(svg.getAttribute('width') || '0');
            if (wAttr > 0) svg.setAttribute('width', String(wAttr + extraW));
            // 现代 mermaid 用 style.maxWidth 而非 width 属性
            var mwStyle = parseFloat(svg.style.maxWidth || '0');
            if (mwStyle > 0) svg.style.maxWidth = (mwStyle + extraW) + 'px';
          }
          if (extraH > 0) {
            parts[3] += extraH;
            var hAttr = parseFloat(svg.getAttribute('height') || '0');
            if (hAttr > 0) svg.setAttribute('height', String(hAttr + extraH));
          }
          if (extraW > 0 || extraH > 0) svg.setAttribute('viewBox', parts.join(' '));
        })();

        // 读取 SVG 自然像素宽度，按优先级依次尝试三种来源
        var naturalWidth = parseFloat(svg.getAttribute('width') || '0');
        if (!naturalWidth) {
          var vb = svg.getAttribute('viewBox');
          if (vb) {
            var parts = vb.trim().replace(/,/g, ' ').split(' ').filter(Boolean);
            if (parts.length >= 3) naturalWidth = parseFloat(parts[2]);
          }
        }
        if (!naturalWidth) {
          var mw = svg.style.maxWidth;
          if (mw) naturalWidth = parseFloat(mw);
        }
        var containerWidth = block.clientWidth;
        if (!naturalWidth || naturalWidth <= containerWidth + 2) return;
        // 超宽：默认进入 fit-view（缩放适配），CSS 负责 width:100%
        block.classList.add('mermaid-overflows', 'mermaid-fit-view');
        block.addEventListener('click', function() {
          if (block.classList.contains('mermaid-fit-view')) {
            // 展开：必须显式设像素宽，否则 SVG 默认仍是 100% 容器宽，无法滚动
            block.classList.remove('mermaid-fit-view');
            svg.style.setProperty('width', naturalWidth + 'px', 'important');
          } else {
            // 收起：移除内联 width，让 CSS .mermaid-fit-view svg { width:100% } 接管
            block.classList.add('mermaid-fit-view');
            svg.style.removeProperty('width');
          }
        });
      });
    })();

    /* ── TOC mobile toggle ── */
    (function() {
      var toggle   = document.getElementById('toc-toggle');
      var sidebar  = document.getElementById('toc-sidebar');
      var backdrop = document.getElementById('toc-backdrop');
      var closeBtn = document.getElementById('toc-close');
      function openToc()  {
        sidebar.classList.add('is-open');
        backdrop.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
      }
      function closeToc() {
        sidebar.classList.remove('is-open');
        backdrop.classList.remove('is-visible');
        document.body.style.overflow = '';
      }
      if (toggle)   toggle.addEventListener('click', openToc);
      if (backdrop) backdrop.addEventListener('click', closeToc);
      if (closeBtn) closeBtn.addEventListener('click', closeToc);
    })();
  </script>
  <footer class="lt-footer">
    ${getLanguage() === "zh"
      ? `页面由 Obsidian 插件 <a href="https://github.com/tcyeee/obsidian-link-trace" target="_blank" rel="noopener">Link Trace</a> 生成`
      : `Generated by Obsidian plugin <a href="https://github.com/tcyeee/obsidian-link-trace" target="_blank" rel="noopener">Link Trace</a>`}
  </footer>
</body>
</html>`;
}
