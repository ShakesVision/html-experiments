/* Shared helpers for resume theme renderers */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function styleObjToCss(obj) {
    if (!obj) return "";
    return Object.keys(obj)
      .map(function (k) {
        var cssKey = k.replace(/[A-Z]/g, function (m) {
          return "-" + m.toLowerCase();
        });
        return cssKey + ":" + obj[k];
      })
      .join(";");
  }

  function formatDateRange(start, end) {
    var s = start || "";
    var e = end || "Present";
    if (!s && !end) return "";
    if (!s) return e;
    return s + " &mdash; " + (end || "Present");
  }

  function joinParts(parts, sep) {
    return parts.filter(Boolean).join(sep || ", ");
  }

  function getHeading(headings, key, fallback) {
    return (headings && headings[key]) || fallback || key.toUpperCase();
  }

  function basicsLocation(basics) {
    if (!basics || !basics.location) return "";
    var loc = basics.location;
    return joinParts([loc.city, loc.region, loc.countryCode], ", ");
  }

  function profileUrl(p) {
    if (p.url) return p.url;
    if (p.network && p.username) {
      var n = p.network.toLowerCase();
      if (n === "github") return "https://github.com/" + p.username;
      if (n === "linkedin") return "https://linkedin.com/in/" + p.username;
    }
    return "";
  }

  function keywordsList(kw) {
    if (!kw || !kw.length) return "";
    return kw.map(function (k) {
      return "<span>" + escapeHtml(k) + "</span>";
    }).join(", ");
  }

  function resolveOverrides(themeOverrides) {
    var schema = global.ResumeSchema;
    var defaults = schema ? schema.defaultThemeOverrides() : { typography: {}, colors: {} };
    var o = themeOverrides || {};
    return {
      typography: Object.assign({}, defaults.typography, o.typography || {}),
      colors: Object.assign({}, defaults.colors, o.colors || {}),
      headings: Object.assign({}, defaults.headings, o.headings || {}),
      sectionOrder: o.sectionOrder || (schema ? schema.DEFAULT_SECTION_ORDER.slice() : []),
      hiddenSections: o.hiddenSections || [],
    };
  }

  global.ResumeRenderShared = {
    escapeHtml: escapeHtml,
    styleObjToCss: styleObjToCss,
    formatDateRange: formatDateRange,
    joinParts: joinParts,
    getHeading: getHeading,
    basicsLocation: basicsLocation,
    profileUrl: profileUrl,
    keywordsList: keywordsList,
    resolveOverrides: resolveOverrides,
    sectionLine: function (colors) {
      return (
        "<div class='rs-section-line' style='border-color:" +
        escapeHtml((colors && colors.divider) || "#CFCFCF") +
        "'></div>"
      );
    },
  };
})(typeof window !== "undefined" ? window : this);
