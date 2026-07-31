/* Resume Studio — WYSIWYG canvas (BETA): click-to-select on live preview */
(function (global) {
  "use strict";

  var active = false;
  var selectedId = null;
  var onChangeFn = null;
  var onSelectFn = null;
  var getThemeOverridesFn = null;
  var clickHandler = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setActive(on) {
    active = !!on;
    document.body.classList.toggle("wysiwyg-mode", active);
    var host = $("previewHost");
    if (host) host.classList.toggle("wysiwyg-canvas", active);
    if (active) bindPreviewClicks();
    else unbindPreviewClicks();
    highlightSelected();
    renderQuickPanel();
  }

  function isActive() {
    return active;
  }

  function getNode(id) {
    if (!id || !getThemeOverridesFn) return null;
    var ov = getThemeOverridesFn();
    var design = ov && ov.layoutDesign;
    if (!design || !design.root) return null;
    return ResumeThemeEngine.findNodeById(design.root, id);
  }

  function selectBlock(id, fromPreview) {
    if (!id) return;
    selectedId = id;
    highlightSelected();
    renderQuickPanel();
    if (typeof onSelectFn === "function") onSelectFn(id, fromPreview);
  }

  function getSelectedId() {
    return selectedId;
  }

  function highlightSelected() {
    document.querySelectorAll("[data-rs-node-id]").forEach(function (el) {
      el.classList.toggle("wysiwyg-selected", active && el.getAttribute("data-rs-node-id") === selectedId);
    });
  }

  function resolveClickTarget(el) {
    var cur = el;
    while (cur && cur !== document.body) {
      if (cur.getAttribute && cur.getAttribute("data-rs-node-id")) {
        return cur.getAttribute("data-rs-node-id");
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function onPreviewClick(e) {
    if (!active) return;
    var id = resolveClickTarget(e.target);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    selectBlock(id, true);
  }

  function bindPreviewClicks() {
    var host = $("previewHost");
    if (!host || clickHandler) return;
    clickHandler = onPreviewClick;
    host.addEventListener("click", clickHandler, true);
  }

  function unbindPreviewClicks() {
    var host = $("previewHost");
    if (host && clickHandler) host.removeEventListener("click", clickHandler, true);
    clickHandler = null;
  }

  function bumpStyle(node, prop, value) {
    if (!node) return;
    if (!node.style) node.style = {};
    node.style[prop] = value;
    if (typeof onChangeFn === "function") onChangeFn();
    highlightSelected();
    renderQuickPanel();
  }

  function renderQuickPanel() {
    var host = $("wysiwygQuickPanel");
    if (!host) return;
    host.innerHTML = "";

    if (!active) {
      host.innerHTML = '<p class="text-xs text-slate-500">Enable WYSIWYG mode to click blocks on the preview.</p>';
      return;
    }

    if (themeIdNotLayout()) {
      host.innerHTML =
        '<p class="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-2">WYSIWYG works with <strong>Visual Layout (JSON)</strong>. Switching theme automatically…</p>';
      return;
    }

    var node = getNode(selectedId);
    if (!node) {
      host.innerHTML =
        '<p class="text-xs text-slate-500">Click any block on the preview (right) to select it. Use quick controls here, or open <strong>Design</strong> for full granular control.</p>';
      return;
    }

    var title = document.createElement("div");
    title.className = "text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2";
    title.textContent = nodeLabel(node);
    host.appendChild(title);

    if (node.type === "field") {
      var bindSel = document.createElement("select");
      bindSel.className = "w-full text-xs border rounded-lg p-1.5 mb-2 dark:bg-slate-900 dark:border-slate-600";
      ResumeThemeEngine.FIELD_CATALOG.forEach(function (f) {
        var o = document.createElement("option");
        o.value = f.path;
        o.textContent = f.group + ": " + f.label;
        if (node.bind === f.path) o.selected = true;
        bindSel.appendChild(o);
      });
      bindSel.addEventListener("change", function () {
        node.bind = bindSel.value;
        var meta = ResumeThemeEngine.FIELD_CATALOG.find(function (f) {
          return f.path === bindSel.value;
        });
        if (meta && meta.kind === "image") node.display = "image";
        if (typeof onChangeFn === "function") onChangeFn();
        renderQuickPanel();
      });
      host.appendChild(labelRow("Variable", bindSel));
    }

    var sizeRow = document.createElement("div");
    sizeRow.className = "flex gap-2 items-center mb-2";
    var sizeInp = document.createElement("input");
    sizeInp.type = "text";
    sizeInp.placeholder = "fontSize e.g. 14px";
    sizeInp.className = "flex-1 text-xs border rounded-lg p-1.5 dark:bg-slate-900 dark:border-slate-600";
    sizeInp.value = (node.style && node.style.fontSize) || "";
    sizeInp.addEventListener("change", function () {
      bumpStyle(node, "fontSize", sizeInp.value);
    });
    sizeRow.appendChild(sizeInp);
    ["12px", "14px", "18px", "24px"].forEach(function (sz) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "text-[10px] px-1.5 py-1 rounded bg-slate-100 dark:bg-slate-700";
      b.textContent = sz;
      b.addEventListener("click", function () {
        sizeInp.value = sz;
        bumpStyle(node, "fontSize", sz);
      });
      sizeRow.appendChild(b);
    });
    host.appendChild(labelRow("Font size", sizeRow));

    var alignRow = document.createElement("div");
    alignRow.className = "flex gap-1 mb-2";
    ["left", "center", "right"].forEach(function (al) {
      var b = document.createElement("button");
      b.type = "button";
      b.className =
        "text-xs px-2 py-1 rounded-lg border " +
        ((node.style && node.style.textAlign) === al
          ? "bg-sky-600 text-white border-sky-600"
          : "border-slate-200 dark:border-slate-600");
      b.textContent = al;
      b.addEventListener("click", function () {
        bumpStyle(node, "textAlign", al);
      });
      alignRow.appendChild(b);
    });
    host.appendChild(labelRow("Align", alignRow));

    if (node.type === "flex" || node.type === "stack") {
      var flexRow = document.createElement("div");
      flexRow.className = "grid grid-cols-2 gap-2 mb-2";
      ["alignItems", "justifyContent", "gap"].forEach(function (prop) {
        var inp = document.createElement("input");
        inp.placeholder = prop;
        inp.className = "text-xs border rounded-lg p-1.5 dark:bg-slate-900 dark:border-slate-600";
        inp.value = node[prop] || "";
        inp.addEventListener("change", function () {
          node[prop] = inp.value || undefined;
          if (typeof onChangeFn === "function") onChangeFn();
        });
        flexRow.appendChild(inp);
      });
      host.appendChild(labelRow("Flex props", flexRow));
    }

    var openDesign = document.createElement("button");
    openDesign.type = "button";
    openDesign.className = "text-xs text-sky-700 dark:text-sky-300 underline mt-2";
    openDesign.textContent = "Open in Design tab for full control →";
    openDesign.addEventListener("click", function () {
      if (typeof global.switchTab === "function") global.switchTab("design");
    });
    host.appendChild(openDesign);
  }

  function labelRow(text, child) {
    var wrap = document.createElement("div");
    wrap.className = "mb-1";
    var lab = document.createElement("div");
    lab.className = "text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5";
    lab.textContent = text;
    wrap.appendChild(lab);
    wrap.appendChild(child);
    return wrap;
  }

  function nodeLabel(node) {
    if (!node) return "Block";
    if (node.type === "field") return "Field · " + (node.bind || "—");
    if (node.type === "section") return "Section · " + (node.section || "—");
    if (node.type === "flex") return "Flex " + (node.direction || "row");
    if (node.type === "stack") return "Stack";
    return node.type || "Block";
  }

  var themeIdNotLayoutFlag = false;
  var getThemeIdFn = null;

  function themeIdNotLayout() {
    if (typeof getThemeIdFn === "function") return getThemeIdFn() !== "layout-json";
    return themeIdNotLayoutFlag;
  }

  function afterPreviewRender() {
    if (!active) return;
    highlightSelected();
  }

  function init(refs) {
    onChangeFn = refs.onChange;
    onSelectFn = refs.onSelect;
    getThemeOverridesFn = refs.getThemeOverrides;
    getThemeIdFn = refs.getThemeId;

    var toggle = $("wysiwygEnableToggle");
    if (toggle) {
      toggle.addEventListener("change", function () {
        setActive(toggle.checked);
        if (toggle.checked && refs.ensureLayoutTheme) refs.ensureLayoutTheme();
      });
    }
  }

  function syncFromDesign(nodeId) {
    selectedId = nodeId;
    highlightSelected();
    renderQuickPanel();
  }

  function notifyThemeMismatch(isLayout) {
    themeIdNotLayoutFlag = !isLayout;
    renderQuickPanel();
  }

  global.ResumeWysiwygBeta = {
    init: init,
    setActive: setActive,
    isActive: isActive,
    selectBlock: selectBlock,
    getSelectedId: getSelectedId,
    afterPreviewRender: afterPreviewRender,
    syncFromDesign: syncFromDesign,
    renderQuickPanel: renderQuickPanel,
    notifyThemeMismatch: notifyThemeMismatch,
  };
})(typeof window !== "undefined" ? window : this);
