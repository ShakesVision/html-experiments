/**
 * Sample external theme for Resume Studio.
 * Host on GitHub and load via:
 * https://cdn.jsdelivr.net/gh/YOUR_USER/YOUR_REPO@main/external-theme-sample.js
 *
 * Must assign global.ResumeThemeExternal = { id, name, render(data, themeOverrides) }
 */
(function (global) {
  "use strict";
  var S = global.ResumeRenderShared;

  function render(data, themeOverrides) {
    var ov = S.resolveOverrides(themeOverrides);
    var b = data.basics || {};
    var html =
      "<style>.theme-external{font-family:system-ui,sans-serif;padding:8px;}" +
      ".theme-external h1{margin:0 0 4px;font-size:22px;color:" +
      (ov.colors.accent || "#1b4965") +
      ";}" +
      ".theme-external .sub{color:#64748b;margin-bottom:12px;}" +
      "</style>";
    html += "<div class='theme-external'><h1>" + S.escapeHtml(b.name || "") + "</h1>";
    if (b.label) html += "<div class='sub'>" + S.escapeHtml(b.label) + "</div>";
    if (b.summary) html += "<p>" + S.escapeHtml(b.summary) + "</p>";
    html += "</div>";
    return html;
  }

  global.ResumeThemeExternal = {
    id: "external-sample",
    name: "External Sample",
    render: render,
  };
})(typeof window !== "undefined" ? window : this);
