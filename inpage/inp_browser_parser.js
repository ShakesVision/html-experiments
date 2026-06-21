/**
 * Backward-compatible shim. Prefer importing from ./shared/inp-browser-parser.js.
 */
(function () {
  "use strict";

  let modulePromise = null;

  function loadModule() {
    if (!modulePromise) {
      modulePromise = import("./shared/inp-browser-parser.js");
    }
    return modulePromise;
  }

  window.InpBrowserParser = {
    parseInpArrayBufferAsync: async function (arrayBuffer, sourceName, options) {
      const mod = await loadModule();
      return mod.parseInpArrayBuffer(arrayBuffer, sourceName, options);
    },
    preloadBidiMappings: async function () {
      const mod = await loadModule();
      return mod.preloadBidiMappings();
    },
  };
})();
