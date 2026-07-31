/* Resume Studio — visual layout / theme builder */
(function (global) {
  "use strict";

  var STYLE_PROPS = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "color",
    "textAlign",
    "lineHeight",
    "letterSpacing",
    "textTransform",
    "width",
    "height",
    "marginTop",
    "marginBottom",
    "padding",
    "borderRadius",
    "objectFit",
    "flex",
    "gap",
  ];

  var FLEX_PROPS = ["direction", "alignItems", "justifyContent", "flexWrap", "gap", "flex"];

  var selectedNodeId = null;
  var onChangeCallback = null;
  var onSelectCallback = null;
  var getResumeDataFn = null;
  var setThemeIdFn = null;
  var dragNodeId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function getDesign() {
    if (!global.themeOverridesRef) return ResumeThemeEngine.defaultLayoutDesign();
    if (!global.themeOverridesRef.layoutDesign) {
      global.themeOverridesRef.layoutDesign = ResumeThemeEngine.defaultLayoutDesign();
    }
    return global.themeOverridesRef.layoutDesign;
  }

  function getResumeData() {
    return typeof getResumeDataFn === "function" ? getResumeDataFn() : global.resumeDataRef || {};
  }

  function notifyChange() {
    if (typeof onChangeCallback === "function") onChangeCallback();
  }

  function nodeLabel(node) {
    if (!node) return "?";
    if (node.type === "field") return "Field: " + (node.bind || "—");
    if (node.type === "section") return "Section: " + (node.section || "—");
    if (node.type === "loop") return "Loop: " + (node.bind || "—");
    if (node.type === "text") return "Text";
    if (node.type === "flex") return "Flex " + (node.direction || "row");
    if (node.type === "stack") return "Stack";
    if (node.type === "spacer") return "Spacer";
    return node.type || "Node";
  }

  function reorderSibling(dragId, targetId) {
    if (!dragId || !targetId || dragId === targetId) return;
    var root = getDesign().root;
    var dragInfo = ResumeThemeEngine.findParentOfId(root, dragId);
    var targetInfo = ResumeThemeEngine.findParentOfId(root, targetId);
    if (!dragInfo || !targetInfo || dragInfo.parent !== targetInfo.parent) return;
    var list = dragInfo.parent.children;
    if (!list) return;
    var from = dragInfo.index;
    var to = targetInfo.index;
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    notifyChange();
    renderTree();
  }

  function renderTreeNode(node, depth) {
    var row = document.createElement("div");
    row.className = "design-tree-row" + (node.id === selectedNodeId ? " active" : "");
    row.style.paddingLeft = depth * 12 + 8 + "px";
    row.dataset.nodeId = node.id;
    row.draggable = true;

    var grip = document.createElement("span");
    grip.className = "material-symbols-outlined text-sm text-slate-300 cursor-grab";
    grip.textContent = "drag_indicator";
    row.appendChild(grip);

    var icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-sm text-slate-400";
    icon.textContent = node.type === "field" ? "title" : node.type === "section" ? "view_list" : "widgets";
    row.appendChild(icon);

    var label = document.createElement("span");
    label.className = "flex-1 text-xs truncate";
    label.textContent = nodeLabel(node);
    row.appendChild(label);

    if (node.hidden) {
      var hid = document.createElement("span");
      hid.className = "text-[10px] text-amber-600";
      hid.textContent = "hidden";
      row.appendChild(hid);
    }

    row.addEventListener("click", function (e) {
      e.stopPropagation();
      selectNode(node.id);
    });

    row.addEventListener("dragstart", function (e) {
      dragNodeId = node.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", function () {
      dragNodeId = null;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", function () {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", function (e) {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (dragNodeId) reorderSibling(dragNodeId, node.id);
    });

    var frag = document.createDocumentFragment();
    frag.appendChild(row);
    (node.children || []).forEach(function (child) {
      frag.appendChild(renderTreeNode(child, depth + 1));
    });
    if (node.itemLayout) frag.appendChild(renderTreeNode(node.itemLayout, depth + 1));
    return frag;
  }

  function renderTree() {
    var host = $("designTree");
    if (!host) return;
    host.innerHTML = "";
    var design = getDesign();
    if (!design.root) return;
    host.appendChild(renderTreeNode(design.root, 0));
  }

  function selectNode(id) {
    selectedNodeId = id;
    renderTree();
    renderProperties();
    renderHiddenItems();
    if (typeof onSelectCallback === "function") onSelectCallback(id);
  }

  function getSelectedNodeId() {
    return selectedNodeId;
  }

  function selectedNode() {
    if (!selectedNodeId) return null;
    return ResumeThemeEngine.findNodeById(getDesign().root, selectedNodeId);
  }

  function makeFieldRow(label, el) {
    var row = document.createElement("div");
    row.className = "form-field";
    var lab = document.createElement("label");
    lab.textContent = label;
    row.appendChild(lab);
    row.appendChild(el);
    return row;
  }

  function renderProperties() {
    var host = $("designProps");
    if (!host) return;
    host.innerHTML = "";
    var node = selectedNode();
    if (!node) {
      host.innerHTML = '<p class="text-xs text-slate-500">Select a block in the tree, or add one from the toolbar.</p>';
      return;
    }

    var typeSel = document.createElement("select");
    ["flex", "stack", "field", "section", "loop", "text", "spacer"].forEach(function (t) {
      var o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      if (node.type === t) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.addEventListener("change", function () {
      node.type = typeSel.value;
      notifyChange();
      renderTree();
      renderProperties();
    });
    host.appendChild(makeFieldRow("Block type", typeSel));

    var hideCb = document.createElement("input");
    hideCb.type = "checkbox";
    hideCb.checked = !!node.hidden;
    hideCb.addEventListener("change", function () {
      node.hidden = hideCb.checked;
      notifyChange();
      renderTree();
    });
    host.appendChild(makeFieldRow("Hidden", hideCb));

    if (node.type === "field") {
      var bindSel = document.createElement("select");
      bindSel.className = "text-xs";
      var groups = {};
      ResumeThemeEngine.FIELD_CATALOG.forEach(function (f) {
        if (!groups[f.group]) groups[f.group] = [];
        groups[f.group].push(f);
      });
      Object.keys(groups).forEach(function (g) {
        var og = document.createElement("optgroup");
        og.label = g;
        groups[g].forEach(function (f) {
          var o = document.createElement("option");
          o.value = f.path;
          o.textContent = f.label;
          if (node.bind === f.path) o.selected = true;
          og.appendChild(o);
        });
        bindSel.appendChild(og);
      });
      bindSel.addEventListener("change", function () {
        node.bind = bindSel.value;
        var meta = ResumeThemeEngine.FIELD_CATALOG.find(function (f) {
          return f.path === bindSel.value;
        });
        if (meta && meta.kind === "image") node.display = "image";
        notifyChange();
        renderTree();
      });
      host.appendChild(makeFieldRow("Variable", bindSel));

      var dispSel = document.createElement("select");
      ["text", "image"].forEach(function (d) {
        var o = document.createElement("option");
        o.value = d;
        o.textContent = d;
        if ((node.display || "text") === d) o.selected = true;
        dispSel.appendChild(o);
      });
      dispSel.addEventListener("change", function () {
        node.display = dispSel.value;
        notifyChange();
      });
      host.appendChild(makeFieldRow("Display as", dispSel));
    }

    if (node.type === "section") {
      var secSel = document.createElement("select");
      Object.keys(ResumeThemeEngine.FIELD_CATALOG.reduce(function (acc, f) {
        if (f.section) acc[f.section] = f.section;
        return acc;
      }, { profile: "profile" })).forEach(function (s) {
        var o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        if (node.section === s) o.selected = true;
        secSel.appendChild(o);
      });
      secSel.addEventListener("change", function () {
        node.section = secSel.value;
        notifyChange();
        renderTree();
        renderHiddenItems();
      });
      host.appendChild(makeFieldRow("Section data", secSel));

      var headInp = document.createElement("input");
      headInp.value = node.heading || "";
      headInp.placeholder = "Section heading";
      headInp.addEventListener("input", function () {
        node.heading = headInp.value;
        notifyChange();
      });
      host.appendChild(makeFieldRow("Heading text", headInp));
    }

    if (node.type === "loop") {
      var loopSel = document.createElement("select");
      ResumeThemeEngine.FIELD_CATALOG.filter(function (f) {
        return f.kind === "array";
      }).forEach(function (f) {
        var o = document.createElement("option");
        o.value = f.path;
        o.textContent = f.label;
        if (node.bind === f.path) o.selected = true;
        loopSel.appendChild(o);
      });
      loopSel.addEventListener("change", function () {
        node.bind = loopSel.value;
        notifyChange();
        renderTree();
      });
      host.appendChild(makeFieldRow("Loop over", loopSel));
    }

    if (node.type === "text") {
      var txt = document.createElement("textarea");
      txt.rows = 2;
      txt.value = node.text || "";
      txt.addEventListener("input", function () {
        node.text = txt.value;
        notifyChange();
      });
      host.appendChild(makeFieldRow("Static text", txt));
    }

    if (node.type === "spacer") {
      var sp = document.createElement("input");
      sp.value = node.height || "12px";
      sp.addEventListener("input", function () {
        node.height = sp.value;
        notifyChange();
      });
      host.appendChild(makeFieldRow("Height", sp));
    }

    if (node.type === "flex" || node.type === "stack") {
      FLEX_PROPS.forEach(function (prop) {
        var inp = document.createElement("input");
        inp.placeholder = prop;
        inp.value = node[prop] || (prop === "direction" && node.type === "stack" ? "column" : node[prop]) || "";
        inp.addEventListener("input", function () {
          node[prop] = inp.value || undefined;
          notifyChange();
        });
        host.appendChild(makeFieldRow(prop, inp));
      });
    }

    host.appendChild(document.createElement("hr"));
    var styleTitle = document.createElement("h4");
    styleTitle.className = "text-xs font-bold text-slate-600 mb-1";
    styleTitle.textContent = "Typography & layout styles";
    host.appendChild(styleTitle);

    if (!node.style) node.style = {};
    STYLE_PROPS.forEach(function (prop) {
      var inp = document.createElement("input");
      inp.placeholder = prop;
      inp.value = (node.style && node.style[prop]) || "";
      inp.addEventListener("input", function () {
        if (!node.style) node.style = {};
        if (inp.value) node.style[prop] = inp.value;
        else delete node.style[prop];
        notifyChange();
      });
      host.appendChild(makeFieldRow(prop, inp));
    });

    ["headingStyle", "bodyStyle", "titleStyle", "dateStyle", "itemStyle", "metaStyle"].forEach(function (sk) {
      if (node.type !== "section") return;
      var sub = document.createElement("details");
      sub.className = "mt-2";
      var sum = document.createElement("summary");
      sum.className = "text-xs font-semibold cursor-pointer";
      sum.textContent = sk;
      sub.appendChild(sum);
      if (!node[sk]) node[sk] = {};
      STYLE_PROPS.forEach(function (prop) {
        var inp = document.createElement("input");
        inp.placeholder = prop;
        inp.className = "mb-1";
        inp.value = (node[sk] && node[sk][prop]) || "";
        inp.addEventListener("input", function () {
          if (!node[sk]) node[sk] = {};
          if (inp.value) node[sk][prop] = inp.value;
          else delete node[sk][prop];
          notifyChange();
        });
        sub.appendChild(inp);
      });
      host.appendChild(sub);
    });

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "mt-3 text-xs text-red-600 underline";
    delBtn.textContent = "Delete block";
    delBtn.addEventListener("click", function () {
      var info = ResumeThemeEngine.findParentOfId(getDesign().root, node.id);
      if (!info) return;
      info.parent.children.splice(info.index, 1);
      selectedNodeId = null;
      notifyChange();
      renderTree();
      renderProperties();
    });
    host.appendChild(delBtn);
  }

  function renderHiddenItems() {
    var host = $("designHiddenItems");
    if (!host) return;
    host.innerHTML = "";
    var node = selectedNode();
    if (!node || node.type !== "section" || !node.section) {
      host.classList.add("hidden");
      return;
    }
    var section = node.section;
    if (section === "profile") {
      host.classList.add("hidden");
      return;
    }
    host.classList.remove("hidden");
    var title = document.createElement("div");
    title.className = "text-xs font-semibold text-slate-600 mb-1";
    title.textContent = "Hide items in " + section;
    host.appendChild(title);

    if (!global.themeOverridesRef.hiddenEntries) global.themeOverridesRef.hiddenEntries = {};
    var hidden = global.themeOverridesRef.hiddenEntries[section] || [];
    var items = getResumeData()[section] || [];
    if (!items.length) {
      host.appendChild(document.createTextNode("No items in resume data yet."));
      return;
    }
    items.forEach(function (item, idx) {
      var row = document.createElement("label");
      row.className = "flex items-center gap-2 text-xs py-0.5";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = hidden.indexOf(idx) < 0;
      var label = item.name || item.company || item.institution || item.title || "Item " + (idx + 1);
      cb.addEventListener("change", function () {
        var list = global.themeOverridesRef.hiddenEntries[section] || [];
        if (cb.checked) {
          global.themeOverridesRef.hiddenEntries[section] = list.filter(function (i) {
            return i !== idx;
          });
        } else if (list.indexOf(idx) < 0) {
          global.themeOverridesRef.hiddenEntries[section] = list.concat([idx]);
        }
        notifyChange();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode("Show: " + label));
      host.appendChild(row);
    });
  }

  function addBlock(type) {
    var design = getDesign();
    if (!design.root) design.root = { id: ResumeThemeEngine.uid(), type: "flex", direction: "column", children: [] };
    var parent = selectedNode();
    if (!parent || (parent.type !== "flex" && parent.type !== "stack")) {
      parent = design.root;
    }
    if (!parent.children) parent.children = [];

    var block = { id: ResumeThemeEngine.uid(), type: type };
    if (type === "flex") {
      block.direction = "row";
      block.gap = "12px";
      block.children = [];
    }
    if (type === "stack") {
      block.direction = "column";
      block.gap = "8px";
      block.children = [];
    }
    if (type === "field") {
      block.bind = "basics.name";
      block.style = { fontSize: "14px" };
    }
    if (type === "section") {
      block.section = "projects";
      block.heading = "Projects";
      block.headingStyle = { fontSize: "12px", fontWeight: "700", textTransform: "uppercase" };
    }
    if (type === "loop") {
      block.bind = "projects";
      block.itemStyle = { marginBottom: "8px" };
    }
    if (type === "text") {
      block.text = "Static text";
      block.style = { fontSize: "12px" };
    }
    if (type === "spacer") {
      block.height = "16px";
    }

    parent.children.push(block);
    selectedNodeId = block.id;
    notifyChange();
    renderTree();
    renderProperties();
    renderHiddenItems();
  }

  function loadSampleLayout() {
    fetch("samples/sample-layout-theme.json")
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        global.themeOverridesRef.layoutDesign = json.layoutDesign || json;
        if (json.hiddenEntries) global.themeOverridesRef.hiddenEntries = json.hiddenEntries;
        if (global.themeSelectRef) global.themeSelectRef.value = "layout-json";
        if (setThemeIdFn) setThemeIdFn("layout-json");
        notifyChange();
        renderTree();
        renderProperties();
      })
      .catch(function () {
        global.themeOverridesRef.layoutDesign = ResumeThemeEngine.defaultLayoutDesign();
        notifyChange();
        renderTree();
      });
  }

  function loadCustomHtmlSample() {
    fetch("samples/sample-custom-template.html")
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        global.themeOverridesRef.customTemplate = html.trim();
        var ta = $("customTemplateInput");
        if (ta) ta.value = html.trim();
        if (global.themeSelectRef) global.themeSelectRef.value = "custom";
        if (setThemeIdFn) setThemeIdFn("custom");
        notifyChange();
        alert("Sample custom HTML loaded. Switch to Theme tab to edit, or keep designing in Design tab.");
      })
      .catch(function () {
        alert("Could not load sample template.");
      });
  }

  function exportLayoutJson() {
    var payload = {
      version: 1,
      baseRenderer: "layout-json",
      layoutDesign: getDesign(),
      hiddenEntries: global.themeOverridesRef.hiddenEntries || {},
      colors: global.themeOverridesRef.colors || {},
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "layout-theme.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function bindToolbar() {
    var map = {
      designAddFlexRow: { type: "flex", direction: "row" },
      designAddFlexCol: { type: "flex", direction: "column" },
      designAddStack: "stack",
      designAddField: "field",
      designAddSection: "section",
      designAddLoop: "loop",
      designAddSpacer: "spacer",
    };
    Object.keys(map).forEach(function (id) {
      var btn = $(id);
      if (!btn) return;
      btn.addEventListener("click", function () {
        var spec = map[id];
        if (typeof spec === "string") addBlock(spec);
        else {
          addBlock(spec.type);
          if (spec.direction && selectedNode()) selectedNode().direction = spec.direction;
        }
      });
    });

    var sampleBtn = $("designLoadSample");
    if (sampleBtn) sampleBtn.addEventListener("click", loadSampleLayout);
    var htmlSampleBtn = $("designLoadHtmlSample");
    if (htmlSampleBtn) htmlSampleBtn.addEventListener("click", loadCustomHtmlSample);
    var exportBtn = $("designExportLayout");
    if (exportBtn) exportBtn.addEventListener("click", exportLayoutJson);
    var resetBtn = $("designResetLayout");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!confirm("Reset layout to default?")) return;
        global.themeOverridesRef.layoutDesign = ResumeThemeEngine.defaultLayoutDesign();
        selectedNodeId = null;
        notifyChange();
        renderTree();
        renderProperties();
      });
    }
  }

  function init(refs) {
    global.themeOverridesRef = refs.themeOverrides;
    global.themeSelectRef = refs.themeSelect;
    getResumeDataFn = refs.getResumeData;
    setThemeIdFn = refs.setThemeId;
    onChangeCallback = refs.onChange;
    onSelectCallback = refs.onSelect;

    bindToolbar();
    if (!refs.themeOverrides.layoutDesign) {
      refs.themeOverrides.layoutDesign = ResumeThemeEngine.defaultLayoutDesign();
    }
    renderTree();
    renderProperties();
  }

  function refresh() {
    renderTree();
    renderProperties();
    renderHiddenItems();
  }

  function ensureLayoutTheme() {
    if (global.themeSelectRef) global.themeSelectRef.value = "layout-json";
    if (setThemeIdFn) setThemeIdFn("layout-json");
  }

  global.ResumeDesignStudio = {
    init: init,
    refresh: refresh,
    ensureLayoutTheme: ensureLayoutTheme,
    selectNode: selectNode,
    getSelectedNodeId: getSelectedNodeId,
    getDesign: getDesign,
  };
})(typeof window !== "undefined" ? window : this);
