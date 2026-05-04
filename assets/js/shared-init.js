(function () {
  "use strict";

  var ADSENSE_CLIENT = "ca-pub-9293070686220717";
  var ADSENSE_HOST = "https://pagead2.googlesyndication.com";
  var ADSENSE_SRC =
    ADSENSE_HOST + "/pagead/js/adsbygoogle.js?client=" + ADSENSE_CLIENT;
  var ROOT_PATH = "/";
  var SW_PATH = ROOT_PATH + "sw.js";

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

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") {
      return;
    }

    window.addEventListener("load", function () {
      navigator.serviceWorker.register(SW_PATH, { scope: ROOT_PATH }).catch(function (error) {
        console.warn("Service worker registration failed:", error);
      });
    });
  }

  function setOfflineState() {
    document.documentElement.toggleAttribute("data-offline", !navigator.onLine);
  }

  function installOfflineBanner() {
    if (document.getElementById("shared-offline-banner")) {
      return;
    }

    var style = document.createElement("style");
    style.textContent =
      "#shared-offline-banner{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:9999;display:none;border:1px solid rgba(15,23,42,.16);border-radius:.85rem;background:rgba(15,23,42,.94);color:#fff;padding:.75rem 1rem;font:600 13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 18px 40px rgba(15,23,42,.22)}html[data-offline] #shared-offline-banner{display:block}@media (min-width:700px){#shared-offline-banner{left:auto;right:1rem;max-width:28rem}}";
    document.head.appendChild(style);

    var banner = document.createElement("div");
    banner.id = "shared-offline-banner";
    banner.setAttribute("role", "status");
    banner.textContent =
      "You are offline. Cached tools can keep working; live API features may need a connection.";
    document.body.appendChild(banner);

    setOfflineState();
    window.addEventListener("online", setOfflineState);
    window.addEventListener("offline", setOfflineState);
  }

  function installErrorBoundary() {
    window.addEventListener("error", function (event) {
      console.warn("Unhandled tool error:", event.error || event.message);
    });
    window.addEventListener("unhandledrejection", function (event) {
      console.warn("Unhandled tool promise rejection:", event.reason);
    });
  }

  registerServiceWorker();
  installErrorBoundary();
  injectAdSense();

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(function () {
      runDeferredEnhancements();
      installOfflineBanner();
    }, { timeout: 1500 });
  } else {
    window.setTimeout(function () {
      runDeferredEnhancements();
      installOfflineBanner();
    }, 350);
  }
})();
