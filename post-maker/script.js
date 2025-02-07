// script.js

async function fetchAyahs() {
    const ayahInput = document.getElementById("ayahsInput").value.trim();
    const arabicTextArea = document.getElementById("arabicText");
    const englishTextArea = document.getElementById("englishText");
    const urduTextArea = document.getElementById("urduText");
    const translatorNameInput = document.getElementById("translatorName");

    if (!ayahInput) {
        alert("Please enter a valid Ayah or range (e.g., 36:1-4).");
        return;
    }

    let ayahsArabic = "";
    let ayahsEnglish = "";
    let ayahsUrdu = "";
    let translators = new Set();

    try {
        const [surah, ayahRange] = ayahInput.split(':');
        if (!surah || !ayahRange) {
            alert("Invalid format. Use Surah:Ayah (e.g., 36:4) or Surah:Start-End (e.g., 36:1-4).");
            return;
        }

        let [startAyah, endAyah] = ayahRange.split('-').map(Number);
        if (!endAyah) endAyah = startAyah; // Single ayah case

        for (let ayah = startAyah; ayah <= endAyah; ayah++) {
            const response = await fetch(`https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?translations=84,158&translation_fields=resource_name,language_name&fields=text_indopak`);
            const data = await response.json();

            if (!data.verse) {
                console.warn(`Ayah ${surah}:${ayah} not found.`);
                continue;
            }

            // Append Arabic text
            ayahsArabic += data.verse.text_indopak + " ";

            // Append translations based on language
            data.verse.translations.forEach(translation => {
                if (translation.language_name === "english") {
                    ayahsEnglish += translation.text + " ";
                    translators.add(translation.resource_name);
                }
                if (translation.language_name === "urdu") {
                    ayahsUrdu += translation.text + " ";
                    translators.add(translation.resource_name);
                }
            });
        }

        // Set textareas with retrieved data
        arabicTextArea.value = ayahsArabic.trim();
        englishTextArea.value = ayahsEnglish.trim();
        urduTextArea.value = ayahsUrdu.trim();
        translatorNameInput.value = Array.from(translators).join(", ");

    } catch (error) {
        console.error("Error fetching Ayahs:", error);
        alert("An error occurred while fetching Ayahs. Please try again.");
    }
}

// Function to generate a random gradient background
function generateRandomGradient() {
    const colors = [
        ['#FF5733', '#FF8C33'],
        ['#33FF57', '#33FF8C'],
        ['#3357FF', '#33FFF5'],
        ['#F333FF', '#FF33A1'],
        ['#A1FF33', '#FFD700'],
        ['#00C9FF', '#92FE9D'],
        ['#F7971E', '#FFD200']
    ];
    const selected = colors[Math.floor(Math.random() * colors.length)];
    return `linear-gradient(135deg, ${selected[0]}, ${selected[1]})`;
}

// Function to generate the image preview
function generateImage() {
    const preview = document.getElementById("imagePreview");
    const topHeading = document.getElementById("topHeading").value;
    const arabicText = document.getElementById("arabicText").value;
    const englishText = document.getElementById("englishText").value;
    const urduText = document.getElementById("urduText").value;
    const translatorName = document.getElementById("translatorName").value;

    document.getElementById("previewHeading").innerText = topHeading;
    document.getElementById("previewArabic").innerText = arabicText;
    document.getElementById("previewEnglish").innerText = englishText;
    document.getElementById("previewUrdu").innerText = urduText;
    document.getElementById("previewTranslator").innerText = translatorName ? `- ${translatorName}` : "";

    // Apply new random gradient
    preview.style.background = generateRandomGradient();

    preview.classList.remove("hidden");
}
