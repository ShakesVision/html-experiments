// main.js — Alphabet Adventure game logic
// Attach this file to the index.html provided earlier.

(() => {
    // --- DOM refs ---
    const defaultLettersEl = document.getElementById('defaultLetters');
    const defaults = JSON.parse(defaultLettersEl.textContent || '{}');

    const langChips = Array.from(document.querySelectorAll('.lang-chip'));
    const revealDelayInput = document.getElementById('revealDelay');
    const revealDelayVal = document.getElementById('revealDelayVal');
    const modeToggle = document.getElementById('modeToggle');
    const timeModeBtn = document.getElementById('timeModeBtn');
    const timeOptions = document.getElementById('timeOptions');
    const roundSecondsInput = document.getElementById('roundSeconds');
    const audioFilesInput = document.getElementById('audioFiles');

    const customLangSelect = document.getElementById('customLangSelect');
    const customLettersTextarea = document.getElementById('customLetters');
    const loadCustomBtn = document.getElementById('loadCustom');
    const resetDefaultsBtn = document.getElementById('resetDefaults');

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const nextBtn = document.getElementById('nextBtn');
    const showAnswerBtn = document.getElementById('showAnswerBtn');
    const markCorrectBtn = document.getElementById('markCorrect');

    const letterDisplay = document.getElementById('letterDisplay');
    const hintBubble = document.getElementById('hintBubble');
    const hintAudio = document.getElementById('hintAudio');
    const playArea = document.querySelector('#play');

    const streakEl = document.getElementById('streak');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const roundsPlayedEl = document.getElementById('roundsPlayed');
    const correctCountEl = document.getElementById('correctCount');

    const speedRange = document.getElementById('speedRange');

    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelp = document.getElementById('closeHelp');

    // --- Game state ---
    let activeLangs = new Set(['english']);
    let customLetters = { ...defaults }; // can replace per language
    let audioMap = {}; // key -> Blob URL

    let lettersPool = []; // shuffled
    let currentLetter = null;

    let gameRunning = false;
    let paused = false;
    let intervalTimer = null; // for time-bound rounds
    let revealTimeout = null;

    let score = 0;
    let streak = 0;
    let lives = 3;
    let roundsPlayed = 0;
    let correctCount = 0;

    // --- Utilities ---
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function flattenActiveLetters() {
        const out = [];
        activeLangs.forEach(lang => {
            if (customLetters[lang] && Array.isArray(customLetters[lang])) {
                out.push(...customLetters[lang]);
            }
        });
        return out;
    }

    function resetPool() {
        const letters = flattenActiveLetters();
        if (letters.length === 0) return (lettersPool = []);
        lettersPool = shuffle([...letters]);
    }

    function pickNextLetter() {
        if (lettersPool.length === 0) resetPool();
        if (lettersPool.length === 0) return null;
        return lettersPool.pop();
    }

    function mapAudioFiles(files) {
        audioMap = {};
        Array.from(files).forEach(f => {
            const name = f.name.replace(/\.[^/.]+$/, ""); // strip extension
            const url = URL.createObjectURL(f);
            audioMap[name.trim()] = url;
        });
        // Optionally map a lowercase variant
        const copy = {};
        Object.keys(audioMap).forEach(k => { copy[k.toLowerCase()] = audioMap[k]; });
        audioMap = { ...audioMap, ...copy };
    }

    function playAudioForKey(key) {
        // key is the exact letter or special word (e.g. "Seen")
        const src = audioMap[key] || audioMap[String(key).toLowerCase()];
        if (src) {
            hintAudio.src = src;
            hintAudio.play().catch(e => console.warn('audio play failed', e));
            return true;
        }
        return false;
    }

    function speakFallback(text, lang) {
        if (!('speechSynthesis' in window)) return;
        const msg = new SpeechSynthesisUtterance(text);
        // try to select a voice based on language preference
        if (lang === 'arabic' || lang === 'urdu') msg.lang = 'ar-SA';
        else if (lang === 'hindi') msg.lang = 'hi-IN';
        else msg.lang = 'en-US';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(msg);
    }

    function showHintBubble(text = 'Seen', duration = 1500) {
        hintBubble.textContent = text;
        hintBubble.style.transition = 'none';
        hintBubble.style.opacity = '1';
        hintBubble.style.transform = 'translateY(0)';
        setTimeout(() => {
            hintBubble.style.transition = 'opacity 500ms, transform 500ms';
            hintBubble.style.opacity = '0';
            hintBubble.style.transform = 'translateY(8px)';
        }, duration);
    }

    function confettiBurst(count = 24) {
        const area = playArea;
        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 80 + '%';
            piece.style.top = '-10px';
            piece.style.background = `hsl(${Math.random() * 360},80%,60%)`;
            piece.style.transform = `rotate(${Math.random() * 360}deg)`;
            piece.style.opacity = 1;
            piece.style.zIndex = 2000;
            area.appendChild(piece);

            const fall = 1200 + Math.random() * 1800;
            piece.animate([
                { transform: `translateY(0) rotate(${Math.random() * 360}deg)`, opacity: 1 },
                { transform: `translateY(${600 + Math.random() * 300}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
            ], { duration: fall, easing: 'cubic-bezier(.2,.8,.2,1)' });

            setTimeout(() => piece.remove(), fall + 50);
        }
    }

    // --- UI updates ---
    function updateHUD() {
        scoreEl.textContent = String(score);
        streakEl.textContent = String(streak);
        livesEl.textContent = String(lives);
        roundsPlayedEl.textContent = String(roundsPlayed);
        correctCountEl.textContent = String(correctCount);
    }

    // --- Game actions ---
    function startGame() {
        if (gameRunning) return;
        gameRunning = true;
        paused = false;
        if (lettersPool.length === 0) resetPool();
        startBtn.textContent = 'Running...';
        runRound();

        // If time-bound mode is selected, start periodic end checks (simple)
        if (modeToggle.dataset.mode === 'timebound') {
            startTimeBoundTimer();
        }
    }

    function pauseGame() {
        paused = true;
        gameRunning = false;
        startBtn.textContent = 'Start Game';
        if (revealTimeout) { clearTimeout(revealTimeout); revealTimeout = null; }
        if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
    }

    function endRoundBecauseTime() {
        // penalize if not answered
        roundsPlayed++;
        lives = Math.max(0, lives - 1);
        streak = 0;
        updateHUD();
        nextRound();
    }

    function startTimeBoundTimer() {
        const seconds = parseInt(roundSecondsInput.value, 10) || 60;
        let remaining = seconds;
        if (intervalTimer) clearInterval(intervalTimer);
        intervalTimer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(intervalTimer);
                intervalTimer = null;
                endRoundBecauseTime();
            }
        }, 1000);
    }

    function runRound() {
        if (!gameRunning) return;
        if (paused) return;

        currentLetter = pickNextLetter();
        if (!currentLetter) {
            // nothing to show
            letterDisplay.textContent = '—';
            return;
        }

        // show the letter but keep it "mystery" (we show it anyway — kids often see it)
        letterDisplay.textContent = currentLetter;
        letterDisplay.style.filter = 'blur(0px)';

        // after reveal delay, play audio and show hint
        const delay = Number(revealDelayInput.value) * 1000 || 3000;

        if (revealTimeout) { clearTimeout(revealTimeout); }
        revealTimeout = setTimeout(() => {
            // Play "Seen" audio if present (it gives the spoken word before announcing the letter)
            const playedSeen = playAudioForKey('Seen') || playAudioForKey('seen');
            if (!playedSeen) {
                // fallback: speak the letter name
                speakFallback(currentLetter, detectLangForLetter(currentLetter));
            }

            // show hint bubble and reveal animation
            showHintBubble('Seen');

            // reveal the letter visually (small pop)
            letterDisplay.style.transform = 'scale(1.06)';
            setTimeout(() => letterDisplay.style.transform = '', 450);
        }, delay);
    }

    function nextRound() {
        // called after user marks or presses next
        if (revealTimeout) { clearTimeout(revealTimeout); revealTimeout = null; }
        roundsPlayed++;
        updateHUD();
        if (gameRunning) runRound();
    }

    function showAnswer() {
        // reveal audio specifically for the letter if user wants to hear it
        const played = playAudioForKey(currentLetter) || playAudioForKey(String(currentLetter).toLowerCase());
        if (!played) {
            // fallback speak
            speakFallback(currentLetter, detectLangForLetter(currentLetter));
        }
        // small celebration
        confettiBurst(18);
    }

    function markCorrect() {
        score += 10;
        streak += 1;
        correctCount += 1;
        confettiBurst(28);
        updateHUD();
        nextRound();
    }

    function markWrong() {
        streak = 0;
        lives = Math.max(0, lives - 1);
        updateHUD();
        // gentle shake animation
        letterDisplay.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-10px)' },
            { transform: 'translateX(10px)' },
            { transform: 'translateX(0)' }
        ], { duration: 420 });
        nextRound();
    }

    function detectLangForLetter(ch) {
        // crude detection using presence in defaults
        for (const lang of Object.keys(customLetters)) {
            if (Array.isArray(customLetters[lang]) && customLetters[lang].includes(ch)) return lang;
        }
        return 'english';
    }

    // --- Event wiring ---
    revealDelayInput.addEventListener('input', () => {
        revealDelayVal.textContent = revealDelayInput.value + 's';
    });

    langChips.forEach(chip => {
        const lang = chip.dataset.lang;
        chip.classList.toggle('bg-emerald-200', activeLangs.has(lang));
        chip.addEventListener('click', () => {
            if (activeLangs.has(lang)) {
                if (activeLangs.size === 1) return; // at least one
                activeLangs.delete(lang);
                chip.classList.remove('bg-emerald-200');
            } else {
                activeLangs.add(lang);
                chip.classList.add('bg-emerald-200');
            }
            resetPool();
        });
    });

    modeToggle.addEventListener('click', () => {
        modeToggle.dataset.mode = 'infinite';
        modeToggle.classList.add('bg-emerald-500');
        modeToggle.classList.remove('bg-white');
        timeModeBtn.classList.remove('bg-emerald-500');
        timeModeBtn.classList.add('bg-white');
        timeOptions.classList.add('hidden');
    });
    timeModeBtn.addEventListener('click', () => {
        modeToggle.dataset.mode = 'timebound';
        timeModeBtn.classList.add('bg-emerald-500');
        timeModeBtn.classList.remove('bg-white');
        modeToggle.classList.remove('bg-emerald-500');
        modeToggle.classList.add('bg-white');
        timeOptions.classList.remove('hidden');
    });

    audioFilesInput.addEventListener('change', (e) => {
        mapAudioFiles(e.target.files);
        // quick visual feedback
        playArea.animate([{ opacity: 0.9 }, { opacity: 1 }], { duration: 360 });
    });

    loadCustomBtn.addEventListener('click', () => {
        const lang = customLangSelect.value;
        const raw = customLettersTextarea.value.trim();
        if (!raw) return;
        const parts = raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
        customLetters[lang] = parts;
        resetPool();
        customLettersTextarea.value = '';
    });

    resetDefaultsBtn.addEventListener('click', () => {
        Object.assign(customLetters, JSON.parse(defaultLettersEl.textContent));
        resetPool();
    });

    startBtn.addEventListener('click', () => {
        if (gameRunning) { pauseGame(); return; }
        startGame();
    });

    pauseBtn.addEventListener('click', pauseGame);
    nextBtn.addEventListener('click', () => {
        // treat as skip
        nextRound();
    });

    showAnswerBtn.addEventListener('click', showAnswer);
    markCorrectBtn.addEventListener('click', markCorrect);

    // small UI helpers
    helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    closeHelp.addEventListener('click', () => helpModal.classList.add('hidden'));

    // initial setup
    (function init() {
        // copy defaults into customLetters
        Object.keys(defaults).forEach(k => customLetters[k] = Array.from(defaults[k]));
        resetPool();
        updateHUD();
        revealDelayVal.textContent = revealDelayInput.value + 's';

        // keyboard shortcuts for quick testing
        window.addEventListener('keydown', (e) => {
            if (e.key === ' ') { e.preventDefault(); startBtn.click(); }
            if (e.key === 'n') nextBtn.click();
            if (e.key === 'Enter') markCorrectBtn.click();
            if (e.key === 'Escape') pauseBtn.click();
        });
    })();

})();
