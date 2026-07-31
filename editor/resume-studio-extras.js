/* Resume Studio — share URL compression, read-only mode helpers */
(function (global) {
  "use strict";

  var SHARE_PREFIX = "share=";

  function utf8ToBase64(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      }),
    );
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(""),
    );
  }

  function compressSharePayload(obj) {
    var json = JSON.stringify(obj);
    return utf8ToBase64(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decompressSharePayload(token) {
    if (!token) return null;
    var b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    try {
      return JSON.parse(base64ToUtf8(b64));
    } catch (e) {
      return null;
    }
  }

  function parseShareFromHash() {
    var hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    var idx = hash.indexOf(SHARE_PREFIX);
    if (idx < 0) return null;
    var token = hash.slice(idx + SHARE_PREFIX.length).split("&")[0];
    return decompressSharePayload(token);
  }

  function buildShareUrl(payload) {
    var token = compressSharePayload(payload);
    var base = location.href.split("#")[0];
    return base + "#" + SHARE_PREFIX + token;
  }

  global.ResumeShare = {
    compressSharePayload: compressSharePayload,
    decompressSharePayload: decompressSharePayload,
    parseShareFromHash: parseShareFromHash,
    buildShareUrl: buildShareUrl,
  };
})(typeof window !== "undefined" ? window : this);
