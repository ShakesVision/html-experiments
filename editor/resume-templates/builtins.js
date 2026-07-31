/* Resume Studio — built-in theme registry + external theme loader */
(function (global) {
  "use strict";

  var builtins = {};
  var external = {};

  function register(theme) {
    if (!theme || !theme.id || typeof theme.render !== "function") return;
    builtins[theme.id] = theme;
  }

  function registerExternal(theme) {
    if (!theme || !theme.id || typeof theme.render !== "function") return;
    external[theme.id] = theme;
  }

  function listThemes() {
    var all = {};
    Object.keys(builtins).forEach(function (k) {
      all[k] = builtins[k];
    });
    Object.keys(external).forEach(function (k) {
      all[k] = external[k];
    });
    return Object.keys(all).map(function (id) {
      return { id: id, name: all[id].name || id };
    });
  }

  function getTheme(id) {
    return builtins[id] || external[id] || builtins.onepage;
  }

  function renderResume(data, themeId, themeOverrides, customCss) {
    var theme = getTheme(themeId || "onepage");
    var html = theme.render(data || {}, themeOverrides || {});
    if (customCss && customCss.trim()) {
      html = "<style>" + customCss + "</style>" + html;
    }
    return html;
  }

  function loadExternalTheme(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = url;
      script.onload = function () {
        if (global.ResumeThemeExternal && global.ResumeThemeExternal.id) {
          registerExternal(global.ResumeThemeExternal);
          resolve(global.ResumeThemeExternal);
        } else {
          reject(new Error("Theme script did not register ResumeThemeExternal"));
        }
      };
      script.onerror = function () {
        reject(new Error("Failed to load theme from " + url));
      };
      document.head.appendChild(script);
    });
  }

  function loadThemeManifest(manifestUrl) {
    return fetch(manifestUrl)
      .then(function (r) {
        if (!r.ok) throw new Error("Manifest HTTP " + r.status);
        return r.json();
      })
      .then(function (manifest) {
        var base = manifest.cdnBase || manifestUrl.replace(/\/manifest\.json.*$/, "");
        var themes = manifest.themes || [];
        var chain = Promise.resolve();
        themes.forEach(function (t) {
          chain = chain.then(function () {
            var url = t.file.indexOf("http") === 0 ? t.file : base + "/" + t.file.replace(/^\//, "");
            return loadExternalTheme(url).catch(function () {
              return null;
            });
          });
        });
        return chain.then(function () {
          return { manifest: manifest, count: themes.length };
        });
      });
  }

  if (global.ResumeThemeOnepage) register(global.ResumeThemeOnepage);
  if (global.ResumeThemeModern) register(global.ResumeThemeModern);
  if (global.ResumeThemeMinimal) register(global.ResumeThemeMinimal);
  if (global.ResumeThemeLayoutJson) register(global.ResumeThemeLayoutJson);

  function renderCustom(data, themeOverrides) {
    var tpl = (themeOverrides && themeOverrides.customTemplate) || "";
    if (!tpl.trim()) {
      return "<p style='color:#64748b'>Add a custom HTML template in the Theme tab.</p>";
    }
    return tpl.replace(/\{\{([^}]+)\}\}/g, function (_, path) {
      var parts = path.trim().split(".");
      var cur = data;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var m = p.match(/^(.+)\[(\d+)\]$/);
        if (m) cur = cur && cur[m[1]] && cur[m[1]][parseInt(m[2], 10)];
        else cur = cur && cur[p];
      }
      if (cur == null) return "";
      if (Array.isArray(cur)) return cur.map(function (x) { return typeof x === "string" ? x : JSON.stringify(x); }).join(", ");
      return String(cur);
    });
  }

  register({ id: "custom", name: "Custom HTML Template", render: renderCustom });

  global.ResumeThemes = {
    register: register,
    registerExternal: registerExternal,
    listThemes: listThemes,
    getTheme: getTheme,
    renderResume: renderResume,
    loadExternalTheme: loadExternalTheme,
    loadThemeManifest: loadThemeManifest,
  };
})(typeof window !== "undefined" ? window : this);
