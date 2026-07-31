/* Minimal ATS-friendly single-column theme */
(function (global) {
  "use strict";

  var S = global.ResumeRenderShared;

  function minimalCss(ov) {
    var t = ov.typography;
    return (
      "<style>" +
      ".theme-minimal{font-family:" + (t.body.fontFamily || "Arial, Helvetica, sans-serif") + ";font-size:" + (t.body.fontSize || "11pt") + ";line-height:1.35;color:#000;max-width:100%;}" +
      ".theme-minimal .rs-name{font-size:16pt;font-weight:bold;margin-bottom:2px;}" +
      ".theme-minimal .rs-label{font-size:11pt;margin-bottom:6px;}" +
      ".theme-minimal .rs-contact{font-size:10pt;margin-bottom:12px;}" +
      ".theme-minimal .rs-h2{font-size:11pt;font-weight:bold;text-transform:uppercase;margin:14px 0 6px;border-bottom:1px solid #000;padding-bottom:2px;}" +
      ".theme-minimal .rs-entry{margin-bottom:10px;}" +
      ".theme-minimal .rs-entry-title{font-weight:bold;}" +
      ".theme-minimal .rs-entry-sub{font-size:10pt;}" +
      ".theme-minimal ul{margin:4px 0 0 18px;padding:0;}" +
      ".theme-minimal li{margin-bottom:2px;}" +
      ".theme-minimal a{color:#000;text-decoration:underline;}" +
      "</style>"
    );
  }

  function renderMinimal(data, themeOverrides) {
    var ov = S.resolveOverrides(themeOverrides);
    var b = data.basics || {};
    var html = minimalCss(ov);
    html += "<div id='resume' class='theme-minimal'>";
    html += "<div class='rs-name'>" + S.escapeHtml(b.name || "") + "</div>";
    if (b.label) html += "<div class='rs-label'>" + S.escapeHtml(b.label) + "</div>";
    var contact = [];
    if (b.email) contact.push(S.escapeHtml(b.email));
    if (b.phone) contact.push(S.escapeHtml(b.phone));
    var addr = S.basicsLocation(b);
    if (addr) contact.push(S.escapeHtml(addr));
    if (contact.length) html += "<div class='rs-contact'>" + contact.join(" | ") + "</div>";

    if (b.summary && ov.hiddenSections.indexOf("profile") < 0) {
      html +=
        "<div class='rs-h2'>" +
        S.getHeading(ov.headings, "profile", "Summary") +
        "</div><p>" +
        S.escapeHtml(b.summary) +
        "</p>";
    }

    if (ov.hiddenSections.indexOf("work") < 0 && data.work && data.work.length) {
      html += "<div class='rs-h2'>" + S.getHeading(ov.headings, "work", "Experience") + "</div>";
      data.work.forEach(function (job) {
        html += "<div class='rs-entry'><div class='rs-entry-title'>" + S.escapeHtml(job.position || "") + " — " + S.escapeHtml(job.company || "") + "</div>";
        html += "<div class='rs-entry-sub'>" + S.escapeHtml(S.formatDateRange(job.startDate, job.endDate).replace(/&mdash;/g, "-"));
        if (job.location) html += " | " + S.escapeHtml(job.location);
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
    }

    if (ov.hiddenSections.indexOf("skills") < 0 && data.skills && data.skills.length) {
      html += "<div class='rs-h2'>" + S.getHeading(ov.headings, "skills", "Skills") + "</div>";
      data.skills.forEach(function (sk) {
        html += "<div class='rs-entry'><span class='rs-entry-title'>" + S.escapeHtml(sk.name || "") + ":</span> ";
        if (sk.keywords) html += S.escapeHtml(sk.keywords.join(", "));
        html += "</div>";
      });
    }

    if (ov.hiddenSections.indexOf("projects") < 0 && data.projects && data.projects.length) {
      html += "<div class='rs-h2'>" + S.getHeading(ov.headings, "projects", "Projects") + "</div>";
      data.projects.forEach(function (p) {
        html += "<div class='rs-entry'><div class='rs-entry-title'>" + S.escapeHtml(p.name || "") + "</div>";
        if (p.description) html += "<p>" + S.escapeHtml(p.description) + "</p>";
        html += "</div>";
      });
    }

    if (ov.hiddenSections.indexOf("education") < 0 && data.education && data.education.length) {
      html += "<div class='rs-h2'>" + S.getHeading(ov.headings, "education", "Education") + "</div>";
      data.education.forEach(function (edu) {
        html += "<div class='rs-entry'><div class='rs-entry-title'>" + S.escapeHtml(edu.institution || "") + "</div>";
        html += "<div class='rs-entry-sub'>" + S.escapeHtml(S.joinParts([edu.studyType, edu.area], ", ")) + " | " + S.escapeHtml(S.formatDateRange(edu.startDate, edu.endDate).replace(/&mdash;/g, "-")) + "</div></div>";
      });
    }

    if (ov.hiddenSections.indexOf("awards") < 0 && data.awards && data.awards.length) {
      html += "<div class='rs-h2'>" + S.getHeading(ov.headings, "awards", "Awards") + "</div>";
      data.awards.forEach(function (a) {
        html += "<div class='rs-entry'>" + S.escapeHtml(S.joinParts([a.title, a.awarder, a.date], " — ")) + "</div>";
      });
    }

    html += "</div>";
    return html;
  }

  global.ResumeThemeMinimal = { id: "minimal", name: "Minimal ATS", render: renderMinimal };
})(typeof window !== "undefined" ? window : this);
