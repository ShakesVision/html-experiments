/* Resume Studio — JSON Resume schema helpers */
(function (global) {
  "use strict";

  var DEFAULT_HEADINGS = {
    profile: "Summary",
    work: "Experience",
    education: "Education",
    skills: "Skills",
    projects: "Projects",
    awards: "Awards",
    volunteer: "Volunteer",
    publications: "Publications",
    languages: "Languages",
    interests: "Interests",
    references: "References",
  };

  var DEFAULT_SECTION_ORDER = [
    "profile",
    "work",
    "skills",
    "projects",
    "education",
    "awards",
    "volunteer",
    "publications",
    "languages",
    "interests",
    "references",
  ];

  var SECTION_LABELS = {
    basics: "Basics",
    profile: "Summary",
    work: "Work Experience",
    education: "Education",
    skills: "Skills",
    projects: "Projects",
    awards: "Awards",
    volunteer: "Volunteer",
    publications: "Publications",
    languages: "Languages",
    interests: "Interests",
    references: "References",
    headings: "Section Headings",
    sections: "Section Order",
  };

  var LONG_TEXT_KEYS = {
    summary: true,
    description: true,
    highlights: true,
  };

  var SECTION_EMPTY_SHAPES = {
    work: {
      company: "",
      position: "",
      location: "",
      startDate: "",
      endDate: "",
      highlights: [""],
    },
    education: {
      institution: "",
      area: "",
      studyType: "",
      location: "",
      startDate: "",
      endDate: "",
    },
    skills: { name: "", level: "", keywords: [""] },
    projects: {
      name: "",
      description: "",
      url: "",
      keywords: [""],
    },
    awards: { title: "", date: "", awarder: "", summary: "" },
    volunteer: {
      organization: "",
      position: "",
      startDate: "",
      endDate: "",
      summary: "",
      highlights: [""],
    },
    publications: {
      name: "",
      publisher: "",
      releaseDate: "",
      url: "",
      summary: "",
    },
    languages: { language: "", fluency: "" },
    interests: { name: "", keywords: [""] },
    references: { name: "", reference: "" },
  };

  var DATE_OK = /^\d{4}(-\d{2})?(-\d{2})?$|^[A-Za-z]+\s*,?\s*\d{4}$|^\d{4}\s*[-–—]\s*(\d{4}|Present|Current)?$/i;
  var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function emptyResume() {
    return {
      basics: {
        name: "",
        label: "",
        email: "",
        phone: "",
        picture: "",
        summary: "",
        location: { city: "", countryCode: "" },
        profiles: [],
      },
      work: [],
      education: [],
      skills: [],
      projects: [],
      awards: [],
      headings: Object.assign({}, DEFAULT_HEADINGS),
      sections: DEFAULT_SECTION_ORDER.slice(),
    };
  }

  function mergeHeadings(data, overrides) {
    var base = Object.assign({}, DEFAULT_HEADINGS);
    if (data && data.headings) Object.assign(base, data.headings);
    if (overrides && overrides.headings) Object.assign(base, overrides.headings);
    return base;
  }

  function getSectionOrder(data, overrides) {
    if (overrides && overrides.sectionOrder && overrides.sectionOrder.length) {
      return overrides.sectionOrder.slice();
    }
    if (data && Array.isArray(data.sections) && data.sections.length) {
      return data.sections.filter(function (s) {
        return s !== "templates";
      });
    }
    return DEFAULT_SECTION_ORDER.slice();
  }

  function getHiddenSections(overrides) {
    return (overrides && overrides.hiddenSections) || [];
  }

  function checkDate(label, value, warnings) {
    if (!value || !String(value).trim()) return;
    if (!DATE_OK.test(String(value).trim())) {
      warnings.push(label + ' has unusual date format: "' + value + '" (use YYYY-MM or "Month, YYYY").');
    }
  }

  function validateResume(data) {
    var warnings = [];
    var errors = [];
    if (!data || typeof data !== "object") {
      return { valid: false, errors: ["Resume must be a JSON object."], warnings: [] };
    }
    if (!data.basics || typeof data.basics !== "object") {
      warnings.push("Missing basics section.");
    } else {
      if (!data.basics.name || !String(data.basics.name).trim()) {
        warnings.push("Missing basics.name — required for most resumes and ATS parsers.");
      }
      if (!data.basics.email) {
        warnings.push("Missing basics.email.");
      } else if (!EMAIL_OK.test(data.basics.email)) {
        warnings.push("basics.email does not look like a valid email address.");
      }
      if (data.basics.picture && String(data.basics.picture).indexOf("http") === 0) {
        warnings.push(
          "basics.picture is a remote URL — PNG/PDF export may fail due to CORS. Prefer a data URL (use Upload photo).",
        );
      }
      if (!data.basics.summary) {
        warnings.push("Empty basics.summary — consider adding a professional summary.");
      }
    }
    if (!data.work || !data.work.length) warnings.push("No work experience entries.");
    if (!data.skills || !data.skills.length) warnings.push("No skills listed.");
    (data.work || []).forEach(function (w, i) {
      checkDate("work[" + i + "].startDate", w.startDate, warnings);
      checkDate("work[" + i + "].endDate", w.endDate, warnings);
      if (!w.company) warnings.push("work[" + i + "] missing company.");
      if (!w.position) warnings.push("work[" + i + "] missing position.");
    });
    (data.education || []).forEach(function (e, i) {
      checkDate("education[" + i + "].startDate", e.startDate, warnings);
      checkDate("education[" + i + "].endDate", e.endDate, warnings);
    });
    (data.projects || []).forEach(function (p, i) {
      if (!p.name) warnings.push("projects[" + i + "] missing name.");
    });
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function defaultThemeOverrides() {
    return {
      typography: {
        name: { fontFamily: "Georgia, serif", fontSize: "20px", fontWeight: "700", color: "#111" },
        label: { fontFamily: "Georgia, serif", fontSize: "14px", fontWeight: "400", color: "#333" },
        body: { fontFamily: "Georgia, serif", fontSize: "12px", fontWeight: "400", color: "#222", lineHeight: "1.4" },
        sectionTitle: { fontFamily: "Georgia, serif", fontSize: "12px", fontWeight: "700", color: "#111" },
        dates: { fontFamily: "Georgia, serif", fontSize: "12px", fontWeight: "400", color: "#555" },
      },
      colors: { accent: "#1b4965", divider: "#CFCFCF" },
      sectionOrder: DEFAULT_SECTION_ORDER.slice(),
      hiddenSections: [],
      hiddenEntries: {},
      headings: Object.assign({}, DEFAULT_HEADINGS),
      layoutDesign: null,
    };
  }

  function defaultPageSettings() {
    return {
      pageSize: "794x1123",
      paginateHeight: true,
      margins: { top: 48, right: 40, bottom: 48, left: 40 },
    };
  }

  /** Map LinkedIn data export JSON → JSON Resume (best-effort). */
  function linkedInToResume(raw) {
    var out = emptyResume();
    if (!raw || typeof raw !== "object") return out;

    var profile = raw.Profile || raw.profile || raw.basics || {};
    if (Array.isArray(raw)) {
      raw.forEach(function (chunk) {
        if (chunk.Profile) profile = chunk.Profile;
      });
    }

    var first = profile["First Name"] || profile.firstName || profile.first_name || "";
    var last = profile["Last Name"] || profile.lastName || profile.last_name || "";
    out.basics.name = (profile["Full Name"] || profile.name || (first + " " + last).trim()).trim();
    out.basics.label = profile["Headline"] || profile.headline || profile.label || "";
    out.basics.email = profile["Email Address"] || profile.email || "";
    out.basics.phone = profile["Phone Number"] || profile.phone || "";
    out.basics.summary = profile["Summary"] || profile.summary || "";
    out.basics.location.city = profile["Geo Location"] || profile.location || profile.city || "";
    if (profile["Profile Picture URL"]) out.basics.picture = profile["Profile Picture URL"];

    var positions = raw.Positions || raw.positions || raw.work || [];
    if (!Array.isArray(positions) && typeof positions === "object") {
      positions = Object.keys(positions).map(function (k) {
        return positions[k];
      });
    }
    out.work = (positions || []).map(function (p) {
      return {
        company: p["Company Name"] || p.company || "",
        position: p["Title"] || p.title || p.position || "",
        location: p["Location"] || p.location || "",
        startDate: p["Started On"] || p.startDate || p.start || "",
        endDate: p["Finished On"] || p.endDate || p.end || "",
        summary: p["Description"] || p.summary || "",
        highlights: [],
      };
    });

    var edu = raw.Education || raw.education || [];
    if (!Array.isArray(edu) && typeof edu === "object") edu = Object.values(edu);
    out.education = (edu || []).map(function (e) {
      return {
        institution: e["School Name"] || e.institution || e.school || "",
        area: e["Degree Name"] || e.area || e.field || "",
        studyType: e["Degree"] || e.studyType || "",
        startDate: e["Start Date"] || e.startDate || "",
        endDate: e["End Date"] || e.endDate || "",
      };
    });

    var skills = raw.Skills || raw.skills || [];
    if (!Array.isArray(skills)) skills = [];
    var skillNames = skills.map(function (s) {
      return typeof s === "string" ? s : s.name || s["Skill Name"] || s.skill || "";
    }).filter(Boolean);
    if (skillNames.length) {
      out.skills = [{ name: "Skills", keywords: skillNames }];
    }

    return out;
  }

  /** Extract keyword-like tokens from a job description. */
  function extractJdKeywords(jdText) {
    if (!jdText) return [];
    var stop = {
      the: 1, and: 1, for: 1, with: 1, you: 1, our: 1, will: 1, this: 1, that: 1, from: 1, have: 1, your: 1, are: 1, not: 1, but: 1, all: 1, can: 1, was: 1, one: 1, may: 1,
    };
    var words = jdText.toLowerCase().match(/[a-z+#.]{2,}/g) || [];
    var freq = {};
    words.forEach(function (w) {
      if (stop[w] || w.length < 3) return;
      freq[w] = (freq[w] || 0) + 1;
    });
    return Object.keys(freq)
      .sort(function (a, b) {
        return freq[b] - freq[a];
      })
      .slice(0, 20);
  }

  global.ResumeSchema = {
    DEFAULT_HEADINGS: DEFAULT_HEADINGS,
    DEFAULT_SECTION_ORDER: DEFAULT_SECTION_ORDER,
    SECTION_LABELS: SECTION_LABELS,
    LONG_TEXT_KEYS: LONG_TEXT_KEYS,
    SECTION_EMPTY_SHAPES: SECTION_EMPTY_SHAPES,
    emptyResume: emptyResume,
    mergeHeadings: mergeHeadings,
    getSectionOrder: getSectionOrder,
    getHiddenSections: getHiddenSections,
    validateResume: validateResume,
    linkedInToResume: linkedInToResume,
    extractJdKeywords: extractJdKeywords,
    defaultThemeOverrides: defaultThemeOverrides,
    defaultPageSettings: defaultPageSettings,
  };
})(typeof window !== "undefined" ? window : this);
