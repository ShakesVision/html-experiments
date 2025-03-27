document.addEventListener("DOMContentLoaded", function () {
    // Dynamically change word of the day (Demo)
    const words = [
        { word: "محبت", pronunciation: "Muhabbat", meaning: "Love" },
        { word: "حسن", pronunciation: "Husn", meaning: "Beauty" },
        { word: "وفا", pronunciation: "Wafa", meaning: "Loyalty" }
    ];
    
    let todayWord = words[Math.floor(Math.random() * words.length)];
    document.getElementById("word").innerText = todayWord.word;
    document.getElementById("pronunciation").innerText = todayWord.pronunciation;
    document.getElementById("meaning").innerText = todayWord.meaning;
});
