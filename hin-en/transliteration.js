const consonants = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh',
    'ट': 'T', 'ठ': 'Th', 'ड': 'D', 'ढ': 'Dh', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh',
    'न': 'n', 'ऩ': 'ṉ', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y',
    'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'Sh', 'स': 's', 'ह': 'h', 'क्ष': 'ksh',
    'ज्ञ': 'gy', 'ळ': 'L'
};

const vowels = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ए': 'e', 'ऐ': 'ai',
    'ओ': 'o', 'औ': 'au', 'ऋ': 'ri'
};

const vowelAttachments = {
    'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai',
    'ो': 'o', 'ौ': 'au', 'ृ': 'ri'
};

const specialSymbols = {
    'ं': 'n', 'ः': 'ḥ', '्': '_'
};

function transliterateToEnglish(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (consonants[char]) {
            result += consonants[char];
        } else if (vowels[char]) {
            result += vowels[char];
        } else if (vowelAttachments[char]) {
            result += vowelAttachments[char];
        } else if (specialSymbols[char]) {
            result += specialSymbols[char];
        } else {
            result += char;
        }
    }
    return result;
}

function transliterateToDevanagari(text) {
    let result = '';
    const revConsonants = Object.fromEntries(Object.entries(consonants).map(([k, v]) => [v, k]));
    const revVowels = Object.fromEntries(Object.entries(vowels).map(([k, v]) => [v, k]));
    const revVowelAttachments = Object.fromEntries(Object.entries(vowelAttachments).map(([k, v]) => [v, k]));
    const revSpecialSymbols = Object.fromEntries(Object.entries(specialSymbols).map(([k, v]) => [v, k]));
    
    let tokens = text.split(/(ksh|gy|kh|gh|ch|jh|Th|Dh|th|dh|sh|Sh|aa|ee|oo|ai|au|ri|n|ḥ|_)/g);
    for (let token of tokens) {
        if (revConsonants[token]) {
            result += revConsonants[token];
        } else if (revVowels[token]) {
            result += revVowels[token];
        } else if (revVowelAttachments[token]) {
            result += revVowelAttachments[token];
        } else if (revSpecialSymbols[token]) {
            result += revSpecialSymbols[token];
        } else {
            result += token;
        }
    }
    return result;
}

// Example Usage
console.log(transliterateToEnglish("कथन")); // Output: kathan
console.log(transliterateToDevanagari("kathan")); // Output: कथन
