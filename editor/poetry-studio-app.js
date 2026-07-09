/* Poetry Studio — Toast UI Editor (Markdown ⇄ WYSIWYG) + Urdu phonetic
 * keyboard + ShakeebJustify shairi rendering + rich background/page controls.
 *
 * Architecture: Toast UI is the *authoring* surface (dual mode). The justified
 * poetry that gets exported as an image is rendered separately in #print-area
 * via preprocessInput → marked → ShakeebJustify, re-run on every change. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  var STORAGE_KEY = "poetryStudioItemsV3";
  var ACTIVE_ITEM_KEY = "poetryStudioActiveItemV3";

  var currentFont = "Payami"; // default; renders Mehr until Payami streams in
  var currentPattern = "sher";
  var currentPageSize = "auto";
  var savedItems = [];
  var activeItemId = null;
  var editor = null;

  var previewEl = document.getElementById("print-area");
  var fontSelector = document.getElementById("fontSelector");
  var fontSizeInput = document.getElementById("fontSizeInput");
  var showCounterToggle = document.getElementById("showCounterToggle");
  var counterModeSelect = document.getElementById("counterModeSelect");
  var paginateHeightToggle = document.getElementById("paginateHeightToggle");
  var titleEl = document.getElementById("poetryTitle");
  var bgEl = document.getElementById("bgInput");
  var colorEl = document.getElementById("colorInput");
  var bgColorPicker = document.getElementById("bgColorPicker");
  var textColorPicker = document.getElementById("textColorPicker");
  var fontUrlEl = document.getElementById("fontUrlInput");
  var fontNameEl = document.getElementById("fontNameInput");
  var savedListEl = document.getElementById("savedPoetryList");
  var importFileInput = document.getElementById("importFileInput");
  var customCssInput = document.getElementById("customCssInput");
  var cssModalEl = document.getElementById("cssModal");
  var sjModalEl = document.getElementById("sjModal");
  var sjFormatSelect = document.getElementById("sjFormatSelect");
  var sjCustomPatternInput = document.getElementById("sjCustomPatternInput");
  var pageSizeSelect = document.getElementById("pageSizeSelect");
  var urduToggle = document.getElementById("urduToggle");

  if (window.marked) marked.setOptions({ breaks: true, gfm: true });

  /* --------------------- Undo / redo (markdown history) ---------------------
     App-level snapshots of the markdown so no action (formatter, alignment,
     new note) can ever silently lose work. Coarse-grained: typing collapses
     into ~0.5s steps; mutations snapshot synchronously. */
  var histPast = [], histFuture = [], histPresent = "", histTimer = null, histRestoring = false;

  function updateUndoButtons() {
    var u = document.getElementById("undoBtn"), r = document.getElementById("redoBtn");
    if (u) u.disabled = !histPast.length;
    if (r) r.disabled = !histFuture.length;
  }
  function histInit() {
    histPresent = getMarkdown();
    histPast = []; histFuture = [];
    updateUndoButtons();
  }
  function histCapture() {
    if (histRestoring) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(function () {
      var md = getMarkdown();
      if (md === histPresent) return;
      histPast.push(histPresent);
      if (histPast.length > 80) histPast.shift();
      histPresent = md; histFuture = [];
      updateUndoButtons();
    }, 500);
  }
  function histRecord() {
    // Commit any pending edit so the pre-mutation state is a clean undo point.
    clearTimeout(histTimer);
    if (histRestoring) return;
    var md = getMarkdown();
    if (md !== histPresent) {
      histPast.push(histPresent);
      if (histPast.length > 80) histPast.shift();
      histPresent = md; histFuture = [];
      updateUndoButtons();
    }
  }
  function applyHist(md) {
    histRestoring = true;
    if (editor) editor.setMarkdown(md);
    renderPreview();
    histRestoring = false;
    updateUndoButtons();
  }
  window.undoEdit = function () {
    clearTimeout(histTimer);
    var md = getMarkdown();
    if (md !== histPresent) { histPast.push(histPresent); histPresent = md; histFuture = []; }
    if (!histPast.length) return;
    histFuture.push(histPresent);
    histPresent = histPast.pop();
    applyHist(histPresent);
  };
  window.redoEdit = function () {
    if (!histFuture.length) return;
    histPast.push(histPresent);
    histPresent = histFuture.pop();
    applyHist(histPresent);
  };

  /* ----------------------------- Editor ----------------------------- */

  function initEditor(initialValue) {
    var host = document.getElementById("editor");
    host.innerHTML = "";
    if (!window.toastui || !toastui.Editor) {
      host.innerHTML =
        '<textarea id="fallbackArea" class="w-full p-3 border rounded-xl text-right" rows="12" placeholder="ہر مصرع الگ لائن میں لکھیں…"></textarea>';
      var ta = document.getElementById("fallbackArea");
      ta.value = initialValue || "";
      ta.addEventListener("input", function () {
        renderPreview();
        autoSave();
      });
      editor = {
        getMarkdown: function () { return ta.value; },
        setMarkdown: function (v) { ta.value = v || ""; },
        insertText: function (t) {
          var s = ta.selectionStart, e = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
          ta.selectionStart = ta.selectionEnd = s + t.length;
          renderPreview();
        },
      };
      return;
    }

    var plugins = [];
    if (toastui.Editor.plugin && toastui.Editor.plugin.colorSyntax) {
      plugins.push(toastui.Editor.plugin.colorSyntax); // colors the selection
    }

    editor = new toastui.Editor({
      el: host,
      height: "420px",
      initialEditType: "markdown",
      previewStyle: "vertical",
      usageStatistics: false,
      // WYSIWYG mode round-trips through Toast UI's own ProseMirror doc
      // model, which has no idea what our [sj]...[/sj] poetry blocks or
      // injected <span style="font-size:..."> HTML mean -- switching into
      // and back out of it mangles them a little more each time. The
      // markdown string is the one source of truth; #print-area below is
      // the only rendered view.
      hideModeSwitch: true,
      initialValue: initialValue || "",
      plugins: plugins,
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol"],
        ["table", "link"],
        ["code", "codeblock"],
      ],
    });

    editor.on("change", function () {
      renderPreview();
      autoSave();
      histCapture();
    });

    editor.on("caretChange", function () {
      updateFontSizeInputFromCursor();
    });

    // Urdu phonetic keyboard. Using Toast's insertText API (not manual textarea
    // splicing) is what makes it reliable — unmapped keys (space, enter,
    // backspace) pass straight through, so they can never eat lines.
    host.addEventListener(
      "keydown",
      function (event) {
        if (!urduToggle.checked) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (typeof keyboardMap === "undefined") return;
        var key = event.key;
        if (!key || key.length !== 1) return; // ignore Enter/Backspace/arrows
        for (var i = 0; i < keyboardMap.length; i++) {
          if (keyboardMap[i][0] === key) {
            event.preventDefault();
            event.stopPropagation();
            editor.insertText(keyboardMap[i][1]);
            return;
          }
        }
      },
      true,
    );
  }

  function getMarkdown() {
    return editor ? editor.getMarkdown() : "";
  }

  /* ----------------------- Poetry preprocessing ----------------------- */

  function preserveEmptyLines(text) {
    var lines = text.split("\n");
    var out = [];
    var blank = 0;
    lines.forEach(function (line) {
      if (line.trim() === "") { blank += 1; return; }
      if (blank > 0) {
        out.push("");
        for (var i = 1; i < blank; i += 1) { out.push(""); out.push("<p>&nbsp;</p>"); out.push(""); }
        blank = 0;
      }
      out.push(line);
    });
    if (blank > 0) {
      out.push("");
      for (var j = 1; j < blank; j += 1) { out.push(""); out.push("<p>&nbsp;</p>"); out.push(""); }
    }
    return out.join("\n");
  }

  function parseSjAttributes(rawTag) {
    var attrs = {};
    var re = /(\w+)=["']([^"']*)["']/g;
    var m = re.exec(rawTag);
    while (m) { attrs[m[1]] = m[2]; m = re.exec(rawTag); }
    return attrs;
  }

  function buildPoetryHtml(lines, patternName, customPattern) {
    var classAttr = patternName ? ' class="sj ' + patternName + '"' : "";
    var patternAttr = !patternName && customPattern ? ' data-pattern="' + customPattern.replace(/"/g, "&quot;") + '"' : "";
    var body = lines
      .map(function (line) {
        if (line.trim() === "") return '<div class="poetry-empty-line">&nbsp;</div>';
        return "<div>" + line.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</div>";
      })
      .join("");
    return "<div" + classAttr + patternAttr + ">" + body + "</div>";
  }

  function preprocessInput(rawText) {
    var lines = rawText.split("\n");
    var chunks = [];
    var buffer = [];
    var poetryBuffer = [];
    var inPoetry = false;
    var meta = null;

    function flush() {
      if (!buffer.length) return;
      chunks.push(preserveEmptyLines(buffer.join("\n")));
      buffer = [];
    }

    lines.forEach(function (line) {
      var trimmed = line.trim();
      var open = trimmed.match(/^\[sj(?:\s+([^\]]+))?\]$/i);
      if (open) {
        flush();
        inPoetry = true;
        poetryBuffer = [];
        var a = parseSjAttributes(open[1] || "");
        meta = { format: typeof a.format !== "undefined" ? a.format : currentPattern, custom: typeof a.custom !== "undefined" ? a.custom : "" };
        return;
      }
      if (trimmed.toLowerCase() === "[/sj]") {
        if (inPoetry) {
          var fmt = meta && meta.format === "custom" ? null : meta ? meta.format : currentPattern;
          var cust = meta && meta.format === "custom" ? meta.custom : meta ? meta.custom : "";
          chunks.push(buildPoetryHtml(poetryBuffer, fmt, cust));
        }
        inPoetry = false; poetryBuffer = []; meta = null;
        return;
      }
      if (inPoetry) poetryBuffer.push(line); else buffer.push(line);
    });

    flush();
    if (inPoetry && poetryBuffer.length) {
      var f2 = meta && meta.format === "custom" ? null : meta ? meta.format : currentPattern;
      var c2 = meta && meta.format === "custom" ? meta.custom : meta ? meta.custom : "";
      chunks.push(buildPoetryHtml(poetryBuffer, f2, c2));
    }
    return chunks.join("\n");
  }

  /* ----------------------------- Pagination ----------------------------- */
  // [page] on its own line is a manual break -- always starts a new card.
  // Within each resulting section, if a fixed page size is chosen AND the
  // height-pagination checkbox is on, content that would overflow that
  // page's exact height automatically continues onto further cards too.
  // Splits only ever happen BETWEEN top-level rendered blocks (a heading, a
  // paragraph, one whole [sj] block, etc.) -- never partway through one, to
  // keep this tractable. A single block taller than one page simply
  // overflows that page's card, same as today's un-paginated behaviour.

  function splitMarkdownOnPageBreaks(markdown) {
    return markdown.split(/^\[page\]\s*$/im);
  }

  function getPageTargetDimensions() {
    if (currentPageSize === "auto") return null;
    var w, h;
    if (currentPageSize === "custom") {
      w = Number(document.getElementById("pageW").value) || 0;
      h = Number(document.getElementById("pageH").value) || 0;
    } else {
      var parts = currentPageSize.split("x");
      w = Number(parts[0]);
      h = Number(parts[1]);
    }
    return w && h ? { width: w, height: h } : null;
  }

  function renderSectionHtml(sectionMarkdown) {
    var prepared = preprocessInput(sectionMarkdown);
    return window.marked ? marked.parse(prepared) : prepared.replace(/\n/g, "<br>");
  }

  // Renders one section into a hidden probe styled exactly like a real page
  // card (same classes/inline styles, so padding/font/line-height all
  // match), fixed to the target height with overflow hidden, then greedily
  // moves top-level blocks out to a new page the moment scrollHeight tips
  // past clientHeight. Returns an array of HTML strings, one per page.
  function paginateSectionByHeight(sectionMarkdown, dims) {
    var html = renderSectionHtml(sectionMarkdown);

    var probe = document.createElement("div");
    probe.className = previewEl.className;
    probe.style.cssText = previewEl.style.cssText;
    probe.style.position = "fixed";
    probe.style.visibility = "hidden";
    probe.style.left = "-99999px";
    probe.style.top = "0";
    probe.style.width = dims.width + "px";
    probe.style.height = dims.height + "px";
    probe.style.maxWidth = "none";
    probe.style.maxHeight = dims.height + "px";
    probe.style.overflow = "hidden";
    probe.style.boxSizing = "border-box";
    document.body.appendChild(probe);
    probe.innerHTML = html;

    // Expand [sj] blocks into their real row/spacer markup before measuring
    // -- a raw, unrendered block's height doesn't reflect its laid-out size.
    if (window.ShakeebJustify) {
      try { ShakeebJustify.apply(); } catch (e) { /* ignore */ }
    }

    var chunks = Array.prototype.slice.call(probe.children);
    probe.innerHTML = "";

    var pages = [];
    chunks.forEach(function (chunk) {
      probe.appendChild(chunk);
      if (probe.scrollHeight > probe.clientHeight + 1 && probe.children.length > 1) {
        probe.removeChild(chunk);
        pages.push(probe.innerHTML);
        probe.innerHTML = "";
        probe.appendChild(chunk);
      }
    });
    if (probe.children.length) pages.push(probe.innerHTML);

    document.body.removeChild(probe);
    return pages.length ? pages : [html];
  }

  function clearExtraPrintPages() {
    Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (el) {
      if (el !== previewEl) el.remove();
    });
  }

  function createExtraPrintPage() {
    var card = document.createElement("div");
    card.className = previewEl.className;
    card.style.cssText = previewEl.style.cssText;
    var host = document.getElementById("previewHost");
    if (host) host.appendChild(card);
    return card;
  }

  function renderPageChrome(cards) {
    cards.forEach(function (card, index) {
      var oldLabel = card.querySelector(".print-page-label");
      var oldBtn = card.querySelector(".print-page-download");
      if (oldLabel) oldLabel.remove();
      if (oldBtn) oldBtn.remove();
      if (cards.length < 2) return;

      card.style.position = "relative";

      var label = document.createElement("div");
      label.className = "print-page-label";
      label.textContent = "Page " + (index + 1) + " / " + cards.length;
      card.appendChild(label);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "print-page-download";
      btn.title = "Download this page";
      btn.innerHTML = '<span class="material-symbols-outlined">download</span>';
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        downloadCardAsImage(card, index + 1);
      });
      card.appendChild(btn);
    });

    var icon = document.getElementById("downloadBtnIcon");
    var btn2 = document.getElementById("downloadBtn");
    if (icon && btn2) {
      icon.textContent = cards.length > 1 ? "folder_zip" : "download";
      btn2.title = cards.length > 1 ? "تمام صفحات ZIP میں ڈاؤن لوڈ کریں" : "تصویر ڈاؤن لوڈ";
    }
  }

  function renderPreview() {
    if (!previewEl) return;
    clearExtraPrintPages();

    var sections = splitMarkdownOnPageBreaks(getMarkdown());
    var dims = getPageTargetDimensions();
    var paginateByHeight = !!(dims && (!paginateHeightToggle || paginateHeightToggle.checked));

    var pagesHtml = [];
    sections.forEach(function (sectionMarkdown) {
      if (paginateByHeight) {
        pagesHtml = pagesHtml.concat(paginateSectionByHeight(sectionMarkdown, dims));
      } else {
        pagesHtml.push(renderSectionHtml(sectionMarkdown));
      }
    });
    if (!pagesHtml.length) pagesHtml = [""];

    previewEl.innerHTML = pagesHtml[0];
    var cards = [previewEl];
    for (var i = 1; i < pagesHtml.length; i += 1) {
      var card = createExtraPrintPage();
      card.innerHTML = pagesHtml[i];
      cards.push(card);
    }

    // Idempotent: paginateSectionByHeight() already rendered its own [sj]
    // blocks (data-sj-rendered="true" makes ShakeebJustify skip them), so
    // this only picks up sections that weren't height-paginated.
    if (window.ShakeebJustify) {
      try { ShakeebJustify.apply(); } catch (e) { /* ignore */ }
    }

    renderPageChrome(cards);
    if (showCounterToggle && showCounterToggle.checked) applyPoetryCounters();
  }

  // Numbers each sher/stanza (a run of .sj-row elements between
  // ShakeebJustify's .sj-spacer group boundaries) rather than each line,
  // continuously across every [sj] block AND every page card -- this runs
  // fresh after every renderPreview() (which rebuilds every card from
  // scratch each time), so there's no accumulation/cleanup to worry about.
  function applyPoetryCounters() {
    var restartPerPage = counterModeSelect && counterModeSelect.value === "new";
    var count = 0;
    Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (page) {
      if (restartPerPage) count = 0;
      Array.prototype.forEach.call(page.querySelectorAll(".sj"), function (block) {
        var inGroup = false;
        Array.prototype.forEach.call(block.children, function (child) {
          if (child.classList.contains("sj-spacer")) {
            inGroup = false;
            return;
          }
          if (!child.classList.contains("sj-row")) return;
          if (inGroup) return;

          inGroup = true;
          count += 1;
          var badge = document.createElement("span");
          badge.className = "sj-counter";
          var number = document.createElement("span");
          number.className = "sj-counter-number";
          number.textContent = count;
          badge.appendChild(number);
          child.insertBefore(badge, child.firstChild);
        });
      });
    });
  }

  /* ----------------------------- Fonts ----------------------------- */

  function fontStack(name) {
    // Always fall back through self-hosted Mehr → serif so something Urdu
    // renders instantly and offline while a heavier face loads.
    var parts = [];
    if (name) parts.push('"' + name + '"');
    if (name !== "Mehr") parts.push('"Mehr"');
    parts.push("serif");
    return parts.join(", ");
  }

  function applyFont() {
    var stack = fontStack(currentFont);
    if (previewEl) previewEl.style.fontFamily = stack;
    // v3 Toast UI uses ProseMirror editables in both markdown & WYSIWYG modes.
    document
      .querySelectorAll(".toastui-editor-contents, .toastui-editor .ProseMirror, #fallbackArea")
      .forEach(function (el) {
        el.style.fontFamily = stack;
      });
  }

  function ensureFontOption(name, label) {
    if (!fontSelector || !name) return;
    var exists = Array.prototype.some.call(fontSelector.options, function (o) { return o.value === name; });
    if (exists) return;
    var opt = document.createElement("option");
    opt.value = name; opt.textContent = label || "کسٹم فونٹ";
    fontSelector.appendChild(opt);
  }

  function registerCustomFont(name, url) {
    if (!name || !url) return;
    var id = "font-" + name.replace(/[^a-z0-9_-]/gi, "_");
    if (!document.getElementById(id)) {
      var style = document.createElement("style");
      style.id = id;
      // local() first → use an installed copy with no network; url() otherwise
      // (browser-cached, and SW-cached for whitelisted CDN hosts).
      style.textContent = "@font-face{font-family:'" + name + "';src:local('" + name + "'),url('" + url + "');font-display:swap;}";
      document.head.appendChild(style);
    }
    ensureFontOption(name, name); // dropdown shows the real name, not "custom"
  }

  // Persistent registry of named custom fonts so they survive reloads, stay in
  // the font dropdown, and re-register (re-cache) automatically each session.
  var CUSTOM_FONTS_KEY = "poetryCustomFontsV1";
  function getCustomFonts() {
    try {
      var a = JSON.parse(localStorage.getItem(CUSTOM_FONTS_KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function rememberCustomFont(name, url) {
    var list = getCustomFonts().filter(function (f) { return f.name !== name; });
    list.push({ name: name, url: url });
    localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(list));
  }
  function registerSavedCustomFonts() {
    getCustomFonts().forEach(function (f) { registerCustomFont(f.name, f.url); });
  }
  function deriveFontName(url) {
    try {
      var file = decodeURIComponent(url.split("/").pop().split("?")[0]);
      return file.replace(/\.(woff2?|ttf|otf|eot)$/i, "").replace(/[-_%]+/g, " ").trim() || "Custom Font";
    } catch (e) { return "Custom Font"; }
  }

  window.loadCustomFont = function () {
    var url = fontUrlEl ? fontUrlEl.value.trim() : "";
    if (!url) return alert("فونٹ کا لنک درج کریں — enter a font URL");
    var name = fontNameEl ? fontNameEl.value.trim() : "";
    if (!name) name = (window.prompt("اس فونٹ کا نام؟ — Name this font:", deriveFontName(url)) || "").trim();
    if (!name) return;
    registerCustomFont(name, url);
    rememberCustomFont(name, url);
    if (fontSelector) fontSelector.value = name;
    currentFont = name;
    if (fontNameEl) fontNameEl.value = "";
    applyFont();
    autoSave();
  };

  /* --------------------------- Appearance --------------------------- */

  function getPreviewCss() {
    var s = [];
    if (bgEl && bgEl.value) s.push("background: " + bgEl.value);
    if (colorEl && colorEl.value) s.push("color: " + colorEl.value);
    s.push("font-family: " + fontStack(currentFont));
    return s.join("; ");
  }

  // The custom-CSS textarea holds real CSS -- selectors, :hover, :before/
  // :after, the lot -- so it goes into an actual <style> element, not
  // folded into #print-area's inline style attribute (which can only ever
  // hold bare declarations and silently ignores anything selector-shaped).
  var customStyleEl = null;
  function applyCustomCss() {
    if (!customCssInput) return;
    if (!customStyleEl) {
      customStyleEl = document.createElement("style");
      customStyleEl.id = "previewCustomStyle";
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = customCssInput.value || "";
  }

  function applyPreviewStyles(save) {
    if (!previewEl) return;
    // Applies to every page card so background/color/font stay consistent
    // across a multi-page document, not just #print-area.
    var css = getPreviewCss();
    Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (card) {
      card.setAttribute("style", css);
    });
    applyPageSize(currentPageSize, false); // re-apply dimensions on top of the CSS just set
    applyCustomCss();
    if (save !== false) autoSave();
  }

  var gradStops = ["#fde2e4", "#e2ecf9"];
  function renderGradStops() {
    var wrap = document.getElementById("gradStops");
    if (!wrap) return;
    wrap.innerHTML = "";
    gradStops.forEach(function (color, i) {
      var box = document.createElement("span");
      box.className = "inline-flex items-center";
      var inp = document.createElement("input");
      inp.type = "color";
      inp.value = color;
      inp.addEventListener("input", function () { gradStops[i] = this.value; window.applyGradient(); });
      box.appendChild(inp);
      if (gradStops.length > 2) {
        var rm = document.createElement("button");
        rm.className = "fmt-btn";
        rm.title = "رنگ ہٹائیں — remove";
        rm.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">close</span>';
        rm.addEventListener("click", function () { gradStops.splice(i, 1); renderGradStops(); window.applyGradient(); });
        box.appendChild(rm);
      }
      wrap.appendChild(box);
    });
  }

  window.addGradStop = function () {
    gradStops.push("#ffffff");
    renderGradStops();
    window.applyGradient();
  };

  window.applyGradient = function () {
    var type = (document.getElementById("gradType") || {}).value || "linear";
    var dir = (document.getElementById("gradDir") || {}).value || "135";
    var stops = gradStops.join(", ");
    bgEl.value =
      type === "radial"
        ? "radial-gradient(circle, " + stops + ")"
        : "linear-gradient(" + dir + "deg, " + stops + ")";
    applyPreviewStyles();
  };

  window.applyImageUrl = function () {
    var url = document.getElementById("bgImageUrl").value.trim();
    if (!url) return;
    bgEl.value = "url('" + url + "') center/cover no-repeat";
    applyPreviewStyles();
  };

  window.clearBackground = function () {
    bgEl.value = "";
    applyPreviewStyles();
  };

  function setBackgroundImageFromFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      bgEl.value = "url('" + e.target.result + "') center/cover no-repeat";
      applyPreviewStyles();
    };
    reader.readAsDataURL(file);
  }

  /* ---------------------------- Page size ---------------------------- */

  function applyPageSize(value, save) {
    currentPageSize = value || "auto";
    if (!previewEl) return;
    // Applies to every page card, not just #print-area -- otherwise cards
    // created by an earlier renderPreview() would be left at a stale size.
    Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (card) {
      if (currentPageSize === "auto") {
        card.style.width = "100%";
        card.style.minHeight = "300px";
        card.style.maxWidth = "100%";
        return;
      }

      var w, h;
      if (currentPageSize === "custom") {
        w = Number(document.getElementById("pageW").value) || 0;
        h = Number(document.getElementById("pageH").value) || 0;
      } else {
        var parts = currentPageSize.split("x");
        w = Number(parts[0]);
        h = Number(parts[1]);
      }
      if (w) card.style.width = w + "px";
      if (h) card.style.minHeight = h + "px";
      // Render the true page width; the #previewHost wrapper scrolls if the
      // column is narrower. (Capping at 100% was squashing A4/Letter width.)
      card.style.maxWidth = "none";
    });
    if (save !== false) autoSave();
  }

  window.applyCustomSize = function () {
    applyPageSize("custom", true);
    renderPreview();
  };

  /* ----------------------------- Library ----------------------------- */

  function defaultTitle(text) {
    var first = text.split("\n").map(function (l) { return l.trim(); }).find(Boolean);
    return first ? first.slice(0, 30) : "نیا کلام";
  }

  function storageItems() {
    try {
      var p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
    if (activeItemId) localStorage.setItem(ACTIVE_ITEM_KEY, activeItemId);
    else localStorage.removeItem(ACTIVE_ITEM_KEY);
  }

  function currentState() {
    return {
      title: titleEl ? titleEl.value.trim() : "",
      markdown: getMarkdown(),
      pattern: currentPattern,
      background: bgEl ? bgEl.value : "",
      color: colorEl ? colorEl.value : "",
      fontName: currentFont,
      fontUrl: fontUrlEl ? fontUrlEl.value.trim() : "",
      customCss: customCssInput ? customCssInput.value : "",
      pageSize: currentPageSize,
      showCounter: showCounterToggle ? showCounterToggle.checked : false,
      counterMode: counterModeSelect ? counterModeSelect.value : "continue",
      paginateHeight: paginateHeightToggle ? paginateHeightToggle.checked : true,
      updatedAt: Date.now(),
    };
  }

  function renderSavedItems() {
    if (!savedListEl) return;
    savedListEl.innerHTML = "";
    if (!savedItems.length) {
      var empty = document.createElement("div");
      empty.className = "text-sm text-gray-500 text-center py-6";
      empty.textContent = "ابھی کوئی محفوظ شاعری موجود نہیں";
      savedListEl.appendChild(empty);
      return;
    }
    savedItems.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "saved-item" + (item.id === activeItemId ? " active" : "");
      btn.onclick = function () { window.loadPoetryItem(item.id); };
      var t = document.createElement("div");
      t.className = "font-semibold text-gray-800";
      t.textContent = item.title || "بغیر عنوان";
      var meta = document.createElement("div");
      meta.className = "text-xs text-gray-500 mt-1";
      meta.textContent = new Date(item.updatedAt || Date.now()).toLocaleString();
      var prev = document.createElement("div");
      prev.className = "text-sm text-gray-600 mt-2 truncate";
      prev.textContent = item.markdown || item.inputText || "خالی";
      btn.appendChild(t); btn.appendChild(meta); btn.appendChild(prev);
      savedListEl.appendChild(btn);
    });
  }

  function upsertActive() {
    var st = currentState();
    var title = st.title || defaultTitle(st.markdown);
    if (titleEl && !titleEl.value.trim()) titleEl.value = title;
    if (!activeItemId) activeItemId = "poetry-" + Date.now();
    var payload = Object.assign({ id: activeItemId, title: title }, st);
    var idx = savedItems.findIndex(function (i) { return i.id === activeItemId; });
    if (idx >= 0) savedItems[idx] = payload; else savedItems.push(payload);
    persist();
    renderSavedItems();
  }

  var saveTimer = null;
  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(upsertActive, 400);
  }

  function applyItemState(item) {
    if (!item) return;
    activeItemId = item.id;
    currentPattern = item.pattern || "sher";
    currentFont = item.fontName || "Payami";
    currentPageSize = item.pageSize || "auto";
    if (titleEl) titleEl.value = item.title || "";
    if (editor) editor.setMarkdown(item.markdown || item.inputText || "");
    if (bgEl) bgEl.value = item.background || "";
    if (colorEl) colorEl.value = item.color || "";
    if (fontUrlEl) fontUrlEl.value = item.fontUrl || "";
    if (customCssInput) customCssInput.value = item.customCss || "";
    if (showCounterToggle) showCounterToggle.checked = !!item.showCounter;
    if (counterModeSelect) counterModeSelect.value = item.counterMode === "new" ? "new" : "continue";
    if (paginateHeightToggle) paginateHeightToggle.checked = item.paginateHeight !== false;
    if (item.fontUrl && item.fontName) { registerCustomFont(item.fontName, item.fontUrl); rememberCustomFont(item.fontName, item.fontUrl); }
    if (fontSelector) { ensureFontOption(currentFont, currentFont); fontSelector.value = currentFont; }
    if (pageSizeSelect) pageSizeSelect.value = ["auto", "custom"].indexOf(currentPageSize) >= 0 || /^\d+x\d+$/.test(currentPageSize) ? currentPageSize : "auto";
    syncColorPickers();
    applyFont();
    applyPreviewStyles(false);
    applyPageSize(currentPageSize, false);
    renderPreview();
    histInit();
    persist();
    renderSavedItems();
  }

  window.savePoetryItem = function () { upsertActive(); };

  window.createNewPoetryItem = function () {
    activeItemId = "poetry-" + Date.now();
    currentPattern = "sher";
    currentFont = "Payami";
    currentPageSize = "auto";
    if (titleEl) titleEl.value = "";
    if (editor) editor.setMarkdown("");
    if (bgEl) bgEl.value = "";
    if (colorEl) colorEl.value = "";
    if (fontUrlEl) fontUrlEl.value = "";
    if (customCssInput) customCssInput.value = "";
    if (showCounterToggle) showCounterToggle.checked = false;
    if (counterModeSelect) counterModeSelect.value = "continue";
    if (paginateHeightToggle) paginateHeightToggle.checked = true;
    if (fontSelector) fontSelector.value = "Payami";
    if (pageSizeSelect) pageSizeSelect.value = "auto";
    syncColorPickers();
    applyFont();
    applyPreviewStyles(false);
    applyPageSize("auto", false);
    renderPreview();
    histInit();
    upsertActive();
  };

  window.loadPoetryItem = function (id) {
    applyItemState(savedItems.find(function (i) { return i.id === id; }));
  };

  window.deletePoetryItem = function () {
    if (!activeItemId) return;
    if (!confirm("اس محفوظ شاعری کو حذف کرنا ہے؟")) return;
    savedItems = savedItems.filter(function (i) { return i.id !== activeItemId; });
    activeItemId = null;
    persist();
    if (savedItems.length) { applyItemState(savedItems[0]); return; }
    window.createNewPoetryItem();
  };

  window.exportPoetryItems = function () {
    var payload = { version: 3, exportedAt: new Date().toISOString(), activeItemId: activeItemId, items: savedItems };
    var suggested = "poetry-notes-" + new Date().toISOString().slice(0, 10);
    var name = prompt("Export file name", suggested);
    if (name === null) return;
    var safe = (name.trim() || suggested).replace(/[\\/:*?"<>|]/g, "_");
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.download = safe.endsWith(".json") ? safe : safe + ".json";
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  };

  window.triggerImport = function () { if (importFileInput) importFileInput.click(); };

  function importItems(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        var items = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(items)) { alert("درست JSON فائل منتخب کریں"); return; }
        savedItems = items.map(function (item, i) {
          return {
            id: item.id || "poetry-import-" + Date.now() + "-" + i,
            title: item.title || defaultTitle(item.markdown || item.inputText || ""),
            markdown: item.markdown || item.inputText || "",
            pattern: typeof item.pattern === "undefined" ? "sher" : item.pattern,
            background: item.background || "",
            color: item.color || "",
            fontName: item.fontName || "Payami",
            fontUrl: item.fontUrl || "",
            customCss: item.customCss || "",
            pageSize: item.pageSize || "auto",
            updatedAt: item.updatedAt || Date.now(),
          };
        });
        var nextId = parsed.activeItemId || (savedItems[0] && savedItems[0].id);
        persist();
        renderSavedItems();
        if (savedItems.length) applyItemState(savedItems.find(function (i) { return i.id === nextId; }) || savedItems[0]);
      } catch (err) { alert("فائل import نہیں ہو سکی"); }
    };
    reader.readAsText(file, "utf-8");
  }

  /* ----------------------------- Export ----------------------------- */

  function cardToCanvas(card) {
    return html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      // The page-number badge and per-card download button are editor
      // chrome, not part of the poem -- never bake them into the export.
      ignoreElements: function (el) {
        return el.classList.contains("print-page-label") || el.classList.contains("print-page-download");
      },
    });
  }

  function downloadCardAsImage(card, pageNumber) {
    if (!window.html2canvas) return;
    cardToCanvas(card).then(function (canvas) {
      var suggested = (titleEl && titleEl.value.trim()) || defaultTitle(getMarkdown());
      var safe = suggested.replace(/[\\/:*?"<>|]/g, "_") || "poetry";
      var link = document.createElement("a");
      link.download = pageNumber ? safe + "-page-" + pageNumber + ".png" : safe + ".png";
      link.href = canvas.toDataURL();
      link.click();
    });
  }

  // Single page: the original one-PNG-with-a-filename-prompt flow.
  // Multiple pages: prompts once for a base name, then renders every page
  // card to PNG and bundles them into one .zip.
  window.downloadImage = function () {
    if (!previewEl || !window.html2canvas) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".print-page"));
    var suggested = (titleEl && titleEl.value.trim()) || defaultTitle(getMarkdown());

    if (cards.length < 2) {
      var name = prompt("فائل کا نام درج کریں", suggested);
      if (name === null) return;
      var safe = (name.trim() || suggested || "poetry").replace(/[\\/:*?"<>|]/g, "_");
      cardToCanvas(previewEl).then(function (canvas) {
        var link = document.createElement("a");
        link.download = safe.endsWith(".png") ? safe : safe + ".png";
        link.href = canvas.toDataURL();
        link.click();
      });
      return;
    }

    if (!window.JSZip) { alert("ZIP لائبریری لوڈ نہیں ہو سکی — JSZip failed to load"); return; }
    var zipName = prompt("فائل کا نام درج کریں (ZIP)", suggested);
    if (zipName === null) return;
    var safeZip = (zipName.trim() || suggested || "poetry").replace(/[\\/:*?"<>|]/g, "_");

    var zip = new JSZip();
    var chain = Promise.resolve();
    cards.forEach(function (card, index) {
      chain = chain.then(function () {
        return cardToCanvas(card).then(function (canvas) {
          return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
              zip.file(safeZip + "-page-" + (index + 1) + ".png", blob);
              resolve();
            });
          });
        });
      });
    });

    chain
      .then(function () { return zip.generateAsync({ type: "blob" }); })
      .then(function (blob) {
        var link = document.createElement("a");
        link.download = safeZip + ".zip";
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      });
  };

  /* ----------------------------- Modals ----------------------------- */

  window.toggleCssModal = function (show) {
    if (!cssModalEl) return;
    cssModalEl.classList.toggle("hidden", !show);
    cssModalEl.classList.toggle("flex", !!show);
  };
  window.saveCustomCssFromModal = function () { applyPreviewStyles(); toggleCssModal(false); };

  window.toggleAboutModal = function (show) {
    var m = document.getElementById("aboutModal");
    if (!m) return;
    m.classList.toggle("hidden", !show);
    m.classList.toggle("flex", !!show);
  };

  window.toggleSjModal = function (show) {
    if (!sjModalEl) return;
    if (show && sjFormatSelect) sjFormatSelect.value = currentPattern || "sher";
    sjModalEl.classList.toggle("hidden", !show);
    sjModalEl.classList.toggle("flex", !!show);
  };
  // Selection captured at the moment the modal opens — the editor keeps its
  // internal selection even while focus is in the modal, but we snapshot the
  // text so we can WRAP it (never replace/lose it).
  var sjSelectedText = "";
  window.insertPoetryBlock = function () {
    sjSelectedText = (editor && editor.getSelectedText && editor.getSelectedText()) || "";
    window.toggleSjModal(true);
  };

  window.insertPoetryBlockFromModal = function () {
    var fmt = sjFormatSelect ? sjFormatSelect.value : "sher";
    var custom = sjCustomPatternInput ? sjCustomPatternInput.value.trim() : "";
    var attrs = [];
    if (fmt) attrs.push('format="' + fmt + '"');
    if (fmt === "custom" && custom) attrs.push('custom="' + custom.replace(/"/g, "&quot;") + '"');
    var open = attrs.length ? "[sj " + attrs.join(" ") + "]" : "[sj]";
    if (fmt !== "custom") currentPattern = fmt;
    // Wrap the selected couplet; only fall back to placeholders if nothing
    // was selected. Snapshot first so a single Undo restores the original.
    histRecord();
    var body = sjSelectedText.trim() ? sjSelectedText.replace(/\s+$/, "") : "پہلا مصرع\nدوسرا مصرع";
    var snippet = "\n" + open + "\n" + body + "\n[/sj]\n";
    if (editor.replaceSelection) editor.replaceSelection(snippet);
    else editor.insertText(snippet);
    sjSelectedText = "";
    window.toggleSjModal(false);
    renderPreview();
  };

  window.insertPageBreak = function () {
    if (!editor) return;
    histRecord();
    var snippet = "\n[page]\n";
    if (editor.replaceSelection) editor.replaceSelection(snippet);
    else editor.insertText(snippet);
    renderPreview();
  };

  /* --------------------- Alignment / direction --------------------- */

  function wrapSelection(makeHtml) {
    if (!editor) return;
    histRecord();
    var sel = (editor.getSelectedText && editor.getSelectedText()) || "";
    var text = sel || "متن";
    var html = makeHtml(text);
    if (editor.replaceSelection) editor.replaceSelection(html);
    else editor.insertText(html);
    renderPreview();
    autoSave();
  }

  window.applyAlignment = function (align) {
    wrapSelection(function (t) {
      return '<p style="text-align:' + align + '">' + t.replace(/\n/g, "<br>") + "</p>";
    });
  };

  window.applyDirection = function (dir) {
    wrapSelection(function (t) {
      var ta = dir === "rtl" ? "right" : "left";
      return '<div dir="' + dir + '" style="text-align:' + ta + '">' + t.replace(/\n/g, "<br>") + "</div>";
    });
  };

  /* --------------------- Per-selection font size --------------------- */
  // Deliberately NOT built on wrapSelection() above -- that helper falls
  // back to wrapping a placeholder ("متن") when nothing is selected, which
  // is exactly the guessing-what-to-wrap problem we want to avoid here.
  // The font-size input is instead a live inspector: it shows the size
  // around the cursor (via Toast UI's caretChange event), and only ever
  // mutates the markdown when the user changes it while text is selected.

  function markdownOffsetFromPos(markdown, pos) {
    // Toast UI's markdown-mode getSelection() returns 1-indexed [line, ch]
    // pairs (CodeMirror-style); there's no built-in flat-offset API.
    var lines = markdown.split("\n");
    var offset = 0;
    for (var i = 0; i < pos[0] - 1; i += 1) {
      offset += lines[i].length + 1; // +1 for the newline
    }
    return offset + (pos[1] - 1);
  }

  function findEnclosingFontSize(markdown, offset) {
    var before = markdown.slice(0, offset);
    var openIdx = before.lastIndexOf('<span style="font-size:');
    if (openIdx === -1) return null;

    // If a </span> already closed that span before the cursor, it doesn't
    // enclose the cursor anymore.
    var closedBeforeCursor = before.indexOf("</span>", openIdx);
    if (closedBeforeCursor !== -1 && closedBeforeCursor < offset) return null;

    var tagEnd = markdown.indexOf(">", openIdx);
    if (tagEnd === -1) return null;

    var match = markdown.slice(openIdx, tagEnd).match(/font-size:\s*([\d.]+)px/);
    return match ? match[1] : null;
  }

  function updateFontSizeInputFromCursor() {
    if (!editor || !fontSizeInput || !editor.getSelection) return;
    // Don't stomp on what the user is actively typing into the box.
    if (document.activeElement === fontSizeInput) return;

    var range = editor.getSelection();
    var markdown = getMarkdown();
    var offset = markdownOffsetFromPos(markdown, range[0]);
    var size = findEnclosingFontSize(markdown, offset);
    fontSizeInput.value = size || "";
  }

  window.onFontSizeInputChange = function (inputEl) {
    if (!editor) return;
    var sel = (editor.getSelectedText && editor.getSelectedText()) || "";
    var size = parseFloat(inputEl.value);

    if (!sel || !size || size <= 0) return; // no reliable target -> no-op

    histRecord();
    editor.replaceSelection('<span style="font-size:' + size + 'px">' + sel + "</span>");
    renderPreview();
    autoSave();
  };

  /* --------------------------- Preview overlay --------------------------- */

  window.togglePreview = function (show) {
    var overlay = document.getElementById("previewOverlay");
    var body = document.getElementById("previewOverlayBody");
    var host = document.getElementById("previewHost");
    if (!overlay || !body || !host) return;
    // Re-parent every page card (there may be several now) as a block, not
    // just the original #print-area.
    var source = show ? host : body;
    var target = show ? body : host;
    while (source.firstChild) target.appendChild(source.firstChild);
    overlay.classList.toggle("open", !!show);
  };

  /* ----------------------------- Unsplash ----------------------------- */

  var UNSPLASH_KEY_STORE = "poetryUnsplashKey";
  var CURATED = [
    "photo-1506744038136-46273834b3fb", "photo-1470071459604-3b5ec3a7fe05",
    "photo-1500530855697-b586d89ba3ee", "photo-1499346030926-9a72daac6c63",
    "photo-1524995997946-a1c2e315a42f", "photo-1513682121497-80211f36a7d3",
  ];
  function unsplashThumb(id) { return "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=200&q=60"; }
  function unsplashFull(id) { return "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=1600&q=80"; }

  function setUnsplashBg(fullUrl) {
    bgEl.value = "url('" + fullUrl + "') center/cover no-repeat";
    applyPreviewStyles();
    window.closeUnsplash();
  }
  function renderUnsplashResults(items) {
    var wrap = document.getElementById("unsplashResults");
    if (!wrap) return;
    wrap.innerHTML = "";
    items.forEach(function (it) {
      var img = document.createElement("img");
      img.src = it.thumb;
      img.loading = "lazy";
      img.className = "unsplash-thumb";
      img.style.height = "90px";
      img.addEventListener("click", function () { setUnsplashBg(it.full); });
      wrap.appendChild(img);
    });
  }
  function renderCurated() {
    renderUnsplashResults(CURATED.map(function (id) { return { thumb: unsplashThumb(id), full: unsplashFull(id) }; }));
  }

  window.openUnsplash = function () {
    var m = document.getElementById("unsplashModal");
    m.classList.remove("hidden");
    m.classList.add("flex");
    document.getElementById("unsplashKeyRow").classList.toggle("hidden", !!localStorage.getItem(UNSPLASH_KEY_STORE));
    if (!document.getElementById("unsplashResults").children.length) renderCurated();
  };
  window.closeUnsplash = function () {
    var m = document.getElementById("unsplashModal");
    m.classList.add("hidden");
    m.classList.remove("flex");
  };
  window.saveUnsplashKey = function () {
    var k = document.getElementById("unsplashKey").value.trim();
    if (k) {
      localStorage.setItem(UNSPLASH_KEY_STORE, k);
      document.getElementById("unsplashKeyRow").classList.add("hidden");
    }
  };
  window.searchUnsplash = function () {
    var q = document.getElementById("unsplashQuery").value.trim();
    var link = document.getElementById("unsplashOpenLink");
    if (q && link) link.href = "https://unsplash.com/s/photos/" + encodeURIComponent(q);
    var key = localStorage.getItem(UNSPLASH_KEY_STORE);
    if (!key) {
      // No key → can't query Unsplash directly; offer key setup + curated picks
      // and let the ↗ button open the live search on unsplash.com.
      document.getElementById("unsplashKeyRow").classList.remove("hidden");
      renderCurated();
      return;
    }
    if (!q) { renderCurated(); return; }
    fetch("https://api.unsplash.com/search/photos?per_page=18&query=" + encodeURIComponent(q) + "&client_id=" + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d.results || []).map(function (p) { return { thumb: p.urls.small, full: p.urls.regular }; });
        renderUnsplashResults(items.length ? items : []);
        if (!items.length) renderCurated();
      })
      .catch(function () { renderCurated(); });
  };

  /* --------------------------- Color sync --------------------------- */

  function isHex(v) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((v || "").trim()); }
  function syncColorPickers() {
    if (bgColorPicker && isHex(bgEl.value)) bgColorPicker.value = bgEl.value.trim();
    if (textColorPicker && isHex(colorEl.value)) textColorPicker.value = colorEl.value.trim();
  }

  /* ------------------------------ Wiring ----------------------------- */

  if (fontSelector) {
    fontSelector.addEventListener("change", function () {
      var name = this.value;
      var sel = (editor && editor.getSelectedText && editor.getSelectedText()) || "";

      // Text selected -> style just that selection, same idea as font-size.
      // Otherwise, unchanged: this dropdown sets the whole document's font.
      if (sel) {
        histRecord();
        editor.replaceSelection('<span style="font-family:' + fontStack(name) + '">' + sel + "</span>");
        renderPreview();
        autoSave();
        this.value = currentFont; // the global font didn't actually change
        return;
      }

      currentFont = name;
      applyFont();
      applyPreviewStyles(false);
      autoSave();
    });
  }
  if (titleEl) titleEl.addEventListener("input", autoSave);

  if (showCounterToggle) {
    showCounterToggle.addEventListener("change", function () {
      renderPreview();
      autoSave();
    });
  }

  if (counterModeSelect) {
    counterModeSelect.addEventListener("change", function () {
      renderPreview();
      autoSave();
    });
  }

  [bgEl, colorEl].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", function () { syncColorPickers(); applyPreviewStyles(); });
  });
  if (bgColorPicker) bgColorPicker.addEventListener("input", function () { bgEl.value = this.value; applyPreviewStyles(); });
  if (textColorPicker) textColorPicker.addEventListener("input", function () { colorEl.value = this.value; applyPreviewStyles(); });

  var bgImageFile = document.getElementById("bgImageFile");
  if (bgImageFile) bgImageFile.addEventListener("change", function (e) { setBackgroundImageFromFile(e.target.files && e.target.files[0]); e.target.value = ""; });

  if (customCssInput) customCssInput.addEventListener("input", function () { applyPreviewStyles(false); });
  if (fontUrlEl) fontUrlEl.addEventListener("change", autoSave);

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", function () {
      var wrap = document.getElementById("customSizeWrap");
      if (this.value === "custom") { wrap.style.display = "inline-flex"; }
      else { wrap.style.display = "none"; applyPageSize(this.value, true); renderPreview(); }
    });
  }

  if (paginateHeightToggle) {
    paginateHeightToggle.addEventListener("change", function () {
      renderPreview();
      autoSave();
    });
  }

  if (importFileInput) importFileInput.addEventListener("change", function (e) { importItems(e.target.files && e.target.files[0]); e.target.value = ""; });

  [cssModalEl, sjModalEl, document.getElementById("aboutModal")].forEach(function (modal) {
    if (!modal) return;
    modal.addEventListener("click", function (e) { if (e.target === modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); } });
  });

  // Gradient type/direction, rounded-corners, Unsplash + preview-overlay wiring
  var gradType = document.getElementById("gradType");
  var gradDir = document.getElementById("gradDir");
  if (gradType) gradType.addEventListener("change", function () {
    if (gradDir) gradDir.disabled = this.value === "radial";
    window.applyGradient();
  });
  if (gradDir) gradDir.addEventListener("change", function () { window.applyGradient(); });

  var roundedToggle = document.getElementById("roundedToggle");
  if (roundedToggle) roundedToggle.addEventListener("change", function () {
    // Every existing page card, not just #print-area -- otherwise only the
    // first page picks it up until the next renderPreview() (e.g. adding or
    // removing a page break) clones the class list onto the rest.
    var squareCorners = !this.checked;
    Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (card) {
      card.classList.toggle("square-corners", squareCorners);
    });
  });

  var unsplashQuery = document.getElementById("unsplashQuery");
  if (unsplashQuery) unsplashQuery.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); window.searchUnsplash(); }
  });
  var unsplashModalEl = document.getElementById("unsplashModal");
  if (unsplashModalEl) unsplashModalEl.addEventListener("click", function (e) { if (e.target === unsplashModalEl) window.closeUnsplash(); });

  var previewOverlayEl = document.getElementById("previewOverlay");
  if (previewOverlayEl) previewOverlayEl.addEventListener("click", function (e) { if (e.target === previewOverlayEl) window.togglePreview(false); });

  /* ------------------------------ Init ------------------------------ */

  function initFromStorage() {
    savedItems = storageItems();
    registerSavedCustomFonts(); // re-add named custom fonts to head + dropdown
    renderGradStops();
    if (!savedItems.length) { initEditor(""); window.createNewPoetryItem(); return; }
    var storedId = localStorage.getItem(ACTIVE_ITEM_KEY);
    var item = savedItems.find(function (i) { return i.id === storedId; }) || savedItems[0];
    initEditor(item.markdown || item.inputText || "");
    applyItemState(item);
  }

  initFromStorage();
});
