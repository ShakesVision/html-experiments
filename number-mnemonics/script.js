const repoForWordListBaseUrl = 'https://cdn.jsdelivr.net/gh/eymenefealtun/all-words-in-all-languages@main/';
const wordListUrls = {
    english: `${repoForWordListBaseUrl}/English/English.txt`,
    hindi: `${repoForWordListBaseUrl}/Hindi/Hindi.txt`,
    urdu: `${repoForWordListBaseUrl}/Urdu/Urdu.txt`
};

const wordLists = {
    english: [],
    hindi: [],
    urdu: []
};

async function loadWordList(language) {
    const response = await fetch(wordListUrls[language]);
    const text = await response.text();
    wordLists[language] = text.split(',').map(word => word.trim()).filter(word => word);
}

async function initialize() {
    await Promise.all([
        loadWordList('english'),
        loadWordList('hindi'),
        loadWordList('urdu')
    ]);
}

function convertNumberToWords(number, language) {
    const majorSystem = {
        0: ['s', 'z'],
        1: ['t', 'd'],
        2: ['n'],
        3: ['m'],
        4: ['r'],
        5: ['l'],
        6: ['j', 'sh'],
        7: ['k', 'g'],
        8: ['f', 'v'],
        9: ['p', 'b']
    };

    const vowels = {
        english: ['a', 'e', 'i', 'o', 'u'],
        hindi: ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ए', 'ऐ', 'ओ', 'औ'],
        urdu: ['ا', 'و', 'ی']
    };

    const selectedWordList = wordLists[language] || [];
    const selectedVowels = vowels[language] || [];
    const mnemonicWords = [];

    function getConsonants(word, language) {
        return word.split('').filter(char => !selectedVowels.includes(char));
    }

    function getMajorSystemDigits(word) {
        return word.map(char => {
            for (let digit in majorSystem) {
                if (majorSystem[digit].includes(char)) return digit;
            }
            return null;
        }).filter(digit => digit !== null).join('');
    }

    const targetDigits = number.toString();

    selectedWordList.forEach(word => {
        const consonantsOnly = getConsonants(word, language);
        const wordDigits = getMajorSystemDigits(consonantsOnly);

        if (wordDigits === targetDigits) {
            mnemonicWords.push(word);
        }
    });

    return mnemonicWords;
}


document.getElementById('convertButton').addEventListener('click', async () => {
    const number = document.getElementById('numberInput').value.trim();
    const language = document.getElementById('languageSelect').value;
    const resultDiv = document.getElementById('result');
    const wordsListDiv = document.getElementById('wordsList');

    if (!number || isNaN(number)) {
        alert('Please enter a valid number.');
        return;
    }

    if (wordLists[language].length === 0) {
        await loadWordList(language);
    }

    const words = convertNumberToWords(number, language);
    wordsListDiv.innerHTML = '';

    if (words.length > 0) {
        words.forEach(word => {
            const chip = document.createElement('span');
            chip.className = 'bg-green-200 text-green-800 px-3 py-1 rounded-full';
            chip.textContent = word;
            wordsListDiv.appendChild(chip);
        });
        resultDiv.classList.remove('hidden');
    } else {
        resultDiv.classList.add('hidden');
        alert('No mnemonic words found for the given number.');
    }
});

// Initialize the application
initialize();
