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
      hideModeSwitch: false,
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

  function renderPreview() {
    if (!previewEl) return;
    var prepared = preprocessInput(getMarkdown());
    previewEl.innerHTML = window.marked ? marked.parse(prepared) : prepared.replace(/\n/g, "<br>");
    if (window.ShakeebJustify) {
      try { ShakeebJustify.apply(); } catch (e) { /* ignore */ }
    }
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
    if (customCssInput && customCssInput.value.trim()) s.push(customCssInput.value.trim());
    return s.join("; ");
  }

  function applyPreviewStyles(save) {
    if (!previewEl) return;
    // Re-apply page-size dimensions on top of user CSS.
    previewEl.setAttribute("style", getPreviewCss());
    applyPageSize(currentPageSize, false);
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
    if (currentPageSize === "auto") {
      previewEl.style.width = "100%";
      previewEl.style.minHeight = "300px";
      previewEl.style.maxWidth = "100%";
    } else {
      var w, h;
      if (currentPageSize === "custom") {
        w = Number(document.getElementById("pageW").value) || 0;
        h = Number(document.getElementById("pageH").value) || 0;
      } else {
        var parts = currentPageSize.split("x");
        w = Number(parts[0]);
        h = Number(parts[1]);
      }
      if (w) previewEl.style.width = w + "px";
      if (h) previewEl.style.minHeight = h + "px";
      // Render the true page width; the #previewHost wrapper scrolls if the
      // column is narrower. (Capping at 100% was squashing A4/Letter width.)
      previewEl.style.maxWidth = "none";
    }
    if (save !== false) autoSave();
  }

  window.applyCustomSize = function () {
    applyPageSize("custom", true);
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
    if (item.fontUrl && item.fontName) { registerCustomFont(item.fontName, item.fontUrl); rememberCustomFont(item.fontName, item.fontUrl); }
    if (fontSelector) { ensureFontOption(currentFont, currentFont); fontSelector.value = currentFont; }
    if (pageSizeSelect) pageSizeSelect.value = ["auto", "custom"].indexOf(currentPageSize) >= 0 || /^\d+x\d+$/.test(currentPageSize) ? currentPageSize : "auto";
    syncColorPickers();
    applyFont();
    applyPreviewStyles(false);
    applyPageSize(currentPageSize, false);
    renderPreview();
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
    if (fontSelector) fontSelector.value = "Payami";
    if (pageSizeSelect) pageSizeSelect.value = "auto";
    syncColorPickers();
    applyFont();
    applyPreviewStyles(false);
    applyPageSize("auto", false);
    renderPreview();
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

  window.downloadImage = function () {
    if (!previewEl || !window.html2canvas) return;
    html2canvas(previewEl, { scale: 2, useCORS: true, backgroundColor: null }).then(function (canvas) {
      var suggested = (titleEl && titleEl.value.trim()) || defaultTitle(getMarkdown());
      var name = prompt("فائل کا نام درج کریں", suggested);
      if (name === null) return;
      var safe = (name.trim() || suggested || "poetry").replace(/[\\/:*?"<>|]/g, "_");
      var link = document.createElement("a");
      link.download = safe.endsWith(".png") ? safe : safe + ".png";
      link.href = canvas.toDataURL();
      link.click();
    });
  };

  /* ----------------------------- Modals ----------------------------- */

  window.toggleCssModal = function (show) {
    if (!cssModalEl) return;
    cssModalEl.classList.toggle("hidden", !show);
    cssModalEl.classList.toggle("flex", !!show);
  };
  window.saveCustomCssFromModal = function () { applyPreviewStyles(); toggleCssModal(false); };

  window.toggleSjModal = function (show) {
    if (!sjModalEl) return;
    if (show && sjFormatSelect) sjFormatSelect.value = currentPattern || "sher";
    sjModalEl.classList.toggle("hidden", !show);
    sjModalEl.classList.toggle("flex", !!show);
  };
  window.insertPoetryBlock = function () { window.toggleSjModal(true); };

  window.insertPoetryBlockFromModal = function () {
    var fmt = sjFormatSelect ? sjFormatSelect.value : "sher";
    var custom = sjCustomPatternInput ? sjCustomPatternInput.value.trim() : "";
    var attrs = [];
    if (fmt) attrs.push('format="' + fmt + '"');
    if (fmt === "custom" && custom) attrs.push('custom="' + custom.replace(/"/g, "&quot;") + '"');
    var open = attrs.length ? "[sj " + attrs.join(" ") + "]" : "[sj]";
    if (fmt !== "custom") currentPattern = fmt;
    var snippet = "\n" + open + "\nپہلا مصرع\nدوسرا مصرع\n[/sj]\n";
    editor.insertText(snippet);
    window.toggleSjModal(false);
    renderPreview();
  };

  /* --------------------- Alignment / direction --------------------- */

  function wrapSelection(makeHtml) {
    if (!editor) return;
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

  /* --------------------------- Preview overlay --------------------------- */

  window.togglePreview = function (show) {
    var overlay = document.getElementById("previewOverlay");
    var body = document.getElementById("previewOverlayBody");
    var host = document.getElementById("previewHost");
    if (!overlay || !body || !host || !previewEl) return;
    if (show) {
      body.appendChild(previewEl); // re-parent the single live preview node
      overlay.classList.add("open");
    } else {
      host.appendChild(previewEl);
      overlay.classList.remove("open");
    }
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
      currentFont = this.value;
      applyFont();
      applyPreviewStyles(false);
      autoSave();
    });
  }
  if (titleEl) titleEl.addEventListener("input", autoSave);

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
      else { wrap.style.display = "none"; applyPageSize(this.value, true); }
    });
  }

  if (importFileInput) importFileInput.addEventListener("change", function (e) { importItems(e.target.files && e.target.files[0]); e.target.value = ""; });

  [cssModalEl, sjModalEl].forEach(function (modal) {
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
    if (previewEl) previewEl.classList.toggle("square-corners", !this.checked);
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
