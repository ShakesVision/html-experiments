(function (global) {
  "use strict";
  var S = global.ResumeRenderShared || {
    escapeHtml: function (s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    },
    formatDateRange: function (a, b) {
      return (a || "") + " — " + (b || "Present");
    },
    basicsLocation: function (b) {
      return b && b.location ? [b.location.city, b.location.countryCode].filter(Boolean).join(", ") : "";
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
      "<style>.theme-sp{display:grid;grid-template-columns:200px 1fr;min-height:400px;font-family:Inter,system-ui,sans-serif;font-size:10.5px;line-height:1.45;}" +
      ".theme-sp .side{background:#0f172a;color:#e2e8f0;padding:24px 18px;}" +
      ".theme-sp .side h1{font-size:18px;margin:0 0 4px;color:#fff;}" +
      ".theme-sp .side .lbl{font-size:11px;opacity:.8;margin-bottom:16px;}" +
      ".theme-sp .side .blk{margin-bottom:14px;}" +
      ".theme-sp .side .blk-t{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:4px;}" +
      ".theme-sp .main{padding:24px 28px;color:#1e293b;}" +
      ".theme-sp .main h2{font-size:11px;text-transform:uppercase;color:#0f172a;border-bottom:2px solid #0f172a;padding-bottom:3px;margin:0 0 10px;}" +
      ".theme-sp .job{margin-bottom:12px;}" +
      ".theme-sp .job-t{font-weight:700;}" +
      ".theme-sp ul{margin:4px 0 0 16px;padding:0;}" +
      "</style>";
    html += "<div class='theme-sp'><aside class='side'><h1>" + S.escapeHtml(b.name) + "</h1>";
    if (b.label) html += "<div class='lbl'>" + S.escapeHtml(b.label) + "</div>";
    if (b.email) html += "<div class='blk'><div class='blk-t'>Email</div>" + S.escapeHtml(b.email) + "</div>";
    if (b.phone) html += "<div class='blk'><div class='blk-t'>Phone</div>" + S.escapeHtml(b.phone) + "</div>";
    var loc = S.basicsLocation(b);
    if (loc) html += "<div class='blk'><div class='blk-t'>Location</div>" + S.escapeHtml(loc) + "</div>";
    if (data.skills && data.skills.length) {
      html += "<div class='blk'><div class='blk-t'>Skills</div>";
      data.skills.forEach(function (sk) {
        html += "<div style='margin-bottom:6px'><strong>" + S.escapeHtml(sk.name) + "</strong><br/>" + S.escapeHtml((sk.keywords || []).join(", ")) + "</div>";
      });
      html += "</div>";
    }
    html += "</aside><main class='main'>";
    if (b.summary) html += "<section><h2>Summary</h2><p>" + S.escapeHtml(b.summary) + "</p></section>";
    if (data.work && data.work.length) {
      html += "<section><h2>" + S.getHeading(ov.headings, "work", "Experience") + "</h2>";
      data.work.forEach(function (w) {
        html += "<div class='job'><div class='job-t'>" + S.escapeHtml(w.position) + " @ " + S.escapeHtml(w.company) + "</div>";
        html += "<div style='color:#64748b;font-size:9px'>" + S.escapeHtml(S.formatDateRange(w.startDate, w.endDate)) + "</div><ul>";
        (w.highlights || []).forEach(function (h) {
          if (h) html += "<li>" + S.escapeHtml(h) + "</li>";
        });
        html += "</ul></div>";
      });
      html += "</section>";
    }
    html += "</main></div>";
    return html;
  }

  global.ResumeThemeExternal = { id: "sidebar-pro", name: "Sidebar Pro", render: render };
})(typeof window !== "undefined" ? window : this);
