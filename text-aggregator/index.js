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

    request.onsuccess = () => {
        console.log("Story saved:", { title, author, content });
        getStories(); // Refresh the list after saving
    };

    request.onerror = () => console.error("Error saving story:", request.error);
}


// Display Stories in UI
async function getStories() {
    let db = await openDB();
    let tx = db.transaction("stories", "readonly");
    let store = tx.objectStore("stories");

    let request = store.getAll(); // Returns an IDBRequest
    let stories = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    console.log("Fetched stories:", stories); // Should now show actual array

    if (!Array.isArray(stories) || stories.length === 0) {
        console.warn("No stories found.");
        return;
    }

    let storyList = document.getElementById("story-list");
    storyList.innerHTML = stories.map(s => 
        `<li onclick="showStory(${s.id})">${s.title} by ${s.author}</li>`
    ).join("");
}


// Show Selected Story
async function showStory(id) {
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

    console.log("Displaying story:", story);

    document.getElementById("story-title").textContent = story.title || "Untitled";
    document.getElementById("story-author").textContent = "By " + (story.author || "Unknown");
    document.getElementById("story-content").textContent = story.content || "No content available.";
}


// Search Stories
async function searchStories(query) {
    let db = await openDB();
    let tx = db.transaction("stories", "readonly");
    let store = tx.objectStore("stories");

    let request = store.getAll();
    let stories = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    if (!Array.isArray(stories)) stories = []; // Ensure stories is an array

    console.log("Searching in stories:", stories); // Debugging

    let filteredStories = stories.filter(s => 
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.author.toLowerCase().includes(query.toLowerCase()) ||
        s.content.toLowerCase().includes(query.toLowerCase())
    );

    console.log("Filtered results:", filteredStories); // Debugging

    let searchResults = document.getElementById("search-results");
    searchResults.innerHTML = filteredStories.map(s => 
        `<li onclick="showStory(${s.id})">${s.title} by ${s.author}</li>`
    ).join("");
}


// Upload and Parse .txt Files
function handleFileUpload(event) {
    let file = event.target.files[0];
    if (!file) return;
    
    let reader = new FileReader();
    reader.onload = function (e) {
        let content = e.target.result;
        let title = file.name.replace(".txt", "");
        let author = "Unknown"; // Modify as needed
        saveStory(title, author, content).then(() => getStories());
    };
    reader.readAsText(file);
}

document.getElementById("file-input").addEventListener("change", handleFileUpload);

document.addEventListener("DOMContentLoaded", getStories);
