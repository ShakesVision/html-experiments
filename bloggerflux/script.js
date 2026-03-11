/* ==========================================
   BlogFlux – Blogger Archive Extractor
   Core Script
========================================== */

/* ==========================================
   GLOBAL STATE
========================================== */

const AppState = {
  blog: {
    url: "",
    label: "",
    detectedRoot: "",
  },

  options: {
    outputMode: "html",
    maxPosts: 10000,
    downloadImages: false,
  },

  fields: {
    title: true,
    date: true,
    text: true,
    content_html: false,
    image_url: true,
    image_local: false,
    post_url: false,
    author: false,
    labels: false,
    summary: false,
  },

  dataset: [],

  images: {
    queue: [],
    blobs: {},
    active: 0,
    maxConcurrent: 5,
  },

  progress: {
    feedPage: 0,
    postsDiscovered: 0,
    postsProcessed: 0,
    imagesDownloaded: 0,
  },

  runtime: {
    scraping: false,
    stopRequested: false,
  },
};

/* ==========================================
   UTILS
========================================== */

const Utils = {
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  yieldUI() {
    return new Promise((r) => setTimeout(r, 0));
  },

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 60);
  },

  cleanText(html) {
    const el = document.createElement("div");
    el.innerHTML = html;

    let text = el.innerText;

    text = text.replace(/\n{3,}/g, "\n\n");

    return text.trim();
  },

  extractRootURL(url) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    try {
      const u = new URL(url);

      return `${u.protocol}//${u.hostname}`;
    } catch (e) {
      return url;
    }
  },
};

/* ==========================================
   STORAGE MANAGER
========================================== */

const StorageManager = {
  KEY: "blogflux_session",

  save() {
    const data = {
      dataset: AppState.dataset.slice(0, 10), // limit to first 10 for storage
      progress: AppState.progress,
      blog: AppState.blog,
      options: AppState.options,
    };

    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  load() {
    const raw = localStorage.getItem(this.KEY);

    if (!raw) return;

    const data = JSON.parse(raw);

    AppState.dataset = data.dataset || [];
    AppState.progress = data.progress || AppState.progress;
    AppState.blog = data.blog || AppState.blog;
    AppState.options = data.options || AppState.options;
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },
};

/* ==========================================
   FEED LOADER (JSONP)
========================================== */

const FeedLoader = {
  buildURL(startIndex) {
    const base = AppState.blog.detectedRoot;

    let labelPath = "";

    if (AppState.blog.label) {
      labelPath = `/-/${encodeURIComponent(AppState.blog.label)}`;
    }

    return `${base}/feeds/posts/default${labelPath}?alt=json-in-script&start-index=${startIndex}&max-results=500`;
  },

  fetchPage(startIndex) {
    return new Promise((resolve, reject) => {
      const callback = "jsonp_cb_" + Math.random().toString(36).substring(2);

      window[callback] = function (data) {
        delete window[callback];
        script.remove();

        resolve(data);
      };

      const script = document.createElement("script");

      script.src = `${FeedLoader.buildURL(startIndex)}&callback=${callback}`;

      script.onerror = () => {
        delete window[callback];
        script.remove();

        reject("Feed load error");
      };

      document.body.appendChild(script);
    });
  },
};

/* ==========================================
   POST PROCESSOR
========================================== */

const PostProcessor = {
  process(entry, index) {
    const post = {};

    const html = entry.content ? entry.content.$t : "";

    if (AppState.fields.title) post.title = entry.title?.$t || "";

    if (AppState.fields.date) post.date = entry.published?.$t || "";

    if (AppState.fields.post_url) {
      const link = entry.link?.find((l) => l.rel === "alternate");

      post.post_url = link?.href || "";
    }

    if (AppState.fields.author) post.author = entry.author?.[0]?.name?.$t || "";

    if (AppState.fields.labels)
      post.labels = entry.category?.map((c) => c.term) || [];

    if (AppState.fields.summary) post.summary = entry.summary?.$t || "";

    if (AppState.fields.content_html) post.content_html = html;

    if (AppState.fields.text) post.text = Utils.cleanText(html);

    if (AppState.fields.image_url) {
      const img = this.extractImage(entry, html);

      post.image_url = img || null;
    }

    if (AppState.options.downloadImages && post.image_url) {
      const slug = Utils.slugify(post.title || "post");

      const name = `p_${String(index).padStart(3, "0")}_${slug}.jpg`;

      post.image_local = `images/${name}`;

      ImageManager.queue(post.image_url, name);
    }

    return post;
  },

  extractImage(entry, html) {
    if (entry.media$thumbnail?.url) return entry.media$thumbnail.url;

    if (entry.media$content?.url) return entry.media$content.url;

    const div = document.createElement("div");

    div.innerHTML = html;

    const img = div.querySelector("img");

    if (img) return img.src;

    return null;
  },
};

/* ==========================================
   IMAGE MANAGER
========================================== */

const ImageManager = {
  queue(url, name) {
    AppState.images.queue.push({ url, name });

    this.process();
  },

  async process() {
    if (AppState.images.active >= AppState.images.maxConcurrent) return;

    const job = AppState.images.queue.shift();

    if (!job) return;

    AppState.images.active++;

    try {
      const res = await fetch(job.url, { mode: "no-cors" }); // optional
      if (res.ok) {
        const blob = await res.blob();
        AppState.images.blobs[job.name] = blob;
        AppState.progress.imagesDownloaded++;
      }
    } catch (e) {
      console.warn("Image fetch failed:", job.url);
    }

    AppState.images.active--;
    // Continue processing next
    this.process();
  },
};

/* ==========================================
   SCRAPER ENGINE
========================================== */

const ScraperEngine = {
  async start() {
    if (AppState.runtime.scraping) return;

    AppState.runtime.scraping = true;

    AppState.blog.detectedRoot = Utils.extractRootURL(AppState.blog.url);

    let startIndex = 1;

    while (!AppState.runtime.stopRequested) {
      const feed = await FeedLoader.fetchPage(startIndex);

      const entries = feed?.feed?.entry || [];

      console.log(`Entries returned: ${entries.length}`);
      if (entries.length === 0) break; // no more posts

      AppState.progress.feedPage++;
      await this.processEntries(entries);
      startIndex += entries.length;

      if (AppState.dataset.length >= AppState.options.maxPosts) break;
    }

    AppState.runtime.scraping = false;

    StorageManager.save();
  },

  async processEntries(entries) {
    const batchSize = 20;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      batch.forEach((entry) => {
        const index = AppState.dataset.length + 1;

        const post = PostProcessor.process(entry, index);

        AppState.dataset.push(post);

        AppState.progress.postsProcessed++;
      });

      await Utils.yieldUI();
    }
  },

  stop() {
    AppState.runtime.stopRequested = true;
  },
};

/* ==========================================
   EXPORT MANAGER
========================================== */

const ExportManager = {
  exportJSON() {
    const blob = new Blob(
      [JSON.stringify(AppState.dataset, null, 2)],

      { type: "application/json" },
    );

    saveAs(blob, "posts.json");
  },

  exportCSV() {
    const rows = [];

    const fields = Object.keys(AppState.fields).filter(
      (f) => AppState.fields[f],
    );

    rows.push(fields.join(","));

    AppState.dataset.forEach((p) => {
      const row = fields.map((f) => {
        let val = p[f] || "";

        val = String(val).replace(/"/g, '""');

        return `"${val}"`;
      });

      rows.push(row.join(","));
    });

    const blob = new Blob(
      [rows.join("\n")],

      { type: "text/csv" },
    );

    saveAs(blob, "posts.csv");
  },

  async exportZIP() {
    const zip = new JSZip();

    zip.file("posts.json", JSON.stringify(AppState.dataset, null, 2));

    const imgFolder = zip.folder("images");

    for (const name in AppState.images.blobs) {
      imgFolder.file(name, AppState.images.blobs[name]);
    }

    const content = await zip.generateAsync({ type: "blob" });

    saveAs(content, "blogflux_export.zip");
  },
};

/* ==========================================
   READER MODULE
========================================== */

const Reader = {
  page: 1,

  perPage: 20,

  getPage() {
    const start = (this.page - 1) * this.perPage;

    return AppState.dataset.slice(start, start + this.perPage);
  },

  next() {
    this.page++;
  },

  prev() {
    if (this.page > 1) this.page--;
  },
};

/* ==========================================
   INITIALIZATION
========================================== */

function initBlogFlux() {
  StorageManager.load();

  console.log("BlogFlux ready");
}

document.addEventListener("DOMContentLoaded", initBlogFlux);
