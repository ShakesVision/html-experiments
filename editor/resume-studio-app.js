/* Resume Studio — JSON Resume editor, preview, export */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  var STORAGE_KEY = "resumeStudioItemsV1";
  var ACTIVE_ITEM_KEY = "resumeStudioActiveItemV1";
  var CUSTOM_THEMES_KEY = "resumeStudioCustomThemesV1";
  var APP_VERSION = "2.0.0";
  var REMOTE_THEMES_MANIFEST =
    "https://cdn.jsdelivr.net/gh/shakesvision/resume-studio-themes@master/manifest.json";
  var LOCAL_THEMES_MANIFEST = "resume-templates/community/manifest.json";

  var savedItems = [];
  var activeItemId = null;
  var resumeData = ResumeSchema.emptyResume();
  var themeId = "onepage";
  var themeOverrides = ResumeSchema.defaultThemeOverrides();
  var pageSettings = ResumeSchema.defaultPageSettings();
  var customCss = "";
  var jsonParseError = "";
  var formRebuildTimer = null;
  var saveTimer = null;
  var syncingForm = false;
  var readOnlyShare = false;

  var histPast = [];
  var histFuture = [];
  var histPresent = "";
  var histRestoring = false;
  var histTimer = null;

  var previewEl = document.getElementById("print-area");
  var formHost = document.getElementById("formHost");
  var jsonTextarea = document.getElementById("jsonTextarea");
  var jsonErrorBanner = document.getElementById("jsonErrorBanner");
  var jsonWarnings = document.getElementById("jsonWarnings");
  var savedListEl = document.getElementById("savedResumeList");
  var titleEl = document.getElementById("resumeTitle");
  var themeSelect = document.getElementById("themeSelect");
  var sectionOrderList = document.getElementById("sectionOrderList");
  var customCssInput = document.getElementById("customCssInput");
  var cssModalEl = document.getElementById("cssModal");
  var pageSizeSelect = document.getElementById("pageSizeSelect");
  var paginateHeightToggle = document.getElementById("paginateHeightToggle");
  var importFileInput = document.getElementById("importFileInput");
  var themeImportInput = document.getElementById("themeImportInput");
  var resumeUploadInput = document.getElementById("resumeUploadInput");

  var TYPO_ROLES = ["name", "label", "body", "sectionTitle", "dates"];
  var TYPO_PROPS = ["fontFamily", "fontSize", "fontWeight", "color"];

  function refreshDesignStudio() {
    if (window.ResumeDesignStudio) ResumeDesignStudio.refresh();
  }

  /* ----------------------------- Undo / redo ----------------------------- */

  function snapshotState() {
    return JSON.stringify({
      data: resumeData,
      themeId: themeId,
      themeOverrides: themeOverrides,
      customCss: customCss,
    });
  }

  function updateUndoButtons() {
    var u = document.getElementById("undoBtn");
    var r = document.getElementById("redoBtn");
    if (u) u.disabled = readOnlyShare || !histPast.length;
    if (r) r.disabled = readOnlyShare || !histFuture.length;
  }

  function histInit() {
    histPresent = snapshotState();
    histPast = [];
    histFuture = [];
    updateUndoButtons();
  }

  function histRecordNow() {
    if (histRestoring || readOnlyShare) return;
    clearTimeout(histTimer);
    var snap = snapshotState();
    if (snap === histPresent) return;
    histPast.push(histPresent);
    if (histPast.length > 60) histPast.shift();
    histPresent = snap;
    histFuture = [];
    updateUndoButtons();
  }

  function histCapture() {
    if (histRestoring || readOnlyShare) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(histRecordNow, 400);
  }

  function applySnapshot(snap) {
    histRestoring = true;
    try {
      var o = JSON.parse(snap);
      resumeData = o.data;
      themeId = o.themeId || "onepage";
      themeOverrides = o.themeOverrides || ResumeSchema.defaultThemeOverrides();
      customCss = o.customCss || "";
      if (themeSelect) themeSelect.value = themeId;
      if (customCssInput) customCssInput.value = customCss;
      rebuildForm();
      syncJsonTextarea();
      updatePhotoPreview();
      renderThemePanel();
      refreshDesignStudio();
      renderPreview();
      showWarnings();
    } finally {
      histRestoring = false;
      updateUndoButtons();
    }
  }

  window.undoEdit = function () {
    if (readOnlyShare || !histPast.length) return;
    clearTimeout(histTimer);
    var cur = snapshotState();
    if (cur !== histPresent) {
      histPast.push(histPresent);
      histPresent = cur;
    }
    histFuture.push(histPresent);
    histPresent = histPast.pop();
    applySnapshot(histPresent);
    autoSave();
  };

  window.redoEdit = function () {
    if (readOnlyShare || !histFuture.length) return;
    histPast.push(histPresent);
    histPresent = histFuture.pop();
    applySnapshot(histPresent);
    autoSave();
  };

  /* ----------------------------- Read-only share ----------------------------- */

  function setReadOnlyMode(on) {
    readOnlyShare = !!on;
    var banner = document.getElementById("readOnlyBanner");
    if (banner) banner.style.display = on ? "flex" : "none";
    document.body.classList.toggle("read-only-share", on);
    document.querySelectorAll("#appRoot input, #appRoot textarea, #appRoot select, #appRoot button").forEach(function (el) {
      if (el.id === "toggleDark") return;
      if (on && (el.onclick && String(el.getAttribute("onclick") || "").indexOf("download") >= 0)) return;
      if (on && (el.getAttribute("onclick") === "window.print()" || el.id === "downloadBtn")) return;
      if (on) el.setAttribute("disabled", "disabled");
      else el.removeAttribute("disabled");
    });
    updateUndoButtons();
  }

  window.exitShareMode = function () {
    location.hash = "";
    setReadOnlyMode(false);
    location.reload();
  };

  window.copyShareLink = function () {
    if (!window.ResumeShare) return;
    var url = ResumeShare.buildShareUrl({
      v: 1,
      data: resumeData,
      themeId: themeId,
      themeOverrides: themeOverrides,
      pageSettings: pageSettings,
      customCss: customCss,
    });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        alert("Share link copied! Anyone with the link can view a read-only preview.");
      });
    } else {
      prompt("Copy this share link:", url);
    }
  };

  function loadShareFromHash() {
    if (!window.ResumeShare) return false;
    var payload = ResumeShare.parseShareFromHash();
    if (!payload || !payload.data) return false;
    resumeData = payload.data;
    themeId = payload.themeId || "onepage";
    themeOverrides = Object.assign(ResumeSchema.defaultThemeOverrides(), payload.themeOverrides || {});
    pageSettings = Object.assign(ResumeSchema.defaultPageSettings(), payload.pageSettings || {});
    customCss = payload.customCss || "";
    if (themeSelect) themeSelect.value = themeId;
    applyPageSettingsToUI();
    renderPreview();
    setReadOnlyMode(true);
    return true;
  }

  /* ----------------------------- Dark mode ----------------------------- */

  function initDarkMode() {
    var root = document.documentElement;
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (localStorage.theme === "dark") root.classList.add("dark");
    else if (localStorage.theme === "light") root.classList.remove("dark");
    else {
      localStorage.theme = prefersDark ? "dark" : "light";
      root.classList.toggle("dark", prefersDark);
    }
    var btn = document.getElementById("toggleDark");
    if (btn) {
      btn.addEventListener("click", function () {
        var isDark = root.classList.toggle("dark");
        localStorage.theme = isDark ? "dark" : "light";
      });
    }
  }

  /* ----------------------------- Photo ----------------------------- */

  function updatePhotoPreview() {
    var img = document.getElementById("photoPreview");
    var pic = resumeData.basics && resumeData.basics.picture;
    if (!img) return;
    if (pic) {
      img.src = pic;
      img.classList.remove("hidden");
    } else {
      img.classList.add("hidden");
      img.removeAttribute("src");
    }
  }

  window.clearPhoto = function () {
    if (readOnlyShare) return;
    histRecordNow();
    if (!resumeData.basics) resumeData.basics = {};
    resumeData.basics.picture = "";
    updatePhotoPreview();
    rebuildForm();
    renderPreview();
    autoSave();
  };

  /* ----------------------------- Community themes ----------------------------- */

  function loadCommunityThemes() {
    var sel = document.getElementById("communityThemeSelect");
    if (!sel || !ResumeThemes.loadThemeManifest) return;
    function onLoaded() {
      sel.innerHTML = '<option value="">— Community theme —</option>';
      ResumeThemes.listThemes().forEach(function (t) {
        if (["onepage", "modern", "minimal", "custom"].indexOf(t.id) >= 0) return;
        var opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = "☁ " + t.name;
        sel.appendChild(opt);
      });
    }
    ResumeThemes.loadThemeManifest(REMOTE_THEMES_MANIFEST)
      .then(onLoaded)
      .catch(function () {
        return ResumeThemes.loadThemeManifest(LOCAL_THEMES_MANIFEST).then(onLoaded);
      })
      .catch(function () {
        sel.innerHTML = '<option value="">Community themes unavailable</option>';
      });
  }

  /* ----------------------------- Tailor / LinkedIn ----------------------------- */

  window.openTailorModal = function () {
    if (readOnlyShare) return;
    var m = document.getElementById("tailorModal");
    if (m) {
      m.classList.remove("hidden");
      m.classList.add("flex");
    }
  };

  window.closeTailorModal = function () {
    var m = document.getElementById("tailorModal");
    if (m) {
      m.classList.add("hidden");
      m.classList.remove("flex");
    }
  };

  window.applyTailorForJob = function () {
    var jobTitle = (document.getElementById("tailorJobTitle").value || "").trim();
    var company = (document.getElementById("tailorCompany").value || "").trim();
    var jd = (document.getElementById("tailorJd").value || "").trim();
    upsertActive();
    var copy = JSON.parse(JSON.stringify(currentState()));
    copy.id = "resume-" + Date.now();
    copy.title = (copy.title || defaultTitle(copy.data)) + (company ? " — " + company : " — tailored");
    copy.updatedAt = Date.now();
    var tailored = copy.data;
    if (!tailored.basics) tailored.basics = {};
    var intro = "Targeting: " + (jobTitle || "role") + (company ? " at " + company : "") + ".";
    if (jd) intro += " " + jd.slice(0, 280) + (jd.length > 280 ? "…" : "");
    tailored.basics.summary = intro + (tailored.basics.summary ? "\n\n" + tailored.basics.summary : "");
    var keywords = ResumeSchema.extractJdKeywords(jd);
    if (keywords.length) {
      var sk = tailored.skills && tailored.skills.length ? tailored.skills[0] : { name: "Job-matched", keywords: [] };
      var merged = sk.keywords ? sk.keywords.slice() : [];
      keywords.forEach(function (k) {
        if (merged.indexOf(k) < 0) merged.push(k);
      });
      sk.keywords = merged;
      if (!tailored.skills || !tailored.skills.length) tailored.skills = [sk];
      else tailored.skills[0] = sk;
    }
    savedItems.push(copy);
    applyItemState(copy);
    closeTailorModal();
    alert("Created tailored copy. Review summary and skills, then export.");
  };

  window.openLinkedInModal = function () {
    if (readOnlyShare) return;
    var m = document.getElementById("linkedInModal");
    if (m) {
      m.classList.remove("hidden");
      m.classList.add("flex");
    }
  };

  window.closeLinkedInModal = function () {
    var m = document.getElementById("linkedInModal");
    if (m) {
      m.classList.add("hidden");
      m.classList.remove("flex");
    }
  };

  window.applyLinkedInImport = function () {
    var raw = document.getElementById("linkedInPaste").value.trim();
    if (!raw) {
      alert("Paste LinkedIn JSON or choose a file.");
      return;
    }
    try {
      var parsed = JSON.parse(raw);
      histRecordNow();
      resumeData = ResumeSchema.linkedInToResume(parsed);
      rebuildForm();
      syncJsonTextarea();
      updatePhotoPreview();
      renderPreview();
      showWarnings();
      autoSave();
      closeLinkedInModal();
      alert("LinkedIn data imported. Review and fill any gaps.");
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  };

  /* ----------------------------- Tabs ----------------------------- */

  window.switchTab = function (tab) {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    document.getElementById("panelForm").classList.toggle("hidden", tab !== "form");
    document.getElementById("panelDesign").classList.toggle("hidden", tab !== "design");
    document.getElementById("panelWysiwyg").classList.toggle("hidden", tab !== "wysiwyg");
    document.getElementById("panelJson").classList.toggle("hidden", tab !== "json");
    document.getElementById("panelTheme").classList.toggle("hidden", tab !== "theme");
    if (tab === "json") syncJsonTextarea();
    if (tab === "theme") renderThemePanel();
    if (tab === "design" || tab === "wysiwyg") {
      if (themeId !== "layout-json" && themeSelect) {
        themeId = "layout-json";
        themeSelect.value = "layout-json";
        renderPreview();
      }
    }
    if (tab === "design") refreshDesignStudio();
    if (tab === "wysiwyg") {
      var toggle = document.getElementById("wysiwygEnableToggle");
      if (toggle && !toggle.checked) {
        toggle.checked = true;
        if (window.ResumeWysiwygBeta) ResumeWysiwygBeta.setActive(true);
      }
      if (window.ResumeWysiwygBeta) {
        ResumeWysiwygBeta.notifyThemeMismatch(themeId === "layout-json");
        ResumeWysiwygBeta.renderQuickPanel();
      }
    } else if (window.ResumeWysiwygBeta && ResumeWysiwygBeta.isActive()) {
      ResumeWysiwygBeta.setActive(false);
      var t = document.getElementById("wysiwygEnableToggle");
      if (t) t.checked = false;
    }
  };

  /* ----------------------------- State ----------------------------- */

  function currentState() {
    return {
      title: titleEl ? titleEl.value.trim() : "",
      data: JSON.parse(JSON.stringify(resumeData)),
      themeId: themeId,
      themeOverrides: JSON.parse(JSON.stringify(themeOverrides)),
      pageSettings: JSON.parse(JSON.stringify(pageSettings)),
      customCss: customCss,
      updatedAt: Date.now(),
    };
  }

  function defaultTitle(data) {
    return (data && data.basics && data.basics.name) || "Untitled Resume";
  }

  function storageItems() {
    try {
      var p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
    if (activeItemId) localStorage.setItem(ACTIVE_ITEM_KEY, activeItemId);
    else localStorage.removeItem(ACTIVE_ITEM_KEY);
  }

  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!activeItemId) return;
      upsertActive(false);
    }, 400);
  }

  function upsertActive(renderList) {
    if (renderList !== false) renderList = true;
    var st = currentState();
    var title = st.title || defaultTitle(st.data);
    if (titleEl && !titleEl.value.trim()) titleEl.value = title;
    if (!activeItemId) activeItemId = "resume-" + Date.now();
    var payload = Object.assign({ id: activeItemId, title: title }, st);
    var idx = savedItems.findIndex(function (i) {
      return i.id === activeItemId;
    });
    if (idx >= 0) savedItems[idx] = payload;
    else savedItems.push(payload);
    persist();
    if (renderList) renderSavedItems();
  }

  function applyItemState(item) {
    if (!item) return;
    activeItemId = item.id;
    resumeData = item.data || ResumeSchema.emptyResume();
    themeId = item.themeId || "onepage";
    themeOverrides = Object.assign(ResumeSchema.defaultThemeOverrides(), item.themeOverrides || {});
    pageSettings = Object.assign(ResumeSchema.defaultPageSettings(), item.pageSettings || {});
    customCss = item.customCss || "";
    if (titleEl) titleEl.value = item.title || defaultTitle(resumeData);
    if (customCssInput) customCssInput.value = customCss;
    var ct = document.getElementById("customTemplateInput");
    if (ct) ct.value = themeOverrides.customTemplate || "";
    if (themeSelect) themeSelect.value = themeId;
    applyPageSettingsToUI();
    rebuildForm();
    syncJsonTextarea();
    renderThemePanel();
    refreshDesignStudio();
    renderPreview();
    renderSavedItems();
    persist();
    updatePhotoPreview();
    histInit();
  }

  /* ----------------------------- JSON editor ----------------------------- */

  function syncJsonTextarea() {
    if (!jsonTextarea || syncingForm) return;
    jsonTextarea.value = JSON.stringify(resumeData, null, 2);
    hideJsonError();
    showWarnings();
  }

  function hideJsonError() {
    jsonParseError = "";
    if (jsonErrorBanner) {
      jsonErrorBanner.classList.remove("visible");
      jsonErrorBanner.textContent = "";
    }
  }

  function showJsonError(msg) {
    jsonParseError = msg;
    if (jsonErrorBanner) {
      jsonErrorBanner.textContent = msg;
      jsonErrorBanner.classList.add("visible");
    }
  }

  function showWarnings() {
    var v = ResumeSchema.validateResume(resumeData);
    var panel = document.getElementById("validationPanel");
    if (panel) {
      if (v.warnings && v.warnings.length) {
        panel.innerHTML = "<strong>Validation</strong><ul class='list-disc ml-4 mt-1'>" + v.warnings.map(function (w) {
          return "<li>" + w + "</li>";
        }).join("") + "</ul>";
        panel.classList.remove("hidden");
      } else {
        panel.classList.add("hidden");
      }
    }
    if (!jsonWarnings) return;
    if (v.warnings && v.warnings.length) {
      jsonWarnings.textContent = v.warnings.join(" ");
      jsonWarnings.classList.remove("hidden");
    } else {
      jsonWarnings.classList.add("hidden");
    }
  }

  window.applyJsonFromTextarea = function () {
    if (!jsonTextarea || readOnlyShare) return;
    try {
      histRecordNow();
      var parsed = JSON.parse(jsonTextarea.value);
      resumeData = parsed;
      hideJsonError();
      rebuildForm();
      renderPreview();
      showWarnings();
      autoSave();
    } catch (e) {
      showJsonError("Invalid JSON: " + e.message);
    }
  };

  if (jsonTextarea) {
    jsonTextarea.addEventListener("blur", function () {
      if (document.getElementById("panelJson").classList.contains("hidden")) return;
      applyJsonFromTextarea();
    });
  }

  /* ----------------------------- Form generator ----------------------------- */

  function isLongTextKey(path, key) {
    if (ResumeSchema.LONG_TEXT_KEYS[key]) return true;
    if (key === "summary" || key === "description" || key === "reference") return true;
    return false;
  }

  function setAtPath(obj, path, value) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      var m = p.match(/^(.+)\[(\d+)\]$/);
      if (m) {
        cur = cur[m[1]][parseInt(m[2], 10)];
      } else {
        if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
        cur = cur[p];
      }
    }
    var last = parts[parts.length - 1];
    var lm = last.match(/^(.+)\[(\d+)\]$/);
    if (lm) cur[lm[1]][parseInt(lm[2], 10)] = value;
    else cur[last] = value;
  }

  function getAtPath(obj, path) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var m = p.match(/^(.+)\[(\d+)\]$/);
      if (m) cur = cur[m[1]][parseInt(m[2], 10)];
      else cur = cur[p];
      if (cur === undefined) return undefined;
    }
    return cur;
  }

  function onFormChange(path, value, inputType) {
    if (syncingForm || readOnlyShare) return;
    histCapture();
    if (inputType === "number") value = value === "" ? null : Number(value);
    if (inputType === "checkbox") value = !!value;
    setAtPath(resumeData, path, value);
    syncJsonTextarea();
    renderPreview();
    refreshDesignStudio();
    autoSave();
  }

  function buildPrimitiveField(path, key, value) {
    var wrap = document.createElement("div");
    wrap.className = "form-field";
    var label = document.createElement("label");
    label.textContent = key;
    wrap.appendChild(label);

    if (typeof value === "boolean") {
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = value;
      cb.addEventListener("change", function () {
        onFormChange(path, cb.checked, "checkbox");
      });
      wrap.appendChild(cb);
      return wrap;
    }

    if (typeof value === "number") {
      var num = document.createElement("input");
      num.type = "number";
      num.value = value;
      num.addEventListener("input", function () {
        onFormChange(path, num.value, "number");
      });
      wrap.appendChild(num);
      return wrap;
    }

    var isLong = isLongTextKey(path, key) || (typeof value === "string" && value.length > 80);
    if (isLong) {
      var ta = document.createElement("textarea");
      ta.value = value || "";
      ta.addEventListener("input", function () {
        onFormChange(path, ta.value, "string");
      });
      wrap.appendChild(ta);
    } else {
      var inp = document.createElement("input");
      inp.type = "text";
      inp.value = value == null ? "" : value;
      inp.addEventListener("input", function () {
        onFormChange(path, inp.value, "string");
      });
      wrap.appendChild(inp);
    }
    return wrap;
  }

  function buildChipList(path, arr) {
    var wrap = document.createElement("div");
    wrap.className = "form-field";
    var label = document.createElement("label");
    label.textContent = path.split(".").pop().replace(/\[\d+\]/, "");
    wrap.appendChild(label);
    var row = document.createElement("div");
    row.className = "chip-row";
    var list = arr.slice();

    function renderChips() {
      row.innerHTML = "";
      list.forEach(function (item, idx) {
        var chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = item;
        var rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "×";
        rm.addEventListener("click", function () {
          list.splice(idx, 1);
          setAtPath(resumeData, path, list);
          renderChips();
          syncJsonTextarea();
          renderPreview();
          autoSave();
        });
        chip.appendChild(rm);
        row.appendChild(chip);
      });
      var addInp = document.createElement("input");
      addInp.type = "text";
      addInp.placeholder = "+ add";
      addInp.className = "border rounded-lg px-2 py-1 text-xs w-24";
      addInp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && addInp.value.trim()) {
          list.push(addInp.value.trim());
          addInp.value = "";
          setAtPath(resumeData, path, list);
          renderChips();
          syncJsonTextarea();
          renderPreview();
          autoSave();
        }
      });
      row.appendChild(addInp);
    }
    renderChips();
    wrap.appendChild(row);
    return wrap;
  }

  function buildObjectCard(path, obj, title, onRemove) {
    var card = document.createElement("div");
    card.className = "form-card";
    var head = document.createElement("div");
    head.className = "flex justify-between items-center mb-2";
    var h = document.createElement("span");
    h.className = "text-sm font-semibold text-slate-700";
    h.textContent = title;
    head.appendChild(h);
    if (onRemove) {
      var del = document.createElement("button");
      del.type = "button";
      del.className = "text-red-500 text-xs";
      del.textContent = "Remove";
      del.addEventListener("click", onRemove);
      head.appendChild(del);
    }
    card.appendChild(head);
    Object.keys(obj).forEach(function (key) {
      if (key === "headings" || key === "sections") return;
      card.appendChild(buildFormFields(obj[key], path + "." + key, key));
    });
    return card;
  }

  function buildFormFields(value, path, key) {
    if (value === null || value === undefined) {
      return buildPrimitiveField(path, key, "");
    }
    if (Array.isArray(value)) {
      if (!value.length) {
        var emptyArr = document.createElement("div");
        emptyArr.className = "form-field";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "text-xs text-blue-600";
        btn.textContent = "Add " + key + " item";
        btn.addEventListener("click", function () {
          var shape = ResumeSchema.SECTION_EMPTY_SHAPES[key];
          if (shape) value.push(JSON.parse(JSON.stringify(shape)));
          else value.push("");
          setAtPath(resumeData, path, value);
          rebuildForm();
          renderPreview();
          autoSave();
        });
        emptyArr.appendChild(btn);
        return emptyArr;
      }
      if (typeof value[0] !== "object") {
        return buildChipList(path, value);
      }
      var frag = document.createDocumentFragment();
      var sectionHead = document.createElement("div");
      sectionHead.className = "form-section-title";
      sectionHead.textContent = ResumeSchema.SECTION_LABELS[key] || key;
      frag.appendChild(sectionHead);
      value.forEach(function (item, idx) {
        var itemPath = path + "[" + idx + "]";
        frag.appendChild(
          buildObjectCard(itemPath, item, (item.name || item.company || item.institution || item.title || key) + " #" + (idx + 1), function () {
            value.splice(idx, 1);
            setAtPath(resumeData, path, value);
            rebuildForm();
            renderPreview();
            autoSave();
          }),
        );
      });
      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "text-sm text-blue-600 mb-3";
      addBtn.textContent = "+ Add " + key + " entry";
      addBtn.addEventListener("click", function () {
        var shape = ResumeSchema.SECTION_EMPTY_SHAPES[key] || {};
        value.push(JSON.parse(JSON.stringify(shape)));
        setAtPath(resumeData, path, value);
        rebuildForm();
        autoSave();
      });
      frag.appendChild(addBtn);
      return frag;
    }
    if (typeof value === "object") {
      var wrap = document.createElement("div");
      if (key && key !== "basics" && key !== "location") {
        var st = document.createElement("div");
        st.className = "form-section-title";
        st.textContent = ResumeSchema.SECTION_LABELS[key] || key;
        wrap.appendChild(st);
      }
      Object.keys(value).forEach(function (k) {
        if (k === "headings" || k === "sections") return;
        wrap.appendChild(buildFormFields(value[k], path + "." + k, k));
      });
      return wrap;
    }
    return buildPrimitiveField(path, key, value);
  }

  function rebuildForm() {
    if (!formHost) return;
    syncingForm = true;
    formHost.innerHTML = "";
    Object.keys(resumeData).forEach(function (key) {
      if (key === "headings" || key === "sections") return;
      formHost.appendChild(buildFormFields(resumeData[key], key, key));
    });
    var addSection = document.createElement("div");
    addSection.className = "mt-4 pt-3 border-t border-slate-200";
    var addLabel = document.createElement("span");
    addLabel.className = "text-xs text-slate-500 mr-2";
    addLabel.textContent = "Add section:";
    addSection.appendChild(addLabel);
    ["volunteer", "publications", "languages", "interests", "references"].forEach(function (sec) {
      if (resumeData[sec]) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "text-xs text-blue-600 mr-2";
      b.textContent = sec;
      b.addEventListener("click", function () {
        resumeData[sec] = [];
        rebuildForm();
        autoSave();
      });
      addSection.appendChild(b);
    });
    formHost.appendChild(addSection);
    syncingForm = false;
  }

  /* ----------------------------- Theme panel ----------------------------- */

  function populateThemeSelect() {
    if (!themeSelect) return;
    themeSelect.innerHTML = "";
    ResumeThemes.listThemes().forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      themeSelect.appendChild(opt);
    });
    themeSelect.value = themeId;
  }

  function renderSectionOrder() {
    if (!sectionOrderList) return;
    sectionOrderList.innerHTML = "";
    var order = themeOverrides.sectionOrder || ResumeSchema.DEFAULT_SECTION_ORDER.slice();
    var hidden = themeOverrides.hiddenSections || [];
    order.forEach(function (sec, idx) {
      var row = document.createElement("div");
      row.className = "section-order-item";
      row.draggable = true;
      row.dataset.section = sec;
      row.innerHTML =
        '<span class="material-symbols-outlined text-slate-400 text-base">drag_indicator</span>' +
        '<span class="flex-1 text-sm">' +
        (ResumeSchema.SECTION_LABELS[sec] || sec) +
        "</span>";
      var vis = document.createElement("input");
      vis.type = "checkbox";
      vis.checked = hidden.indexOf(sec) < 0;
      vis.title = "Visible";
      vis.addEventListener("change", function () {
        var h = themeOverrides.hiddenSections || [];
        if (vis.checked) {
          themeOverrides.hiddenSections = h.filter(function (s) {
            return s !== sec;
          });
        } else if (h.indexOf(sec) < 0) {
          themeOverrides.hiddenSections = h.concat([sec]);
        }
        renderPreview();
        autoSave();
      });
      row.appendChild(vis);
      var up = document.createElement("button");
      up.type = "button";
      up.className = "text-slate-400";
      up.innerHTML = '<span class="material-symbols-outlined text-base">arrow_upward</span>';
      up.addEventListener("click", function () {
        if (idx <= 0) return;
        var o = themeOverrides.sectionOrder.slice();
        var t = o[idx];
        o[idx] = o[idx - 1];
        o[idx - 1] = t;
        themeOverrides.sectionOrder = o;
        renderSectionOrder();
        renderPreview();
        autoSave();
      });
      var down = document.createElement("button");
      down.type = "button";
      down.className = "text-slate-400";
      down.innerHTML = '<span class="material-symbols-outlined text-base">arrow_downward</span>';
      down.addEventListener("click", function () {
        if (idx >= order.length - 1) return;
        var o = themeOverrides.sectionOrder.slice();
        var t = o[idx];
        o[idx] = o[idx + 1];
        o[idx + 1] = t;
        themeOverrides.sectionOrder = o;
        renderSectionOrder();
        renderPreview();
        autoSave();
      });
      row.appendChild(up);
      row.appendChild(down);
      sectionOrderList.appendChild(row);
    });
  }

  function renderThemePanel() {
    populateThemeSelect();
    if (!themeOverrides.sectionOrder) {
      themeOverrides.sectionOrder = ResumeSchema.getSectionOrder(resumeData, themeOverrides);
    }
    renderSectionOrder();
    renderFieldInsertButtons();
    var ct = document.getElementById("customTemplateInput");
    if (ct && themeOverrides.customTemplate != null) ct.value = themeOverrides.customTemplate;
  }

  function renderFieldInsertButtons() {
    var host = document.getElementById("fieldInsertBtns");
    if (!host) return;
    host.innerHTML = "";
    var paths = [
      "basics.name", "basics.label", "basics.email", "basics.phone", "basics.summary",
      "work[0].company", "work[0].position", "education[0].institution", "skills[0].name",
    ];
    paths.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200";
      b.textContent = p;
      b.addEventListener("click", function () {
        var ta = document.getElementById("customTemplateInput");
        if (!ta) return;
        var ins = "{{" + p + "}}";
        var s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd);
        themeOverrides.customTemplate = ta.value;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + ins.length;
        if (themeSelect) themeSelect.value = "custom";
        themeId = "custom";
        renderPreview();
        autoSave();
      });
      host.appendChild(b);
    });
  }

  window.duplicateTheme = function () {
    var name = prompt("Custom theme name", "My Theme");
    if (!name) return;
    var custom = {
      version: 1,
      id: "custom-" + Date.now(),
      name: name,
      baseRenderer: themeId,
      typography: JSON.parse(JSON.stringify(themeOverrides.typography || {})),
      colors: JSON.parse(JSON.stringify(themeOverrides.colors || {})),
      sectionOrder: (themeOverrides.sectionOrder || []).slice(),
      hiddenSections: (themeOverrides.hiddenSections || []).slice(),
      hiddenEntries: JSON.parse(JSON.stringify(themeOverrides.hiddenEntries || {})),
      headings: JSON.parse(JSON.stringify(themeOverrides.headings || {})),
      layoutDesign: themeOverrides.layoutDesign ? JSON.parse(JSON.stringify(themeOverrides.layoutDesign)) : null,
      customCss: customCss,
    };
    var stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || "[]");
    } catch (e) {}
    stored.push(custom);
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(stored));
    alert('Theme "' + name + '" saved to custom themes.');
  };

  window.exportTheme = function () {
    var payload = {
      version: 1,
      id: themeId,
      name: (ResumeThemes.getTheme(themeId) || {}).name || themeId,
      baseRenderer: themeId,
      typography: themeOverrides.typography,
      colors: themeOverrides.colors,
      sectionOrder: themeOverrides.sectionOrder,
      hiddenSections: themeOverrides.hiddenSections,
      hiddenEntries: themeOverrides.hiddenEntries,
      headings: themeOverrides.headings,
      layoutDesign: themeOverrides.layoutDesign,
      customCss: customCss,
    };
    downloadBlob(JSON.stringify(payload, null, 2), "theme.json", "application/json");
  };

  window.triggerThemeImport = function () {
    if (themeImportInput) themeImportInput.click();
  };

  window.loadExternalTheme = function () {
    var url = document.getElementById("externalThemeUrl").value.trim();
    if (!url) return alert("Enter a theme script URL.");
    ResumeThemes.loadExternalTheme(url)
      .then(function (theme) {
        populateThemeSelect();
        themeId = theme.id;
        if (themeSelect) themeSelect.value = themeId;
        renderPreview();
        alert('Loaded external theme: "' + theme.name + '"');
      })
      .catch(function (e) {
        alert(e.message);
      });
  };

  /* ----------------------------- Preview ----------------------------- */

  function getPageTargetDimensions() {
    var size = pageSettings.pageSize || "794x1123";
    if (size === "auto") return null;
    if (size === "custom") {
      var w = parseInt(document.getElementById("pageW").value, 10);
      var h = parseInt(document.getElementById("pageH").value, 10);
      if (w && h) return { w: w, h: h };
      return null;
    }
    var parts = size.split("x");
    return { w: parseInt(parts[0], 10), h: parseInt(parts[1], 10) };
  }

  function applyPageSizeToCards() {
    var dims = getPageTargetDimensions();
    var m = pageSettings.margins || { top: 48, right: 40, bottom: 48, left: 40 };
    Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (card) {
      if (dims) {
        card.style.width = dims.w + "px";
        if (paginateHeightToggle && paginateHeightToggle.checked) card.style.minHeight = dims.h + "px";
        else card.style.minHeight = "";
      } else {
        card.style.width = "";
        card.style.minHeight = "300px";
      }
      card.style.maxWidth = "none";
      card.style.padding = m.top + "px " + m.right + "px " + m.bottom + "px " + m.left + "px";
      card.style.boxSizing = "border-box";
    });
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
    document.getElementById("previewHost").appendChild(card);
    return card;
  }

  function paginateByHeight(html, dims) {
    if (!dims || !paginateHeightToggle || !paginateHeightToggle.checked) return [html];
    var m = pageSettings.margins || { top: 48, right: 40, bottom: 48, left: 40 };

    function collectPageUnits(root) {
      var units = [];
      function walk(el) {
        if (!el || el.nodeType !== 1) return;
        if (el.classList && el.classList.contains("rs-page-unit")) {
          units.push(el);
          return;
        }
        Array.prototype.forEach.call(el.children, walk);
      }
      walk(root);
      return units;
    }

    var probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;left:-99999px;top:0;visibility:hidden;overflow:hidden;width:" +
      dims.w +
      "px;height:" +
      dims.h +
      "px;padding:" +
      m.top +
      "px " +
      m.right +
      "px " +
      m.bottom +
      "px " +
      m.left +
      "px;box-sizing:border-box;";

    var sandbox = document.createElement("div");
    sandbox.innerHTML = html;
    var styleNodes = Array.prototype.slice.call(sandbox.querySelectorAll("style"));
    var styleMarkup = styleNodes
      .map(function (s) {
        return s.outerHTML;
      })
      .join("");

    styleNodes.forEach(function (s) {
      s.parentNode.removeChild(s);
    });

    var root = sandbox.querySelector("#resume") || sandbox.firstElementChild;
    if (!root) return [html];

    var units = collectPageUnits(root);
    if (!units.length) units = Array.prototype.slice.call(root.children);
    if (!units.length) return [html];

    units.forEach(function (el) {
      el.parentNode.removeChild(el);
    });

    document.body.appendChild(probe);
    var pages = [];
    var pageRoot = document.createElement("div");
    pageRoot.id = root.id || "resume";
    pageRoot.className = root.className;

    function measureCurrentPage() {
      probe.innerHTML = "";
      styleNodes.forEach(function (s) {
        probe.appendChild(s.cloneNode(true));
      });
      probe.appendChild(pageRoot);
      return probe.scrollHeight > probe.clientHeight + 2;
    }

    function flushPage() {
      if (!pageRoot.children.length) return;
      pages.push(styleMarkup + pageRoot.outerHTML);
      pageRoot = document.createElement("div");
      pageRoot.id = root.id || "resume";
      pageRoot.className = root.className;
    }

    units.forEach(function (unit) {
      pageRoot.appendChild(unit);
      if (measureCurrentPage() && pageRoot.children.length > 1) {
        pageRoot.removeChild(unit);
        flushPage();
        pageRoot.appendChild(unit);
        if (measureCurrentPage() && pageRoot.children.length === 1) {
          flushPage();
        }
      }
    });

    if (pageRoot.children.length) flushPage();
    document.body.removeChild(probe);
    return pages.length ? pages : [html];
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
      btn.innerHTML = '<span class="material-symbols-outlined">download</span>';
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        downloadCardAsImage(card, index + 1);
      });
      card.appendChild(btn);
    });
    var icon = document.getElementById("downloadBtnIcon");
    if (icon) icon.textContent = cards.length > 1 ? "folder_zip" : "download";
  }

  function renderPreview() {
    if (!previewEl || jsonParseError) return;
    clearExtraPrintPages();
    var html = ResumeThemes.renderResume(resumeData, themeId, themeOverrides, customCss);
    var dims = getPageTargetDimensions();
    var pages = paginateByHeight(html, dims);
    previewEl.innerHTML = pages[0] || "";
    var cards = [previewEl];
    for (var i = 1; i < pages.length; i++) {
      var card = createExtraPrintPage();
      card.innerHTML = pages[i];
      cards.push(card);
    }
    applyPageSizeToCards();
    renderPageChrome(cards);
    if (window.ResumeWysiwygBeta) {
      ResumeWysiwygBeta.notifyThemeMismatch(themeId === "layout-json");
      ResumeWysiwygBeta.afterPreviewRender();
    }
  }

  function applyPageSettingsToUI() {
    if (pageSizeSelect) pageSizeSelect.value = pageSettings.pageSize || "794x1123";
    if (paginateHeightToggle) paginateHeightToggle.checked = pageSettings.paginateHeight !== false;
    var m = pageSettings.margins || {};
    var mt = document.getElementById("marginTop");
    var mr = document.getElementById("marginRight");
    var mb = document.getElementById("marginBottom");
    var ml = document.getElementById("marginLeft");
    if (mt) mt.value = m.top != null ? m.top : 48;
    if (mr) mr.value = m.right != null ? m.right : 40;
    if (mb) mb.value = m.bottom != null ? m.bottom : 48;
    if (ml) ml.value = m.left != null ? m.left : 40;
  }

  function readMarginsFromUI() {
    pageSettings.margins = {
      top: parseInt(document.getElementById("marginTop").value, 10) || 48,
      right: parseInt(document.getElementById("marginRight").value, 10) || 40,
      bottom: parseInt(document.getElementById("marginBottom").value, 10) || 48,
      left: parseInt(document.getElementById("marginLeft").value, 10) || 40,
    };
  }

  /* ----------------------------- Library ----------------------------- */

  function renderSavedItems() {
    if (!savedListEl) return;
    savedListEl.innerHTML = "";
    if (!savedItems.length) {
      var empty = document.createElement("div");
      empty.className = "text-sm text-slate-500 text-center py-6";
      empty.textContent = "No saved resumes yet";
      savedListEl.appendChild(empty);
      return;
    }
    savedItems
      .slice()
      .sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      })
      .forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "saved-item" + (item.id === activeItemId ? " active" : "");
        btn.onclick = function () {
          window.loadResumeItem(item.id);
        };
        var t = document.createElement("div");
        t.className = "font-semibold text-slate-800";
        t.textContent = item.title || "Untitled";
        var meta = document.createElement("div");
        meta.className = "text-xs text-slate-500 mt-1";
        meta.textContent = new Date(item.updatedAt || Date.now()).toLocaleString();
        btn.appendChild(t);
        btn.appendChild(meta);
        savedListEl.appendChild(btn);
      });
  }

  window.createNewResume = function () {
    upsertActive();
    activeItemId = null;
    resumeData = ResumeSchema.emptyResume();
    themeId = "onepage";
    themeOverrides = ResumeSchema.defaultThemeOverrides();
    pageSettings = ResumeSchema.defaultPageSettings();
    customCss = "";
    if (titleEl) titleEl.value = "";
    if (customCssInput) customCssInput.value = "";
    rebuildForm();
    syncJsonTextarea();
    renderThemePanel();
    refreshDesignStudio();
    renderPreview();
    updatePhotoPreview();
    histInit();
    upsertActive();
  };

  window.saveResumeItem = function () {
    upsertActive();
  };

  window.loadResumeItem = function (id) {
    var item = savedItems.find(function (i) {
      return i.id === id;
    });
    if (item) applyItemState(item);
  };

  window.deleteResumeItem = function () {
    if (!activeItemId) return;
    if (!confirm("Delete this resume?")) return;
    savedItems = savedItems.filter(function (i) {
      return i.id !== activeItemId;
    });
    activeItemId = null;
    persist();
    if (savedItems.length) applyItemState(savedItems[0]);
    else window.createNewResume();
  };

  window.duplicateResume = function () {
    upsertActive();
    var copy = JSON.parse(JSON.stringify(savedItems.find(function (i) {
      return i.id === activeItemId;
    })));
    if (!copy) return;
    copy.id = "resume-" + Date.now();
    copy.title = (copy.title || "Resume") + " (copy)";
    copy.updatedAt = Date.now();
    savedItems.push(copy);
    applyItemState(copy);
  };

  window.exportLibrary = function () {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      activeItemId: activeItemId,
      items: savedItems,
    };
    var name = prompt("Export file name", "resume-library-" + new Date().toISOString().slice(0, 10));
    if (name === null) return;
    downloadBlob(JSON.stringify(payload, null, 2), (name.trim() || "resume-library") + ".json", "application/json");
  };

  window.triggerImport = function () {
    if (importFileInput) importFileInput.click();
  };

  window.triggerResumeUpload = function () {
    if (resumeUploadInput) resumeUploadInput.click();
  };

  function importLibraryFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        if (parsed.basics && !parsed.items) {
          resumeData = parsed;
          rebuildForm();
          syncJsonTextarea();
          renderPreview();
          autoSave();
          return;
        }
        var items = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(items)) {
          alert("Invalid library JSON");
          return;
        }
        savedItems = items.map(function (item, i) {
          return normalizeSavedItem(item, i);
        });
        persist();
        renderSavedItems();
        var nextId = parsed.activeItemId || (savedItems[0] && savedItems[0].id);
        if (savedItems.length) {
          applyItemState(
            savedItems.find(function (i) {
              return i.id === nextId;
            }) || savedItems[0],
          );
        }
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function normalizeSavedItem(item, i) {
    return {
      id: item.id || "resume-import-" + Date.now() + "-" + i,
      title: item.title || defaultTitle(item.data),
      data: item.data || item,
      themeId: item.themeId || "onepage",
      themeOverrides: Object.assign(ResumeSchema.defaultThemeOverrides(), item.themeOverrides || {}),
      pageSettings: Object.assign(ResumeSchema.defaultPageSettings(), item.pageSettings || {}),
      customCss: item.customCss || "",
      updatedAt: item.updatedAt || Date.now(),
    };
  }

  /* ----------------------------- Export ----------------------------- */

  function downloadBlob(content, filename, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || "application/octet-stream" });
    var link = document.createElement("a");
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
  }

  function safeFilename() {
    return ((titleEl && titleEl.value.trim()) || defaultTitle(resumeData) || "resume").replace(/[\\/:*?"<>|]/g, "_");
  }

  function cardToCanvas(card) {
    return html2canvas(card, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      ignoreElements: function (el) {
        return el.classList.contains("print-page-label") || el.classList.contains("print-page-download");
      },
    });
  }

  function downloadCardAsImage(card, pageNumber) {
    if (!window.html2canvas) return;
    cardToCanvas(card).then(function (canvas) {
      var safe = safeFilename();
      downloadBlob(
        dataUrlToBlob(canvas.toDataURL("image/png")),
        pageNumber ? safe + "-page-" + pageNumber + ".png" : safe + ".png",
        "image/png",
      );
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var mime = parts[0].match(/:(.*?);/)[1];
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  window.downloadImage = function () {
    if (!previewEl || !window.html2canvas) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".print-page"));
    var safe = safeFilename();
    if (cards.length < 2) {
      var name = prompt("File name", safe);
      if (name === null) return;
      safe = (name.trim() || safe).replace(/[\\/:*?"<>|]/g, "_");
      cardToCanvas(previewEl).then(function (canvas) {
        downloadBlob(dataUrlToBlob(canvas.toDataURL("image/png")), safe + ".png", "image/png");
      });
      return;
    }
    if (!window.JSZip) return alert("JSZip failed to load");
    var zipName = prompt("ZIP file name", safe);
    if (zipName === null) return;
    safe = (zipName.trim() || safe).replace(/[\\/:*?"<>|]/g, "_");
    var zip = new JSZip();
    var chain = Promise.resolve();
    cards.forEach(function (card, index) {
      chain = chain.then(function () {
        return cardToCanvas(card).then(function (canvas) {
          return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
              zip.file(safe + "-page-" + (index + 1) + ".png", blob);
              resolve();
            });
          });
        });
      });
    });
    chain
      .then(function () {
        return zip.generateAsync({ type: "blob" });
      })
      .then(function (blob) {
        downloadBlob(blob, safe + ".zip", "application/zip");
      });
  };

  window.downloadPdf = function () {
    if (!window.jspdf || !window.html2canvas) return alert("PDF library failed to load");
    var cards = Array.prototype.slice.call(document.querySelectorAll(".print-page"));
    var dims = getPageTargetDimensions() || { w: 794, h: 1123 };
    var pdf = new jspdf.jsPDF({
      orientation: dims.w > dims.h ? "l" : "p",
      unit: "px",
      format: [dims.w, dims.h],
    });
    var chain = Promise.resolve();
    cards.forEach(function (card, idx) {
      chain = chain.then(function () {
        return cardToCanvas(card).then(function (canvas) {
          var img = canvas.toDataURL("image/png");
          if (idx > 0) pdf.addPage([dims.w, dims.h]);
          pdf.addImage(img, "PNG", 0, 0, dims.w, dims.h);
        });
      });
    });
    chain.then(function () {
      pdf.save(safeFilename() + ".pdf");
    });
  };

  window.downloadPackage = function () {
    if (!window.JSZip) return alert("JSZip failed to load");
    var safe = safeFilename();
    var zip = new JSZip();
    zip.file("resume.json", JSON.stringify(resumeData, null, 2));
    zip.file(
      "theme.json",
      JSON.stringify(
        {
          version: 1,
          themeId: themeId,
          themeOverrides: themeOverrides,
          customCss: customCss,
        },
        null,
        2,
      ),
    );
    if (customCss) zip.file("custom.css", customCss);
    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          appVersion: APP_VERSION,
          themeName: (ResumeThemes.getTheme(themeId) || {}).name,
          pageCount: document.querySelectorAll(".print-page").length,
        },
        null,
        2,
      ),
    );
    var cards = Array.prototype.slice.call(document.querySelectorAll(".print-page"));
    var chain = Promise.resolve();
    cards.forEach(function (card, index) {
      chain = chain.then(function () {
        return cardToCanvas(card).then(function (canvas) {
          return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
              zip.file("preview-page-" + (index + 1) + ".png", blob);
              resolve();
            });
          });
        });
      });
    });
    chain = chain.then(function () {
      if (!window.jspdf) return;
      var dims = getPageTargetDimensions() || { w: 794, h: 1123 };
      var pdf = new jspdf.jsPDF({ orientation: "p", unit: "px", format: [dims.w, dims.h] });
      return Promise.all(
        cards.map(function (card, idx) {
          return cardToCanvas(card).then(function (canvas) {
            return { idx: idx, img: canvas.toDataURL("image/png") };
          });
        }),
      ).then(function (imgs) {
        imgs.forEach(function (item) {
          if (item.idx > 0) pdf.addPage([dims.w, dims.h]);
          pdf.addImage(item.img, "PNG", 0, 0, dims.w, dims.h);
        });
        zip.file("resume.pdf", pdf.output("blob"));
      });
    });
    chain
      .then(function () {
        return zip.generateAsync({ type: "blob" });
      })
      .then(function (blob) {
        downloadBlob(blob, safe + "-package.zip", "application/zip");
      });
  };

  window.downloadResumeJson = function () {
    downloadBlob(JSON.stringify(resumeData, null, 2), safeFilename() + ".json", "application/json");
  };

  window.downloadPlainText = function () {
    var lines = [];
    var b = resumeData.basics || {};
    lines.push(b.name || "");
    if (b.label) lines.push(b.label);
    lines.push([b.email, b.phone, ResumeRenderShared.basicsLocation(b)].filter(Boolean).join(" | "));
    if (b.summary) {
      lines.push("");
      lines.push("SUMMARY");
      lines.push(b.summary);
    }
    (resumeData.work || []).forEach(function (w) {
      lines.push("");
      lines.push((w.position || "") + " — " + (w.company || ""));
      lines.push(ResumeRenderShared.formatDateRange(w.startDate, w.endDate).replace(/&mdash;/g, "-"));
      (w.highlights || []).forEach(function (h) {
        if (h) lines.push("• " + h);
      });
    });
    downloadBlob(lines.join("\n"), safeFilename() + ".txt", "text/plain");
  };

  /* ----------------------------- Modals ----------------------------- */

  window.toggleCssModal = function (show) {
    if (!cssModalEl) return;
    cssModalEl.classList.toggle("hidden", !show);
    cssModalEl.classList.toggle("flex", !!show);
  };

  window.saveCustomCss = function () {
    customCss = customCssInput ? customCssInput.value : "";
    renderPreview();
    toggleCssModal(false);
    autoSave();
  };

  window.togglePreview = function (show) {
    var overlay = document.getElementById("previewOverlay");
    var body = document.getElementById("previewOverlayBody");
    var host = document.getElementById("previewHost");
    if (!overlay || !body || !host) return;
    var source = show ? host : body;
    var target = show ? body : host;
    while (source.firstChild) target.appendChild(source.firstChild);
    overlay.classList.toggle("open", !!show);
  };

  window.applyCustomSize = function () {
    pageSettings.pageSize = "custom";
    renderPreview();
    autoSave();
  };

  /* ----------------------------- Init ----------------------------- */

  function loadSampleResume(cb) {
    fetch("samples/shakeeb-resume.json")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        cb(data);
      })
      .catch(function () {
        cb(ResumeSchema.emptyResume());
      });
  }

  function initFromStorage() {
    if (loadShareFromHash()) return;
    savedItems = storageItems();
    if (!savedItems.length) {
      loadSampleResume(function (sample) {
        resumeData = sample;
        activeItemId = null;
        if (titleEl) titleEl.value = defaultTitle(sample);
        rebuildForm();
        syncJsonTextarea();
        renderThemePanel();
        renderPreview();
        updatePhotoPreview();
        showWarnings();
        histInit();
        upsertActive();
      });
      return;
    }
    var storedId = localStorage.getItem(ACTIVE_ITEM_KEY);
    var item =
      savedItems.find(function (i) {
        return i.id === storedId;
      }) || savedItems[0];
    applyItemState(item);
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", function () {
      themeId = themeSelect.value;
      renderPreview();
      autoSave();
    });
  }

  var customTemplateInput = document.getElementById("customTemplateInput");
  if (customTemplateInput) {
    customTemplateInput.addEventListener("input", function () {
      themeOverrides.customTemplate = customTemplateInput.value;
      if (themeSelect) themeSelect.value = "custom";
      themeId = "custom";
      renderPreview();
      autoSave();
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", function () {
      var wrap = document.getElementById("customSizeWrap");
      if (pageSizeSelect.value === "custom") {
        wrap.classList.remove("hidden");
        wrap.classList.add("inline-flex");
      } else {
        wrap.classList.add("hidden");
        wrap.classList.remove("inline-flex");
        pageSettings.pageSize = pageSizeSelect.value;
        renderPreview();
        autoSave();
      }
    });
  }

  if (paginateHeightToggle) {
    paginateHeightToggle.addEventListener("change", function () {
      pageSettings.paginateHeight = paginateHeightToggle.checked;
      renderPreview();
      autoSave();
    });
  }

  ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", function () {
        readMarginsFromUI();
        renderPreview();
        autoSave();
      });
    }
  });

  if (importFileInput) {
    importFileInput.addEventListener("change", function (e) {
      importLibraryFile(e.target.files && e.target.files[0]);
      e.target.value = "";
    });
  }
  if (resumeUploadInput) {
    resumeUploadInput.addEventListener("change", function (e) {
      importLibraryFile(e.target.files && e.target.files[0]);
      e.target.value = "";
    });
  }
  if (themeImportInput) {
    themeImportInput.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var t = JSON.parse(ev.target.result);
          if (t.typography) themeOverrides.typography = t.typography;
          if (t.colors) themeOverrides.colors = t.colors;
          if (t.sectionOrder) themeOverrides.sectionOrder = t.sectionOrder;
          if (t.hiddenSections) themeOverrides.hiddenSections = t.hiddenSections;
          if (t.hiddenEntries) themeOverrides.hiddenEntries = t.hiddenEntries;
          if (t.headings) themeOverrides.headings = t.headings;
          if (t.layoutDesign) themeOverrides.layoutDesign = t.layoutDesign;
          if (t.customCss) {
            customCss = t.customCss;
            if (customCssInput) customCssInput.value = customCss;
          }
          if (t.baseRenderer) {
            themeId = t.baseRenderer;
            if (themeSelect) themeSelect.value = themeId;
          }
          renderThemePanel();
          renderPreview();
          autoSave();
        } catch (err) {
          alert("Invalid theme file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  var roundedToggle = document.getElementById("roundedToggle");
  if (roundedToggle) {
    roundedToggle.addEventListener("change", function () {
      var sq = !roundedToggle.checked;
      Array.prototype.forEach.call(document.querySelectorAll(".print-page"), function (card) {
        card.classList.toggle("square-corners", sq);
        card.classList.toggle("rounded-3xl", !sq);
      });
    });
  }

  if (cssModalEl) {
    cssModalEl.addEventListener("click", function (e) {
      if (e.target === cssModalEl) toggleCssModal(false);
    });
  }

  var previewOverlayEl = document.getElementById("previewOverlay");
  if (previewOverlayEl) {
    previewOverlayEl.addEventListener("click", function (e) {
      if (e.target === previewOverlayEl) togglePreview(false);
    });
  }

  function initBackToTop() {
    var btn = document.getElementById("backToTopBtn");
    if (!btn) return;
    var scrollTargets = function () {
      return Array.prototype.slice.call(document.querySelectorAll("[data-scroll-panel]"));
    };
    function onScroll() {
      var show = scrollTargets().some(function (el) {
        return !el.classList.contains("hidden") && el.scrollTop > 200;
      });
      btn.classList.toggle("visible", show);
    }
    scrollTargets().forEach(function (el) {
      el.addEventListener("scroll", onScroll, { passive: true });
    });
    btn.addEventListener("click", function () {
      scrollTargets().forEach(function (el) {
        if (!el.classList.contains("hidden")) el.scrollTo({ top: 0, behavior: "smooth" });
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function initDesignStudio() {
    if (!window.ResumeDesignStudio) return;
    ResumeDesignStudio.init({
      themeOverrides: themeOverrides,
      getResumeData: function () {
        return resumeData;
      },
      themeSelect: themeSelect,
      setThemeId: function (id) {
        themeId = id;
      },
      onChange: function () {
        themeId = "layout-json";
        if (themeSelect) themeSelect.value = "layout-json";
        histCapture();
        renderPreview();
        autoSave();
      },
      onSelect: function (id) {
        if (window.ResumeWysiwygBeta) ResumeWysiwygBeta.syncFromDesign(id);
      },
    });
  }

  function initWysiwygBeta() {
    if (!window.ResumeWysiwygBeta) return;
    ResumeWysiwygBeta.init({
      getThemeOverrides: function () {
        return themeOverrides;
      },
      getThemeId: function () {
        return themeId;
      },
      ensureLayoutTheme: function () {
        themeId = "layout-json";
        if (themeSelect) themeSelect.value = "layout-json";
        renderPreview();
      },
      onChange: function () {
        histCapture();
        renderPreview();
        autoSave();
        refreshDesignStudio();
      },
      onSelect: function (id, fromPreview) {
        if (window.ResumeDesignStudio) ResumeDesignStudio.selectNode(id);
        if (fromPreview) {
          var row = document.querySelector('.design-tree-row[data-node-id="' + id + '"]');
          if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      },
    });
  }

  populateThemeSelect();
  initDarkMode();
  loadCommunityThemes();
  initBackToTop();
  initDesignStudio();
  initWysiwygBeta();

  var photoFileInput = document.getElementById("photoFileInput");
  if (photoFileInput) {
    photoFileInput.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file || readOnlyShare) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        histRecordNow();
        if (!resumeData.basics) resumeData.basics = {};
        resumeData.basics.picture = ev.target.result;
        updatePhotoPreview();
        rebuildForm();
        renderPreview();
        autoSave();
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    });
  }

  var communityThemeSelect = document.getElementById("communityThemeSelect");
  if (communityThemeSelect) {
    communityThemeSelect.addEventListener("change", function () {
      if (!communityThemeSelect.value) return;
      themeId = communityThemeSelect.value;
      if (themeSelect) themeSelect.value = themeId;
      renderPreview();
      autoSave();
    });
  }

  var linkedInFile = document.getElementById("linkedInFile");
  if (linkedInFile) {
    linkedInFile.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        document.getElementById("linkedInPaste").value = ev.target.result;
      };
      reader.readAsText(file);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (readOnlyShare) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undoEdit();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      redoEdit();
    }
  });

  ["tailorModal", "linkedInModal"].forEach(function (id) {
    var m = document.getElementById(id);
    if (m) m.addEventListener("click", function (e) {
      if (e.target === m) {
        m.classList.add("hidden");
        m.classList.remove("flex");
      }
    });
  });

  initFromStorage();
});
