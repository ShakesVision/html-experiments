// State management
const state = {
  stories: [],
  displayedStoryId: null,
};

// IndexedDB Setup
function openDB() {
  return new Promise((resolve, reject) => {
    let request = indexedDB.open("StoryDB", 1);
    request.onupgradeneeded = function (event) {
      let db = event.target.result;
      if (!db.objectStoreNames.contains("stories")) {
        db.createObjectStore("stories", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save Story to IndexedDB
async function saveStory(title, author, content) {
  let db = await openDB();
  let tx = db.transaction("stories", "readwrite");
  let store = tx.objectStore("stories");
  let request = store.add({ title, author, content });

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      console.log("Story saved:", { title, author });
      getStories();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Display Stories in UI
async function getStories() {
  let db = await openDB();
  let tx = db.transaction("stories", "readonly");
  let store = tx.objectStore("stories");

  let request = store.getAll();
  let stories = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  state.stories = stories || [];

  // Update stats
  document.getElementById("stat-total").textContent = state.stories.length;
  document.getElementById("stat-search").textContent = state.stories.length;

  renderStories();

  if (state.stories.length === 0) {
    document.getElementById("empty-list").style.display = "block";
  } else {
    document.getElementById("empty-list").style.display = "none";
  }
}

// Render Stories List
function renderStories(stories = null) {
  const storiesToShow = stories || state.stories;
  const storyList = document.getElementById("story-list");
  const searchResults = document.getElementById("search-results");

  if (!storiesToShow.length) {
    storyList.innerHTML = "";
    searchResults.innerHTML = "";
    return;
  }

  const html = storiesToShow
    .map(
      (s) => `
        <div class="story-item" onclick="showStory(${s.id})" data-story-id="${s.id}">
            <div class="story-title">${escapeHtml(s.title || "Untitled")}</div>
            <div class="story-author">by ${escapeHtml(s.author || "Unknown")}</div>
        </div>
    `,
    )
    .join("");

  if (stories) {
    searchResults.innerHTML = html;
    searchResults.style.display = "block";
  } else {
    storyList.innerHTML = html;
    searchResults.style.display = "none";
  }
}

// Show Selected Story
async function showStory(id) {
  state.displayedStoryId = id;

  let db = await openDB();
  let tx = db.transaction("stories", "readonly");
  let store = tx.objectStore("stories");

  let request = store.get(id);
  let story = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!story) {
    console.error("Story not found with ID:", id);
    return;
  }

  // Update UI
  document.getElementById("no-selection").style.display = "none";
  document.getElementById("story-display").style.display = "block";

  document.getElementById("story-title").textContent =
    story.title || "Untitled";
  document.getElementById("story-author").textContent =
    "by " + (story.author || "Unknown");
  document.getElementById("story-content").textContent =
    story.content || "No content available.";

  // Highlight active story
  document.querySelectorAll(".story-item").forEach((item) => {
    item.classList.remove("active");
  });
  document.querySelector(`[data-story-id="${id}"]`)?.classList.add("active");
}

// Search Stories
async function searchStories(query) {
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery) {
    renderStories();
    document.getElementById("stat-search").textContent = state.stories.length;
    return;
  }

  let filteredStories = state.stories.filter(
    (s) =>
      (s.title || "").toLowerCase().includes(trimmedQuery) ||
      (s.author || "").toLowerCase().includes(trimmedQuery) ||
      (s.content || "").toLowerCase().includes(trimmedQuery),
  );

  renderStories(filteredStories);
  document.getElementById("stat-search").textContent = filteredStories.length;
}

// Handle File Upload
function handleFileUpload(files) {
  Array.from(files).forEach((file) => {
    if (!file.name.toLowerCase().endsWith(".txt")) {
      console.warn("Skipped non-txt file:", file.name);
      return;
    }

    let reader = new FileReader();
    reader.onload = async function (e) {
      let content = e.target.result;
      let title = file.name.replace(/\.txt$/i, "");
      let author = "Uploaded";

      try {
        await saveStory(title, author, content);
      } catch (error) {
        console.error("Error saving file:", error);
      }
    };
    reader.readAsText(file);
  });
}

// Escape HTML
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// UI Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  getStories();

  const fileInput = document.getElementById("file-input");
  const uploadArea = document.getElementById("upload-area");

  // Click to upload
  uploadArea.addEventListener("click", () => fileInput.click());

  // File input change
  fileInput.addEventListener("change", (e) => {
    handleFileUpload(e.target.files);
    e.target.value = ""; // Reset input
  });

  // Drag and drop
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    handleFileUpload(e.dataTransfer.files);
  });
});
