(function () {
  "use strict";

  var ADSENSE_CLIENT = "ca-pub-9293070686220717";
  var ADSENSE_HOST = "https://pagead2.googlesyndication.com";
  var ADSENSE_SRC =
    ADSENSE_HOST + "/pagead/js/adsbygoogle.js?client=" + ADSENSE_CLIENT;

  function hasExistingAdSenseScript() {
    return !!document.querySelector(
      'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]',
    );
  }

  function injectAdSense() {
    if (hasExistingAdSenseScript()) {
      return;
    }
    var script = document.createElement("script");
    script.async = true;
    script.src = ADSENSE_SRC;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-shared-adsense", "1");
    document.head.appendChild(script);
  }

  function preconnect(origin) {
    if (document.querySelector('link[rel="preconnect"][href="' + origin + '"]')) {
      return;
    }
    var link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    if (origin.indexOf("fonts.gstatic.com") > -1) {
      link.crossOrigin = "anonymous";
    }
    document.head.appendChild(link);
  }

  function preconnectIfUsed(origin, checks) {
    var used = checks.some(function (selector) {
      return !!document.querySelector(selector);
    });
    if (used) {
      preconnect(origin);
    }
  }

  function runDeferredEnhancements() {
    preconnectIfUsed("https://cdn.jsdelivr.net", [
      'script[src*="cdn.jsdelivr.net"]',
      'link[href*="cdn.jsdelivr.net"]',
    ]);
    preconnectIfUsed("https://unpkg.com", ['script[src*="unpkg.com"]']);
    preconnectIfUsed("https://fonts.googleapis.com", [
      'link[href*="fonts.googleapis.com"]',
    ]);
    preconnectIfUsed("https://fonts.gstatic.com", [
      'link[href*="fonts.gstatic.com"]',
      'link[href*="fonts.googleapis.com"]',
    ]);

    preconnect(ADSENSE_HOST);

    var images = document.querySelectorAll("img:not([loading])");
    images.forEach(function (img) {
      img.loading = "lazy";
      if (!img.decoding) {
        img.decoding = "async";
      }
    });
  }

  injectAdSense();

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(runDeferredEnhancements, { timeout: 1500 });
  } else {
    window.setTimeout(runDeferredEnhancements, 350);
  }
})();
