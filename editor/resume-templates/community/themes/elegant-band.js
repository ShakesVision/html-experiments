(function (global) {
  "use strict";
  var S = global.ResumeRenderShared;
  if (!S) {
    S = {
      escapeHtml: function (s) {
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      },
      formatDateRange: function (a, b) {
        return (a || "") + (a ? " — " : "") + (b || "Present");
      },
      basicsLocation: function (b) {
        return b && b.location ? [b.location.city, b.location.countryCode].filter(Boolean).join(", ") : "";
      },
      resolveOverrides: function (o) {
        return o || { headings: {}, hiddenSections: [] };
      },
      getHeading: function (h, k, f) {
        return (h && h[k]) || f;
      },
    };
  }

  function render(data, themeOverrides) {
    var ov = S.resolveOverrides(themeOverrides);
    var b = data.basics || {};
    var accent = (ov.colors && ov.colors.accent) || "#b8860b";
    var html =
      "<style>.theme-eb{font-family:'Source Serif 4',Georgia,serif;font-size:11px;line-height:1.45;color:#1a1a1a;}" +
      ".theme-eb .band{background:#1a1a1a;color:#fff;padding:28px 32px;text-align:center;margin:-4px -4px 20px;}" +
      ".theme-eb .band h1{margin:0;font-size:26px;font-weight:600;letter-spacing:.02em;}" +
      ".theme-eb .band .sub{margin-top:6px;opacity:.85;font-size:13px;}" +
      ".theme-eb .rule{height:3px;background:linear-gradient(90deg,transparent," +
      accent +
      ",transparent);margin:0 0 18px;}" +
      ".theme-eb .sec{margin-bottom:16px;}" +
      ".theme-eb .sec h2{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:" +
      accent +
      ";border-bottom:1px solid #ddd;margin:0 0 8px;padding-bottom:4px;}" +
      ".theme-eb .job{margin-bottom:12px;}" +
      ".theme-eb .job-title{font-weight:700;}" +
      ".theme-eb .job-meta{color:#666;font-size:10px;}" +
      ".theme-eb ul{margin:4px 0 0 18px;}" +
      "</style>";
    html += "<div class='theme-eb'><div class='band'><h1>" + S.escapeHtml(b.name) + "</h1>";
    if (b.label) html += "<div class='sub'>" + S.escapeHtml(b.label) + "</div>";
    html += "</div><div class='rule'></div>";
    var contact = [b.email, b.phone, S.basicsLocation(b)].filter(Boolean).map(S.escapeHtml).join(" · ");
    if (contact) html += "<p style='text-align:center;margin-bottom:16px'>" + contact + "</p>";
    if (b.summary && ov.hiddenSections.indexOf("profile") < 0) {
      html += "<div class='sec'><h2>" + S.getHeading(ov.headings, "profile", "Summary") + "</h2><p>" + S.escapeHtml(b.summary) + "</p></div>";
    }
    if (data.work && data.work.length && ov.hiddenSections.indexOf("work") < 0) {
      html += "<div class='sec'><h2>" + S.getHeading(ov.headings, "work", "Experience") + "</h2>";
      data.work.forEach(function (w) {
        html += "<div class='job'><div class='job-title'>" + S.escapeHtml(w.position) + " — " + S.escapeHtml(w.company) + "</div>";
        html += "<div class='job-meta'>" + S.escapeHtml(S.formatDateRange(w.startDate, w.endDate)) + "</div><ul>";
        (w.highlights || []).forEach(function (h) {
          if (h) html += "<li>" + S.escapeHtml(h) + "</li>";
        });
        html += "</ul></div>";
      });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  global.ResumeThemeExternal = { id: "elegant-band", name: "Elegant Band", render: render };
})(typeof window !== "undefined" ? window : this);
