// Free vs Pro gating. The feature map and quota math are pure and tested; the
// license check is a pluggable stub (verifyLicense) ready for a real provider
// (ExtensionPay / Gumroad / LemonSqueezy) — swap the one function later.

export { PRO_FEATURES, FREE_ROW_CAP, createEntitlement, verifyLicense };

// Features that require Pro. Everything not listed is free.
const PRO_FEATURES = new Set([
  "liveScrape",      // scrape the live rendered DOM (SPAs) via the extension
  "picker",          // visual point-and-click picker + "select similar"
  "pagination",      // auto next-page / infinite-scroll / multi-URL crawl
  "unlimitedRows",   // beyond the free daily cap
  "exportNdjson",    // NDJSON / Excel export
  "selectorHealth",  // recipe health monitoring
  "schedule",        // recurring scrapes (later phase)
  "cloudExport",     // Sheets / Airtable / Notion / webhook (later phase)
]);

const FREE_ROW_CAP = 500; // rows extractable per day on the free tier

// Placeholder license validation. A real build swaps this for a provider
// call; for now any key of the shape SCR-XXXX-XXXX unlocks locally so the
// paid flow is fully functional and testable before payment is wired.
function verifyLicense(key) {
  return /^SCR-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test((key || "").trim());
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// `store` is an optional { get(k), set(k,v) } (defaults to localStorage when
// present, else an in-memory map so Node tests are deterministic).
function createEntitlement(store) {
  const mem = new Map();
  const backing = store || {
    get: (k) => (typeof localStorage !== "undefined" ? localStorage.getItem(k) : mem.get(k)) ?? null,
    set: (k, v) => (typeof localStorage !== "undefined" ? localStorage.setItem(k, v) : mem.set(k, v)),
  };

  const LICENSE_KEY = "scraperLicense";
  const USAGE_KEY = "scraperUsage";

  const isPro = () => verifyLicense(backing.get(LICENSE_KEY) || "");

  const readUsage = () => {
    try {
      const u = JSON.parse(backing.get(USAGE_KEY) || "{}");
      return u && u.date === todayKey() ? u : { date: todayKey(), rows: 0 };
    } catch {
      return { date: todayKey(), rows: 0 };
    }
  };

  return {
    isPro,
    tier: () => (isPro() ? "pro" : "free"),

    can(feature) {
      return PRO_FEATURES.has(feature) ? isPro() : true;
    },

    setLicense(key) {
      const ok = verifyLicense(key);
      if (ok) backing.set(LICENSE_KEY, String(key).trim());
      return ok;
    },
    clearLicense() {
      backing.set(LICENSE_KEY, "");
    },

    rowCap() {
      return isPro() ? Infinity : FREE_ROW_CAP;
    },
    rowsRemaining() {
      if (isPro()) return Infinity;
      return Math.max(0, FREE_ROW_CAP - readUsage().rows);
    },
    // Record n extracted rows against today's quota; returns whether it was
    // within the cap. Pro is always allowed and untracked.
    recordUsage(n) {
      if (isPro()) return { allowed: true, remaining: Infinity };
      const usage = readUsage();
      usage.rows += Math.max(0, n | 0);
      backing.set(USAGE_KEY, JSON.stringify(usage));
      const remaining = Math.max(0, FREE_ROW_CAP - usage.rows);
      return { allowed: usage.rows <= FREE_ROW_CAP, remaining };
    },
  };
}
