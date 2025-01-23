// Select DOM elements
const micButton = document.getElementById('micButton');
const sendButton = document.getElementById('sendButton');
const transcriptionInput = document.getElementById('transcription');
const shoppingList = document.getElementById('shoppingList');
const printButton = document.getElementById('printButton');

// Initialize Speech Recognition
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'en-US';
recognition.interimResults = false;

let isListening = false;


// Function to process input text into items and quantities
function processInput(input) {
    /**
    * Sample input
    * Half kilo rice, 1 kilo moong daal, 5 kilo sugar, 10 kg sunflower oil, quarter of a kilo batana, quarter kilo milk, 100 gram masala
    */
    const items = [];

    // Split input by commas to separate each item
    const entries = input.split(',');

    entries.forEach(entry => {
        // Trim and normalize each entry
        const normalizedEntry = entry.trim().toLowerCase();

        // Match patterns for quantity, unit, and item name
        const match = normalizedEntry.match(/(half|quarter|1\/2|1\/4|0.5|0.25|.25|.5|\d+(?:\.\d+)?)\s*(?:of\s*)?(kilo|kg|g|grams)?\s*(.+)/i);

        if (match) {
            const rawQuantity = match[1];
            const unit = match[2] || '';
            const item = match[3].trim();

            const quantity = parseQuantity(rawQuantity);

            items.push({ item, quantity: `${quantity} ${unit}`.trim() });
        }
    });

    return items;
}

// Helper function to parse quantities
function parseQuantity(quantity) {
    if (/half/i.test(quantity)) return '½';
    if (/1\/2/i.test(quantity)) return '½';
    if (/.5/i.test(quantity)) return '½';
    if (/0.5/i.test(quantity)) return '½';
    if (/quarter/i.test(quantity)) return '¼';
    if (/1\/4/i.test(quantity)) return '¼';
    if (/.25/i.test(quantity)) return '¼';
    if (/0.25/i.test(quantity)) return '¼';
    return parseFloat(quantity).toString();
}

// Function to update the shopping list table
function updateShoppingList(items) {
    shoppingList.innerHTML = '';

    items.forEach(({ item, quantity }) => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="border border-gray-300 px-4 py-2 title-case">${item}</td>
            <td class="border border-gray-300 px-4 py-2">${quantity}</td>
            <td class="border border-gray-300 px-4 py-2"></td>
        `;

        shoppingList.appendChild(row);
    });
}

// Event listener for microphone button
sendButton.addEventListener('click', () => {
    const items = processInput(transcriptionInput.value);
    console.log(items);
    updateShoppingList(items);
});
// Event listener for microphone button
micButton.addEventListener('click', () => {
    if (!isListening) {
        recognition.start();
        micButton.classList.add('bg-red-500'); // Change mic button color to indicate recording
        micButton.classList.remove('bg-blue-500');
        isListening = true;
    } else {
        recognition.stop();
        micButton.classList.add('bg-blue-500'); // Revert mic button color
        micButton.classList.remove('bg-red-500');
        isListening = false;
    }
});

// Handle recognition results
recognition.onresult = (event) => {
    console.log(event);
    const transcript = event.results[0][0].transcript;
    transcriptionInput.value = transcript;

    const items = processInput(transcript);
    updateShoppingList(items);
};

// Handle recognition errors
recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    micButton.classList.add('bg-blue-500');
    micButton.classList.remove('bg-red-500');
    isListening = false;
};

// Event listener for print button
printButton.addEventListener('click', () => {
    window.print();
});
