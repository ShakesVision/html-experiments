// advanced-scraper.js

const form = document.getElementById('scrape-form');
const urlInput = document.getElementById('url-input');
const statusDiv = document.getElementById('status');
const metaContainer = document.getElementById('meta-container');
const htmlPreview = document.getElementById('html-preview');

const copyBtn = document.getElementById('copy-html-btn');
const viewBtn = document.getElementById('view-source-btn');
const downloadBtn = document.getElementById('download-html-btn');
const extractPatternBtn = document.getElementById('extract-pattern-btn');
const exportPatternBtn = document.getElementById('export-pattern-btn');

let rawHTML = '';
let currentURL = '';
let historyLog = [];
let lastPatternMatches = [];

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value;
    if (!url) return;

    currentURL = url;
    statusDiv.textContent = 'Fetching...';
    try {
        const encoded = encodeURIComponent(url);
        const response = await fetch(`https://script.google.com/macros/s/AKfycbw3xJdb-tOYC5uq_SZvW2g_PBmymbLg5fXuwnE3L2k2-4WvNz74i2JRAUgSd5j45HpU/exec?url=${encoded}`);
        const data = await response.json();
        rawHTML = data.res;
        renderHTML(rawHTML);
        extractMeta(rawHTML);
        logSession(currentURL, rawHTML);
        statusDiv.textContent = 'Scrape successful!';
    } catch (err) {
        console.error(err);
        statusDiv.textContent = 'Error fetching the content.';
    }
});

function renderHTML(html) {
    const doc = new Blob([html], { type: 'text/html' });
    htmlPreview.src = URL.createObjectURL(doc);
}

function extractMeta(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const metas = doc.querySelectorAll('meta, link, title');
    metaContainer.innerHTML = '';
    metas.forEach(el => {
        const tag = el.outerHTML;
        const div = document.createElement('div');
        div.className = 'text-xs break-all border-b border-gray-700 py-1';
        div.textContent = tag;
        metaContainer.appendChild(div);
    });
}

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(rawHTML).then(() => {
        statusDiv.textContent = 'HTML copied to clipboard';
    });
});

viewBtn.addEventListener('click', () => {
    const w = window.open('', '_blank');
    w.document.write(`<pre style="white-space: pre-wrap;">${rawHTML.replace(/</g, '&lt;')}</pre>`);
});

downloadBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rawHTML], { type: 'text/html' }));
    a.download = 'scraped.html';
    a.click();
});

// 🔧 Advanced User Tools

window.getXPath = function (element) {
    const idx = (sib, name) => sib ? idx(sib.previousElementSibling, name || sib.localName) + (sib.localName == name) : 1;
    const segs = el => !el || el.nodeType !== 1 ? [''] : el.id && document.getElementById(el.id) === el ? [`id("${el.id}")`] : [...segs(el.parentNode), `${el.localName.toLowerCase()}[${idx(el)}]`];
    return segs(element).join('/');
};

window.selectXPath = function (xpath) {
    const result = document.evaluate(xpath, new DOMParser().parseFromString(rawHTML, 'text/html'), null, XPathResult.ANY_TYPE, null);
    const nodes = [];
    let node;
    while ((node = result.iterateNext())) nodes.push(node.outerHTML);
    console.log(nodes);
    return nodes;
};

window.runRegex = function (pattern, flags = 'g') {
    const regex = new RegExp(pattern, flags);
    const matches = [...rawHTML.matchAll(regex)].map(m => m[0]);
    console.log(matches);
    lastPatternMatches = matches;
    return matches;
};

extractPatternBtn?.addEventListener('click', () => {
    const pattern = prompt('Enter regex pattern to extract recurring content:');
    if (!pattern) return;
    const results = runRegex(pattern);
    if (results.length) {
        statusDiv.textContent = `${results.length} items extracted.`;
    } else {
        statusDiv.textContent = 'No matches found.';
    }
});

exportPatternBtn?.addEventListener('click', () => {
    if (!lastPatternMatches.length) return alert('No data to export. Run a pattern first.');
    const text = lastPatternMatches.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pattern-extracted.txt';
    a.click();
});

// 🧾 Session Logging & Export
function logSession(url, html) {
    historyLog.push({
        timestamp: new Date().toISOString(),
        url,
        html
    });
}

window.exportSessionHistory = function () {
    const json = JSON.stringify(historyLog, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scrape-session-history.json';
    a.click();
};
