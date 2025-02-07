// script.js

// Function to fetch Ayahs from Quran.com API
async function fetchAyahs() {
    const ayahInput = document.getElementById("ayahsInput").value.trim();
    const arabicTextArea = document.getElementById("arabicText");

    if (!ayahInput) {
        alert("Please enter a valid Ayah range.");
        return;
    }

    const ayahRanges = ayahInput.split(',');
    let ayahs = '';

    try {
        for (const range of ayahRanges) {
            const [surah, ayahRange] = range.split(':');
            const [startAyah, endAyah] = ayahRange.split('-').map(Number);
            for (let ayah = startAyah; ayah <= (endAyah || startAyah); ayah++) {
                const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?verse_key=${surah}:${ayah}`);
                const data = await response.json();
                if (data.verses && data.verses.length > 0) {
                    ayahs += data.verses[0].text + ' ';
                } else {
                    alert(`Ayah ${surah}:${ayah} not found.`);
                }
            }
        }
        arabicTextArea.value = ayahs.trim();
    } catch (error) {
        console.error("Error fetching Ayahs:", error);
        alert("An error occurred while fetching Ayahs. Please try again.");
    }
}

// Function to generate a random gradient background
function generateRandomGradient() {
    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5',
        '#FF33A1', '#A1FF33', '#FF8C33', '#8C33FF', '#33FF8C'
    ];
    const color1 = colors[Math.floor(Math.random() * colors.length)];
    const color2 = colors[Math.floor(Math.random() * colors.length)];
    return `linear-gradient(135deg, ${color1}, ${color2})`;
}

// Function to generate the image preview
function generateImage() {
    const topHeading = document.getElementById("topHeading").value.trim();
    const arabicText = document.getElementById("arabicText").value.trim();
    const englishText = document.getElementById("englishText").value.trim();
    const urduText = document.getElementById("urduText").value.trim();
    const translatorName = document.getElementById("translatorName").value.trim();

    const preview = document.getElementById("imagePreview");
    const previewHeading = document.getElementById("previewHeading");
    const previewArabic = document.getElementById("previewArabic");
    const previewEnglish = document.getElementById("previewEnglish");
    const previewUrdu = document.getElementById("previewUrdu");
    const previewTranslator = document.getElementById("previewTranslator");

    // Set the content
    previewHeading.innerText = topHeading;
    previewArabic.innerText = arabicText;
    previewEnglish.innerText = englishText;
    previewUrdu.innerText = urduText;
    previewTranslator.innerText = translatorName ? `- ${translatorName}` : "";

    // Apply random gradient background
    preview.style.background = generateRandomGradient();

    // Show the preview
    preview.classList.remove("hidden");
}
