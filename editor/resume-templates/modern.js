/* Modern theme — header band + two-column layout for skills */
(function (global) {
  "use strict";

  var S = global.ResumeRenderShared;

  function modernCss(ov) {
    var t = ov.typography;
    var accent = (ov.colors && ov.colors.accent) || "#1b4965";
    return (
      "<style>" +
      ".theme-modern{font-family:" + (t.body.fontFamily || "Inter, sans-serif") + ";font-size:" + (t.body.fontSize || "11px") + ";line-height:" + (t.body.lineHeight || "1.5") + ";color:" + (t.body.color || "#1e293b") + ";}" +
      ".theme-modern .rs-header{background:" + accent + ";color:#fff;padding:24px 28px;margin:-8px -8px 20px;border-radius:8px 8px 0 0;}" +
      ".theme-modern .rs-name{" + S.styleObjToCss(t.name) + ";color:#fff;font-size:26px;}" +
      ".theme-modern .rs-label{color:#e2e8f0;font-size:14px;margin-top:4px;}" +
      ".theme-modern .rs-contact{color:#cbd5e1;font-size:11px;margin-top:8px;}" +
      ".theme-modern .rs-contact a{color:#e2e8f0;}" +
      ".theme-modern .rs-grid{display:grid;grid-template-columns:1fr 220px;gap:24px;}" +
      ".theme-modern .rs-section{margin-bottom:18px;}" +
      ".theme-modern .rs-section-title{" + S.styleObjToCss(t.sectionTitle) + ";color:" + accent + ";font-size:13px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid " + accent + ";padding-bottom:4px;margin-bottom:10px;}" +
      ".theme-modern .rs-job{margin-bottom:14px;page-break-inside:avoid;}" +
      ".theme-modern .rs-job-title{font-weight:700;font-size:12px;}" +
      ".theme-modern .rs-job-meta{color:#64748b;font-size:10px;margin:2px 0 6px;}" +
      ".theme-modern .rs-job ul{margin:4px 0 0 16px;padding:0;}" +
      ".theme-modern .rs-job li{margin-bottom:3px;}" +
      ".theme-modern .rs-sidebar .rs-skill{margin-bottom:8px;}" +
      ".theme-modern .rs-sidebar .rs-skill-name{font-weight:600;font-size:10px;}" +
      ".theme-modern .rs-sidebar .rs-skill-kw{color:#475569;font-size:10px;}" +
      ".theme-modern a{color:" + accent + ";text-decoration:none;}" +
      "</style>"
    );
  }

  function renderModern(data, themeOverrides) {
    var ov = S.resolveOverrides(themeOverrides);
    var b = data.basics || {};

    var html = modernCss(ov);
    html += "<div id='resume' class='theme-modern'>";
    html += "<div class='rs-header'>";
    html += "<div class='rs-name'>" + S.escapeHtml(b.name || "") + "</div>";
    if (b.label) html += "<div class='rs-label'>" + S.escapeHtml(b.label) + "</div>";
    var contact = [];
    if (b.email) contact.push(S.escapeHtml(b.email));
    if (b.phone) contact.push(S.escapeHtml(b.phone));
    var addr = S.basicsLocation(b);
    if (addr) contact.push(S.escapeHtml(addr));
    if (contact.length) html += "<div class='rs-contact'>" + contact.join(" · ") + "</div>";
    if (b.profiles && b.profiles.length) {
      html +=
        "<div class='rs-contact'>" +
        b.profiles
          .map(function (p) {
            var url = S.profileUrl(p);
            return url ? "<a href='" + S.escapeHtml(url) + "'>" + S.escapeHtml(p.network || url) + "</a>" : "";
          })
          .filter(Boolean)
          .join(" · ") +
        "</div>";
    }
    html += "</div>";

    html += "<div class='rs-grid'><div class='rs-main'>";

    if (b.summary && ov.hiddenSections.indexOf("profile") < 0) {
      html +=
        "<div class='rs-section'><div class='rs-section-title'>" +
        S.getHeading(ov.headings, "profile", "Summary") +
        "</div><p>" +
        S.escapeHtml(b.summary) +
        "</p></div>";
    }

    if (ov.hiddenSections.indexOf("work") < 0 && data.work && data.work.length) {
      html +=
        "<div class='rs-section'><div class='rs-section-title'>" +
        S.getHeading(ov.headings, "work", "Experience") +
        "</div>";
      data.work.forEach(function (job) {
        html += "<div class='rs-job'><div class='rs-job-title'>" + S.escapeHtml(job.position || "") + " — " + S.escapeHtml(job.company || "") + "</div>";
        html += "<div class='rs-job-meta'>" + S.escapeHtml(S.formatDateRange(job.startDate, job.endDate).replace(/&mdash;/g, "–"));
        if (job.location) html += " · " + S.escapeHtml(job.location);
        html += "</div>";
        if (job.highlights && job.highlights.length) {
          html += "<ul>";
          job.highlights.forEach(function (h) {
            if (h) html += "<li>" + S.escapeHtml(h) + "</li>";
          });
          html += "</ul>";
        }
        html += "</div>";
      });
      html += "</div>";
    }

    if (ov.hiddenSections.indexOf("projects") < 0 && data.projects && data.projects.length) {
      html +=
        "<div class='rs-section'><div class='rs-section-title'>" +
        S.getHeading(ov.headings, "projects", "Projects") +
        "</div>";
      data.projects.forEach(function (proj) {
        html += "<div class='rs-job'><div class='rs-job-title'>";
        if (proj.url) html += "<a href='" + S.escapeHtml(proj.url) + "'>" + S.escapeHtml(proj.name || "") + "</a>";
        else html += S.escapeHtml(proj.name || "");
        html += "</div>";
        if (proj.description) html += "<p style='margin:4px 0'>" + S.escapeHtml(proj.description) + "</p>";
        html += "</div>";
      });
      html += "</div>";
    }

    if (ov.hiddenSections.indexOf("education") < 0 && data.education && data.education.length) {
      html +=
        "<div class='rs-section'><div class='rs-section-title'>" +
        S.getHeading(ov.headings, "education", "Education") +
        "</div>";
      data.education.forEach(function (edu) {
        html += "<div class='rs-job'><div class='rs-job-title'>" + S.escapeHtml(edu.institution || "") + "</div>";
        html += "<div class='rs-job-meta'>" + S.escapeHtml(S.joinParts([edu.studyType, edu.area], " — ")) + " · " + S.escapeHtml(S.formatDateRange(edu.startDate, edu.endDate).replace(/&mdash;/g, "–")) + "</div></div>";
      });
      html += "</div>";
    }

    html += "</div><div class='rs-sidebar'>";

    if (ov.hiddenSections.indexOf("skills") < 0 && data.skills && data.skills.length) {
      html +=
        "<div class='rs-section'><div class='rs-section-title'>" +
        S.getHeading(ov.headings, "skills", "Skills") +
        "</div>";
      data.skills.forEach(function (sk) {
        html += "<div class='rs-skill'><div class='rs-skill-name'>" + S.escapeHtml(sk.name || "") + "</div>";
        if (sk.keywords && sk.keywords.length) {
          html += "<div class='rs-skill-kw'>" + S.escapeHtml(sk.keywords.join(", ")) + "</div>";
        }
        html += "</div>";
      });
      html += "</div>";
    }

    if (ov.hiddenSections.indexOf("awards") < 0 && data.awards && data.awards.length) {
      html +=
        "<div class='rs-section'><div class='rs-section-title'>" +
        S.getHeading(ov.headings, "awards", "Awards") +
        "</div>";
      data.awards.forEach(function (a) {
        html += "<div class='rs-skill'><div class='rs-skill-name'>" + S.escapeHtml(a.title || "") + "</div>";
        html += "<div class='rs-skill-kw'>" + S.escapeHtml(S.joinParts([a.awarder, a.date], " · ")) + "</div></div>";
      });
      html += "</div>";
    }

    html += "</div></div></div>";
    return html;
  }

  global.ResumeThemeModern = { id: "modern", name: "Modern", render: renderModern };
})(typeof window !== "undefined" ? window : this);
