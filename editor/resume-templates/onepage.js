/* Onepage theme — port of jsonresume-theme-onepage / preview.html */
(function (global) {
  "use strict";

  var S = global.ResumeRenderShared;

  function onepageCss(ov) {
    var t = ov.typography;
    var body = S.styleObjToCss(t.body);
    var name = S.styleObjToCss(t.name);
    var label = S.styleObjToCss(t.label);
    var sectionTitle = S.styleObjToCss(t.sectionTitle);
    var dates = S.styleObjToCss(t.dates);
    return (
      "<style>" +
      ".theme-onepage{font:" + (t.body.fontSize || "12px") + " " + (t.body.fontFamily || "Georgia, serif") + ";line-height:" + (t.body.lineHeight || "1.4") + ";color:" + (t.body.color || "#222") + ";}" +
      ".theme-onepage .rs-name{" + name + "}" +
      ".theme-onepage .rs-label{" + label + "}" +
      ".theme-onepage .rs-body{" + body + "}" +
      ".theme-onepage .rs-section-name{" + sectionTitle + ";text-transform:uppercase;}" +
      ".theme-onepage .rs-date{" + dates + ";float:right;}" +
      ".theme-onepage .rs-title{font-weight:bold;}" +
      ".theme-onepage .rs-section-block{display:flex;width:100%;}" +
      ".theme-onepage .rs-section-name-col{width:18%;vertical-align:top;display:inline-block;}" +
      ".theme-onepage .rs-section-content{width:80%;vertical-align:top;display:inline-block;}" +
      ".theme-onepage .rs-section-content ul{padding-left:20px;margin-top:6px;list-style-type:circle;}" +
      ".theme-onepage .rs-section-line{border-style:dashed;border-width:1px;margin:10px 0;}" +
      ".theme-onepage .rs-divider{font-weight:bold;margin:0 5px;}" +
      ".theme-onepage .rs-job-block{page-break-inside:avoid;}" +
      ".theme-onepage .rs-separator{height:14px;}" +
      ".theme-onepage .rs-skill-block{margin-bottom:4px;}" +
      ".theme-onepage a{text-decoration:none;color:inherit;}" +
      ".theme-onepage a:hover{text-decoration:underline;}" +
      "</style>"
    );
  }

  function renderHeader(data, ov) {
    var b = data.basics || {};
    var html = "<div class='rs-name-block rs-page-unit'>";
    html += "<span class='rs-name'>" + S.escapeHtml(b.name || "") + "</span>";
    if (b.label) html += ", <span class='rs-label'>" + S.escapeHtml(b.label) + "</span>";
    html += "</div><div class='rs-body rs-contact'>";
    var contact = [];
    if (b.email) contact.push("<span>" + S.escapeHtml(b.email) + "</span>");
    if (b.phone) contact.push("<span>" + S.escapeHtml(b.phone) + "</span>");
    var addr = S.basicsLocation(b);
    if (addr) contact.push("<span>" + S.escapeHtml(addr) + "</span>");
    html += contact.join("<span class='rs-divider'>|</span>");
    html += "</div>";
    if (b.profiles && b.profiles.length) {
      html += "<div class='rs-profiles rs-body'>";
      html += b.profiles
        .map(function (p) {
          var url = S.profileUrl(p);
          if (!url) return "";
          return "<span class='rs-url'><a href='" + S.escapeHtml(url) + "'>" + S.escapeHtml(url) + "</a></span>";
        })
        .filter(Boolean)
        .join("<span class='rs-divider'>|</span>");
      html += "</div>";
    }
    if (b.picture) {
      html =
        "<div style='display:flex;gap:16px;align-items:flex-start'>" +
        "<img src='" +
        S.escapeHtml(b.picture) +
        "' alt='' style='width:72px;height:72px;object-fit:cover;border-radius:8px' />" +
        "<div>" +
        html +
        "</div></div>";
    }
    return html;
  }

  function sectionBlock(title, content) {
    if (!content) return "";
    return (
      "<div class='rs-section-block rs-page-unit'>" +
      "<div class='rs-section-name-col rs-section-name'><span>" +
      S.escapeHtml(title) +
      "</span></div>" +
      "<div class='rs-section-content rs-body'>" +
      content +
      "</div></div>"
    );
  }

  function renderProfile(data, ov) {
    var summary = (data.basics && data.basics.summary) || "";
    if (!summary) return "";
    return sectionBlock(S.getHeading(ov.headings, "profile", "SUMMARY"), "<span>" + S.escapeHtml(summary) + "</span>");
  }

  function renderWork(data) {
    var items = data.work || [];
    if (!items.length) return "";
    var html = items
      .map(function (job, idx) {
        var title = S.joinParts([job.company, job.position], ", ");
        var block =
          "<div class='rs-job-block'>" +
          "<div class='rs-block-header'>" +
          "<span class='rs-title'>" +
          S.escapeHtml(title) +
          "</span>" +
          "<span class='rs-date'>" +
          S.formatDateRange(job.startDate, job.endDate) +
          "</span></div>";
        if (job.location) block += "<div>" + S.escapeHtml(job.location) + "</div>";
        if (job.highlights && job.highlights.length) {
          block += "<ul>";
          job.highlights.forEach(function (h) {
            if (h) block += "<li>" + S.escapeHtml(h) + "</li>";
          });
          block += "</ul>";
        }
        if (job.summary) block += "<p>" + S.escapeHtml(job.summary) + "</p>";
        if (idx < items.length - 1) block += "<div class='rs-separator'></div>";
        block += "</div>";
        return block;
      })
      .join("");
    return html;
  }

  function renderEducation(data) {
    var items = data.education || [];
    if (!items.length) return "";
    return items
      .map(function (edu, idx) {
        var block =
          "<div class='rs-edu-block'>" +
          "<span class='rs-title'>" +
          S.escapeHtml(edu.institution || "") +
          "</span>" +
          "<span class='rs-date'>" +
          S.formatDateRange(edu.startDate, edu.endDate) +
          "</span>";
        var degree = S.joinParts([edu.studyType, edu.area], " - ");
        if (degree) block += "<div>" + S.escapeHtml(degree) + "</div>";
        if (edu.location) block += "<div>" + S.escapeHtml(edu.location) + "</div>";
        if (idx < items.length - 1) block += "<div class='rs-separator'></div>";
        block += "</div>";
        return block;
      })
      .join("");
  }

  function renderSkills(data) {
    var items = data.skills || [];
    if (!items.length) return "";
    return items
      .map(function (sk) {
        var kw = sk.keywords && sk.keywords.length ? S.keywordsList(sk.keywords) : "";
        return (
          "<div class='rs-skill-block'>" +
          "<span class='rs-title'>" +
          S.escapeHtml(sk.name || "") +
          (sk.name ? ":" : "") +
          "</span> " +
          kw +
          "</div>"
        );
      })
      .join("");
  }

  function renderProjects(data) {
    var items = data.projects || [];
    if (!items.length) return "";
    return items
      .map(function (p, idx) {
        var block = "<div class='rs-project-block'>";
        if (p.url) {
          block += "<span class='rs-title'><a href='" + S.escapeHtml(p.url) + "'>" + S.escapeHtml(p.name || p.url) + "</a></span>";
        } else {
          block += "<span class='rs-title'>" + S.escapeHtml(p.name || "") + "</span>";
        }
        if (p.description) block += "<p>" + S.escapeHtml(p.description) + "</p>";
        if (p.keywords && p.keywords.length) block += "<div>" + S.keywordsList(p.keywords) + "</div>";
        if (idx < items.length - 1) block += "<div class='rs-separator'></div>";
        block += "</div>";
        return block;
      })
      .join("");
  }

  function renderAwards(data) {
    var items = data.awards || [];
    if (!items.length) return "";
    return items
      .map(function (a, idx) {
        var title = a.title || "";
        if (a.awarder) title += (title ? ", " : "") + a.awarder;
        var block =
          "<div class='rs-award-block'>" +
          "<div class='rs-block-header'>" +
          "<span class='rs-title'>" +
          S.escapeHtml(title) +
          "</span>" +
          "<span class='rs-date'>" +
          S.escapeHtml(a.date || "") +
          "</span></div>";
        if (a.summary) block += "<p>" + S.escapeHtml(a.summary) + "</p>";
        if (idx < items.length - 1) block += "<div class='rs-separator'></div>";
        block += "</div>";
        return block;
      })
      .join("");
  }

  function renderVolunteer(data) {
    var items = data.volunteer || [];
    if (!items.length) return "";
    return items
      .map(function (v) {
        return (
          "<div class='rs-job-block'>" +
          "<span class='rs-title'>" +
          S.escapeHtml(S.joinParts([v.organization, v.position], ", ")) +
          "</span>" +
          "<span class='rs-date'>" +
          S.formatDateRange(v.startDate, v.endDate) +
          "</span>" +
          (v.summary ? "<p>" + S.escapeHtml(v.summary) + "</p>" : "") +
          "</div>"
        );
      })
      .join("");
  }

  function renderPublications(data) {
    var items = data.publications || [];
    if (!items.length) return "";
    return items
      .map(function (p) {
        var line = p.name || "";
        if (p.publisher) line += " — " + p.publisher;
        var html = "<div><span class='rs-title'>" + S.escapeHtml(line) + "</span>";
        if (p.releaseDate) html += " <span class='rs-date'>" + S.escapeHtml(p.releaseDate) + "</span>";
        html += "</div>";
        if (p.url) html += "<div><a href='" + S.escapeHtml(p.url) + "'>" + S.escapeHtml(p.url) + "</a></div>";
        return html;
      })
      .join("<div class='rs-separator'></div>");
  }

  function renderLanguages(data) {
    var items = data.languages || [];
    if (!items.length) return "";
    return items
      .map(function (l) {
        return "<div>" + S.escapeHtml(S.joinParts([l.language, l.fluency], " — ")) + "</div>";
      })
      .join("");
  }

  function renderInterests(data) {
    var items = data.interests || [];
    if (!items.length) return "";
    return items
      .map(function (i) {
        return (
          "<div class='rs-skill-block'><span class='rs-title'>" +
          S.escapeHtml(i.name || "") +
          ":</span> " +
          (i.keywords ? S.keywordsList(i.keywords) : "") +
          "</div>"
        );
      })
      .join("");
  }

  function renderReferences(data) {
    var items = data.references || [];
    if (!items.length) return "";
    return items
      .map(function (r) {
        return "<div><span class='rs-title'>" + S.escapeHtml(r.name || "") + "</span><p>" + S.escapeHtml(r.reference || "") + "</p></div>";
      })
      .join("<div class='rs-separator'></div>");
  }

  var SECTION_RENDERERS = {
    profile: function (data, ov) {
      return renderProfile(data, ov);
    },
    work: function (data, ov) {
      var c = renderWork(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "work", "EXPERIENCE"), c) : "";
    },
    education: function (data, ov) {
      var c = renderEducation(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "education", "EDUCATION"), c) : "";
    },
    skills: function (data, ov) {
      var c = renderSkills(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "skills", "SKILLS"), c) : "";
    },
    projects: function (data, ov) {
      var c = renderProjects(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "projects", "PROJECTS"), c) : "";
    },
    awards: function (data, ov) {
      var c = renderAwards(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "awards", "AWARDS"), c) : "";
    },
    volunteer: function (data, ov) {
      var c = renderVolunteer(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "volunteer", "VOLUNTEER"), c) : "";
    },
    publications: function (data, ov) {
      var c = renderPublications(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "publications", "PUBLICATIONS"), c) : "";
    },
    languages: function (data, ov) {
      var c = renderLanguages(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "languages", "LANGUAGES"), c) : "";
    },
    interests: function (data, ov) {
      var c = renderInterests(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "interests", "INTERESTS"), c) : "";
    },
    references: function (data, ov) {
      var c = renderReferences(data);
      return c ? sectionBlock(S.getHeading(ov.headings, "references", "REFERENCES"), c) : "";
    },
  };

  function renderOnePage(data, themeOverrides) {
    var ov = S.resolveOverrides(themeOverrides);
    var schema = global.ResumeSchema;
    var order = schema ? schema.getSectionOrder(data, ov) : ov.sectionOrder;
    var hidden = ov.hiddenSections || [];

    var html = onepageCss(ov);
    html += "<div id='resume' class='theme-onepage'>";
    html += renderHeader(data, ov);
    html += S.sectionLine(ov.colors);

    order.forEach(function (key) {
      if (hidden.indexOf(key) >= 0) return;
      var fn = SECTION_RENDERERS[key];
      if (!fn) return;
      var section = fn(data, ov);
      if (!section) return;
      html += section;
      html += S.sectionLine(ov.colors);
    });

    html += "</div>";
    return html;
  }

  global.ResumeThemeOnepage = { id: "onepage", name: "One Page Classic", render: renderOnePage };
})(typeof window !== "undefined" ? window : this);
