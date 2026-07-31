(function (global) {
  "use strict";
  var S = global.ResumeRenderShared || {
    escapeHtml: function (s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    },
    formatDateRange: function (a, b) {
      return (a || "") + "–" + (b || "Present");
    },
    resolveOverrides: function (o) {
      return o || { hiddenSections: [], headings: {} };
    },
    getHeading: function (h, k, f) {
      return (h && h[k]) || f;
    },
  };

  function render(data, ov) {
    ov = S.resolveOverrides(ov);
    var b = data.basics || {};
    var html =
      "<style>.theme-cs{font:10px/1.3 Arial,Helvetica,sans-serif;color:#000;}" +
      ".theme-cs h1{font-size:14px;margin:0;text-transform:uppercase;}" +
      ".theme-cs .sub{font-size:10px;margin:2px 0 8px;}" +
      ".theme-cs .line{border-top:1px solid #000;margin:8px 0;}" +
      ".theme-cs .h{font-weight:bold;text-transform:uppercase;font-size:9px;margin:8px 0 4px;}" +
      ".theme-cs .row{margin-bottom:6px;}" +
      ".theme-cs .t{font-weight:bold;}" +
      "</style><div class='theme-cs'>";
    html += "<h1>" + S.escapeHtml(b.name) + "</h1>";
    if (b.label) html += "<div class='sub'>" + S.escapeHtml(b.label) + " | " + S.escapeHtml([b.email, b.phone].filter(Boolean).join(" | ")) + "</div>";
    html += "<div class='line'></div>";
    if (b.summary) html += "<div class='h'>Summary</div><p>" + S.escapeHtml(b.summary) + "</p>";
    if (data.work) {
      html += "<div class='h'>" + S.getHeading(ov.headings, "work", "Experience") + "</div>";
      data.work.forEach(function (w) {
        html += "<div class='row'><span class='t'>" + S.escapeHtml(w.position) + "</span>, " + S.escapeHtml(w.company) + " <span style='float:right'>" + S.escapeHtml(S.formatDateRange(w.startDate, w.endDate)) + "</span>";
        if (w.highlights && w.highlights.length) html += "<br/>• " + S.escapeHtml(w.highlights.filter(Boolean).join(" • "));
        html += "</div>";
      });
    }
    if (data.skills && data.skills.length) {
      html += "<div class='h'>Skills</div>";
      data.skills.forEach(function (sk) {
        html += "<div>" + S.escapeHtml(sk.name) + ": " + S.escapeHtml((sk.keywords || []).join(", ")) + "</div>";
      });
    }
    html += "</div>";
    return html;
  }

  global.ResumeThemeExternal = { id: "compact-stack", name: "Compact Stack", render: render };
})(typeof window !== "undefined" ? window : this);
