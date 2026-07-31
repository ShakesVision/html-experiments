(function (global) {
  "use strict";
  var S = global.ResumeRenderShared || {
    escapeHtml: function (s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    },
    formatDateRange: function (a, b) {
      return (a || "") + " → " + (b || "Present");
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
    var accent = "#22d3ee";
    var html =
      "<style>.theme-tl{font-family:'Inter',system-ui,sans-serif;font-size:11px;line-height:1.5;color:#e2e8f0;background:#0b1220;padding:20px;}" +
      ".theme-tl .top{border-left:4px solid " +
      accent +
      ";padding-left:14px;margin-bottom:18px;}" +
      ".theme-tl h1{margin:0;font-family:ui-monospace,monospace;font-size:22px;color:#fff;}" +
      ".theme-tl .tag{display:inline-block;background:#164e63;color:#a5f3fc;font-size:9px;padding:2px 8px;border-radius:4px;margin-top:6px;font-family:monospace;}" +
      ".theme-tl h2{font-family:monospace;font-size:10px;color:" +
      accent +
      ";text-transform:uppercase;margin:16px 0 8px;}" +
      ".theme-tl .job{margin-bottom:12px;padding:10px;background:#111827;border-radius:8px;border:1px solid #1e293b;}" +
      ".theme-tl .job-t{color:#fff;font-weight:600;}" +
      ".theme-tl .job-m{font-family:monospace;font-size:9px;color:#94a3b8;}" +
      ".theme-tl ul{margin:6px 0 0 16px;color:#cbd5e1;}" +
      ".theme-tl .skills{display:flex;flex-wrap:wrap;gap:6px;}" +
      ".theme-tl .sk{background:#1e293b;border:1px solid #334155;padding:3px 8px;border-radius:4px;font-family:monospace;font-size:9px;}" +
      "</style><div class='theme-tl'><div class='top'><h1>" +
      S.escapeHtml(b.name) +
      "</h1>";
    if (b.label) html += "<div class='tag'>" + S.escapeHtml(b.label) + "</div>";
    html += "</div>";
    if (b.summary) html += "<h2>// summary</h2><p>" + S.escapeHtml(b.summary) + "</p>";
    if (data.work && data.work.length) {
      html += "<h2>// " + S.getHeading(ov.headings, "work", "experience") + "</h2>";
      data.work.forEach(function (w) {
        html += "<div class='job'><div class='job-t'>" + S.escapeHtml(w.position) + "</div><div class='job-m'>" + S.escapeHtml(w.company) + " · " + S.escapeHtml(S.formatDateRange(w.startDate, w.endDate)) + "</div><ul>";
        (w.highlights || []).forEach(function (h) {
          if (h) html += "<li>" + S.escapeHtml(h) + "</li>";
        });
        html += "</ul></div>";
      });
    }
    if (data.skills && data.skills.length) {
      html += "<h2>// stack</h2><div class='skills'>";
      data.skills.forEach(function (sk) {
        (sk.keywords || []).forEach(function (k) {
          html += "<span class='sk'>" + S.escapeHtml(k) + "</span>";
        });
      });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  global.ResumeThemeExternal = { id: "tech-lead", name: "Tech Lead", render: render };
})(typeof window !== "undefined" ? window : this);
