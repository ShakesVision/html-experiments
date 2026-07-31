/* Resume Studio — JSON layout theme engine (design tree → HTML) */
(function (global) {
  "use strict";

  var S = function () {
    return global.ResumeRenderShared;
  };

  var FIELD_CATALOG = [
    { group: "Basics", path: "basics.name", label: "Full name", kind: "text" },
    { group: "Basics", path: "basics.label", label: "Headline / label", kind: "text" },
    { group: "Basics", path: "basics.email", label: "Email", kind: "text" },
    { group: "Basics", path: "basics.phone", label: "Phone", kind: "text" },
    { group: "Basics", path: "basics.summary", label: "Summary", kind: "text" },
    { group: "Basics", path: "basics.picture", label: "Profile photo", kind: "image" },
    { group: "Basics", path: "basics.location", label: "Location (formatted)", kind: "location" },
    { group: "Work", path: "work", label: "Work experience (list)", kind: "array", section: "work" },
    { group: "Work", path: "work[].company", label: "Company", kind: "text" },
    { group: "Work", path: "work[].position", label: "Position", kind: "text" },
    { group: "Work", path: "work[].location", label: "Location", kind: "text" },
    { group: "Work", path: "work[].startDate", label: "Start date", kind: "text" },
    { group: "Work", path: "work[].endDate", label: "End date", kind: "text" },
    { group: "Work", path: "work[].summary", label: "Summary", kind: "text" },
    { group: "Work", path: "work[].highlights", label: "Highlights", kind: "list" },
    { group: "Education", path: "education", label: "Education (list)", kind: "array", section: "education" },
    { group: "Education", path: "education[].institution", label: "Institution", kind: "text" },
    { group: "Education", path: "education[].area", label: "Field of study", kind: "text" },
    { group: "Education", path: "education[].studyType", label: "Degree type", kind: "text" },
    { group: "Skills", path: "skills", label: "Skills (list)", kind: "array", section: "skills" },
    { group: "Skills", path: "skills[].name", label: "Skill group name", kind: "text" },
    { group: "Skills", path: "skills[].keywords", label: "Keywords", kind: "list" },
    { group: "Projects", path: "projects", label: "Projects (list)", kind: "array", section: "projects" },
    { group: "Projects", path: "projects[].name", label: "Project name", kind: "text" },
    { group: "Projects", path: "projects[].description", label: "Description", kind: "text" },
    { group: "Projects", path: "projects[].url", label: "URL", kind: "text" },
    { group: "Projects", path: "projects[].keywords", label: "Keywords", kind: "list" },
    { group: "Awards", path: "awards", label: "Awards (list)", kind: "array", section: "awards" },
    { group: "Volunteer", path: "volunteer", label: "Volunteer (list)", kind: "array", section: "volunteer" },
    { group: "Publications", path: "publications", label: "Publications (list)", kind: "array", section: "publications" },
    { group: "Languages", path: "languages", label: "Languages (list)", kind: "array", section: "languages" },
    { group: "Interests", path: "interests", label: "Interests (list)", kind: "array", section: "interests" },
    { group: "References", path: "references", label: "References (list)", kind: "array", section: "references" },
  ];

  var SECTION_HEADING_KEYS = {
    profile: "profile",
    work: "work",
    education: "education",
    skills: "skills",
    projects: "projects",
    awards: "awards",
    volunteer: "volunteer",
    publications: "publications",
    languages: "languages",
    interests: "interests",
    references: "references",
  };

  function uid() {
    return "n-" + Math.random().toString(36).slice(2, 9);
  }

  function defaultLayoutDesign() {
    return {
      version: 1,
      name: "My layout",
      root: {
        id: uid(),
        type: "flex",
        direction: "column",
        gap: "12px",
        children: [
          {
            id: uid(),
            type: "flex",
            direction: "row",
            gap: "16px",
            alignItems: "center",
            justifyContent: "space-between",
            children: [
              {
                id: uid(),
                type: "stack",
                flex: "1",
                gap: "4px",
                children: [
                  {
                    id: uid(),
                    type: "field",
                    bind: "basics.name",
                    style: { fontSize: "26px", fontWeight: "700", fontFamily: "Georgia, serif", color: "#111827" },
                  },
                  {
                    id: uid(),
                    type: "field",
                    bind: "basics.label",
                    style: { fontSize: "14px", color: "#475569" },
                  },
                  {
                    id: uid(),
                    type: "field",
                    bind: "basics.location",
                    style: { fontSize: "11px", color: "#64748b", textAlign: "left" },
                  },
                ],
              },
              {
                id: uid(),
                type: "field",
                bind: "basics.picture",
                display: "image",
                style: { width: "80px", height: "80px", borderRadius: "8px", objectFit: "cover" },
              },
            ],
          },
          {
            id: uid(),
            type: "section",
            section: "profile",
            heading: "Summary",
            style: { marginTop: "8px" },
            headingStyle: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#1b4965" },
            bodyStyle: { fontSize: "12px", lineHeight: "1.5", color: "#334155" },
          },
          {
            id: uid(),
            type: "section",
            section: "work",
            heading: "Experience",
            headingStyle: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#1b4965" },
            itemStyle: { marginBottom: "10px" },
            titleStyle: { fontSize: "13px", fontWeight: "600" },
            dateStyle: { fontSize: "11px", color: "#64748b" },
          },
          {
            id: uid(),
            type: "section",
            section: "projects",
            heading: "Projects",
            headingStyle: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#1b4965" },
            itemStyle: { marginBottom: "8px" },
            titleStyle: { fontSize: "13px", fontWeight: "600" },
            bodyStyle: { fontSize: "12px", color: "#475569" },
          },
          {
            id: uid(),
            type: "section",
            section: "skills",
            heading: "Skills",
            headingStyle: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#1b4965" },
            bodyStyle: { fontSize: "12px" },
          },
          {
            id: uid(),
            type: "section",
            section: "education",
            heading: "Education",
            headingStyle: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#1b4965" },
            titleStyle: { fontSize: "13px", fontWeight: "600" },
            dateStyle: { fontSize: "11px", color: "#64748b" },
          },
        ],
      },
    };
  }

  function resolvePath(data, path, itemContext) {
    if (!path) return undefined;
    var src = itemContext != null ? itemContext : data;
    var parts = path.replace(/\[\]/g, "").split(".");
    var cur = src;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var m = p.match(/^(.+)\[(\d+)\]$/);
      if (m) {
        if (!cur || !cur[m[1]]) return undefined;
        cur = cur[m[1]][parseInt(m[2], 10)];
      } else {
        cur = cur && cur[p];
      }
      if (cur === undefined) return undefined;
    }
    return cur;
  }

  function styleToCss(style) {
    if (!style) return "";
    var shared = S();
    return shared ? shared.styleObjToCss(style) : "";
  }

  function wrapTag(tag, className, style, inner, nodeId) {
    if (!inner && inner !== 0) return "";
    var cls = className ? " class='" + className + "'" : "";
    var st = styleToCss(style);
    var attr = st ? " style='" + st + "'" : "";
    if (nodeId) attr += " data-rs-node-id='" + String(nodeId).replace(/'/g, "") + "'";
    return "<" + tag + cls + attr + ">" + inner + "</" + tag + ">";
  }

  function formatLocation(loc) {
    if (!loc) return "";
    if (typeof loc === "string") return loc;
    var shared = S();
    return shared ? shared.basicsLocation({ location: loc }) : [loc.city, loc.region, loc.countryCode].filter(Boolean).join(", ");
  }

  function renderFieldValue(data, node, itemContext) {
    var bind = node.bind || "";
    var display = node.display || "text";
    var val = resolvePath(data, bind, itemContext);

    if (bind === "basics.location" || bind === "location") {
      val = formatLocation(val || (data.basics && data.basics.location));
    }

    if (val == null || val === "") return "";

    if (display === "image" || (bind === "basics.picture" && !display)) {
      var w = (node.style && node.style.width) || "72px";
      var h = (node.style && node.style.height) || "72px";
      var imgStyle = Object.assign({ width: w, height: h, objectFit: "cover" }, node.style || {});
      return "<img src='" + (S().escapeHtml(String(val))) + "' alt='' style='" + styleToCss(imgStyle) + "' />";
    }

    if (Array.isArray(val)) {
      if (node.kind === "list" || bind.indexOf("highlights") >= 0 || bind.indexOf("keywords") >= 0) {
        var items = val.filter(Boolean);
        if (!items.length) return "";
        return "<ul style='margin:4px 0 0 18px;padding:0'>" + items.map(function (x) {
          return "<li>" + S().escapeHtml(String(x)) + "</li>";
        }).join("") + "</ul>";
      }
      return val.map(function (x) {
        return typeof x === "string" ? S().escapeHtml(x) : S().escapeHtml(JSON.stringify(x));
      }).join(", ");
    }

    if (bind.indexOf("endDate") >= 0 || bind.indexOf("startDate") >= 0) {
      return S().escapeHtml(String(val));
    }

    return S().escapeHtml(String(val));
  }

  function isItemHidden(themeOverrides, section, index) {
    var hidden = (themeOverrides && themeOverrides.hiddenEntries) || {};
    var list = hidden[section] || [];
    return list.indexOf(index) >= 0;
  }

  function sectionItems(data, section) {
    if (section === "profile") {
      var summary = data.basics && data.basics.summary;
      return summary ? [{ summary: summary }] : [];
    }
    return data[section] || [];
  }

  function renderSectionBlock(data, node, themeOverrides) {
    var section = node.section;
    if (!section) return "";
    var hiddenSections = (themeOverrides && themeOverrides.hiddenSections) || [];
    if (hiddenSections.indexOf(section) >= 0 || node.hidden) return "";

    var headings = (themeOverrides && themeOverrides.headings) || {};
    var headingKey = SECTION_HEADING_KEYS[section] || section;
    var heading = node.heading || (S().getHeading(headings, headingKey, section.toUpperCase()));
    var items = sectionItems(data, section);
    if (!items.length) return "";

    var body = "";
    items.forEach(function (item, idx) {
      if (isItemHidden(themeOverrides, section, idx)) return;
      body += renderSectionItem(data, section, item, idx, node, themeOverrides);
    });
    if (!body) return "";

    var head = wrapTag("div", "rs-design-section-title", node.headingStyle, S().escapeHtml(heading));
    var content = wrapTag("div", "rs-design-section-body", node.bodyStyle, body);
    return wrapTag("section", "rs-design-section", node.style, head + content, node.id);
  }

  function renderSectionItem(data, section, item, idx, node, themeOverrides) {
    var shared = S();
    var block = "";
    var itemWrapStyle = node.itemStyle || {};

    if (section === "profile") {
      block = wrapTag("p", "", node.bodyStyle, shared.escapeHtml(item.summary || ""));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "work") {
      var title = shared.joinParts([item.company, item.position], ", ");
      block += wrapTag("div", "rs-design-item-head", null,
        wrapTag("span", "", node.titleStyle, shared.escapeHtml(title)) +
        wrapTag("span", "", Object.assign({ float: "right" }, node.dateStyle || {}), shared.formatDateRange(item.startDate, item.endDate))
      );
      if (item.location) block += wrapTag("div", "", node.metaStyle, shared.escapeHtml(item.location));
      if (item.highlights && item.highlights.length) {
        block += "<ul style='margin:4px 0 0 18px'>" + item.highlights.filter(Boolean).map(function (h) {
          return "<li>" + shared.escapeHtml(h) + "</li>";
        }).join("") + "</ul>";
      }
      if (item.summary) block += wrapTag("p", "", node.bodyStyle, shared.escapeHtml(item.summary));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "education") {
      block += wrapTag("div", "", null,
        wrapTag("span", "", node.titleStyle, shared.escapeHtml(item.institution || "")) +
        wrapTag("span", "", Object.assign({ float: "right" }, node.dateStyle || {}), shared.formatDateRange(item.startDate, item.endDate))
      );
      var degree = shared.joinParts([item.studyType, item.area], " — ");
      if (degree) block += wrapTag("div", "", node.bodyStyle, shared.escapeHtml(degree));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "skills") {
      var kw = item.keywords && item.keywords.length ? shared.keywordsList(item.keywords) : "";
      block = wrapTag("div", "", node.bodyStyle,
        (item.name ? wrapTag("strong", "", node.titleStyle, shared.escapeHtml(item.name) + ": ") : "") + kw
      );
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "projects") {
      var name = item.url
        ? "<a href='" + shared.escapeHtml(item.url) + "' style='color:inherit'>" + shared.escapeHtml(item.name || item.url) + "</a>"
        : shared.escapeHtml(item.name || "");
      block += wrapTag("div", "", node.titleStyle, name);
      if (item.description) block += wrapTag("p", "", node.bodyStyle, shared.escapeHtml(item.description));
      if (item.keywords && item.keywords.length) block += wrapTag("div", "", node.metaStyle, shared.keywordsList(item.keywords));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "awards") {
      var t = item.title || "";
      if (item.awarder) t += (t ? ", " : "") + item.awarder;
      block = wrapTag("div", "", node.titleStyle, shared.escapeHtml(t));
      if (item.date) block += wrapTag("span", "", node.dateStyle, " " + shared.escapeHtml(item.date));
      if (item.summary) block += wrapTag("p", "", node.bodyStyle, shared.escapeHtml(item.summary));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "languages") {
      block = shared.escapeHtml(shared.joinParts([item.language, item.fluency], " — "));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    if (section === "volunteer" || section === "publications" || section === "interests" || section === "references") {
      block = wrapTag("div", "", node.bodyStyle, shared.escapeHtml(JSON.stringify(item)));
      return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, block, node.id);
    }

    return wrapTag("div", "rs-design-item rs-page-unit", itemWrapStyle, shared.escapeHtml(JSON.stringify(item)), node.id);
  }

  function renderLoop(data, node, themeOverrides) {
    var bind = (node.bind || "").replace(/\[\]$/, "");
    var items = resolvePath(data, bind) || [];
    if (!Array.isArray(items) || !items.length) return "";
    var html = "";
    items.forEach(function (item, idx) {
      var section = bind;
      if (isItemHidden(themeOverrides, section, idx)) return;
      if (node.itemLayout) {
        html += renderNode(data, node.itemLayout, themeOverrides, item);
      } else {
        html += wrapTag("div", "rs-design-loop-item rs-page-unit", node.itemStyle, S().escapeHtml(JSON.stringify(item)), node.id);
      }
    });
    return html;
  }

  function renderNode(data, node, themeOverrides, itemContext) {
    if (!node || node.hidden) return "";
    var type = node.type || "field";

    if (type === "field") {
      var inner = renderFieldValue(data, node, itemContext);
      if (!inner) return "";
      return wrapTag("div", "rs-design-field rs-page-unit", node.style, inner, node.id);
    }

    if (type === "text") {
      return wrapTag("div", "rs-design-text", node.style, S().escapeHtml(node.text || ""), node.id);
    }

    if (type === "section") {
      return renderSectionBlock(data, node, themeOverrides);
    }

    if (type === "loop") {
      return wrapTag("div", "rs-design-loop", node.style, renderLoop(data, node, themeOverrides), node.id);
    }

    if (type === "flex" || type === "stack") {
      var dir = node.direction || (type === "stack" ? "column" : "row");
      var flexStyle = Object.assign(
        { display: "flex", flexDirection: dir, gap: node.gap || "8px" },
        node.style || {}
      );
      if (node.alignItems) flexStyle.alignItems = node.alignItems;
      if (node.justifyContent) flexStyle.justifyContent = node.justifyContent;
      if (node.flex) flexStyle.flex = node.flex;
      if (node.flexWrap) flexStyle.flexWrap = node.flexWrap;
      var kids = (node.children || []).map(function (c) {
        return renderNode(data, c, themeOverrides, itemContext);
      }).join("");
      return wrapTag("div", "rs-design-flex", flexStyle, kids, node.id);
    }

    if (type === "spacer") {
      return wrapTag("div", "rs-design-spacer", { height: node.height || "12px" }, "&nbsp;", node.id);
    }

    return "";
  }

  function renderLayoutTheme(data, themeOverrides) {
    var design = (themeOverrides && themeOverrides.layoutDesign) || defaultLayoutDesign();
    var root = design.root || design;
    var colors = (themeOverrides && themeOverrides.colors) || {};
    var accent = colors.accent || "#1b4965";

    var css =
      "<style>" +
      ".theme-layout-json{font-family:Georgia,serif;color:#222;line-height:1.4}" +
      ".theme-layout-json a{color:" + accent + ";text-decoration:none}" +
      ".theme-layout-json .rs-design-section{margin-bottom:12px}" +
      ".theme-layout-json .rs-design-section-title{margin-bottom:6px}" +
      ".theme-layout-json .rs-design-item-head{overflow:hidden}" +
      "</style>";

    var body = renderNode(data, root, themeOverrides);
    return css + "<div id='resume' class='theme-layout-json'>" + body + "</div>";
  }

  function findNodeById(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var found = findNodeById(kids[i], id);
      if (found) return found;
    }
    if (node.itemLayout) {
      var inner = findNodeById(node.itemLayout, id);
      if (inner) return inner;
    }
    return null;
  }

  function findParentOfId(node, id, parent) {
    if (!node) return null;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].id === id) return { parent: node, index: i, node: kids[i] };
      var deep = findParentOfId(kids[i], id, node);
      if (deep) return deep;
    }
    if (node.itemLayout) {
      var inLoop = findParentOfId(node.itemLayout, id, node);
      if (inLoop) return inLoop;
    }
    return null;
  }

  function cloneLayout(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  global.ResumeThemeEngine = {
    FIELD_CATALOG: FIELD_CATALOG,
    defaultLayoutDesign: defaultLayoutDesign,
    renderLayoutTheme: renderLayoutTheme,
    findNodeById: findNodeById,
    findParentOfId: findParentOfId,
    cloneLayout: cloneLayout,
    uid: uid,
    resolvePath: resolvePath,
  };

  global.ResumeThemeLayoutJson = {
    id: "layout-json",
    name: "Visual Layout (JSON)",
    render: renderLayoutTheme,
  };
})(typeof window !== "undefined" ? window : this);
