/**
 * Bayaaz - Urdu Ebook Editor Prototype
 * JavaScript for UI logic and dynamic styling.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- UI Element Selectors ---
    const editorTab = document.getElementById('editor-tab');
    const stylesTab = document.getElementById('styles-tab');
    const editorView = document.getElementById('editor-view');
    const stylesView = document.getElementById('styles-view');

    // --- Styles Controls ---
    const fontSelect = document.getElementById('font-select');
    const textSizeControl = document.getElementById('text-size');
    const textSizeValue = document.getElementById('text-size-value');
    const justifyBtn = document.getElementById('justify-btn');

    // --- Tab Switching Logic ---
    function showTab(tabName) {
        if (tabName === 'editor') {
            editorView.classList.remove('hidden');
            stylesView.classList.add('hidden');
            editorTab.classList.add('active-tab', 'border-blue-600', 'text-blue-600');
            stylesTab.classList.remove('active-tab', 'border-blue-600', 'text-blue-600');
        } else {
            editorView.classList.add('hidden');
            stylesView.classList.remove('hidden');
            stylesTab.classList.add('active-tab', 'border-blue-600', 'text-blue-600');
            editorTab.classList.remove('active-tab', 'border-blue-600', 'text-blue-600');
        }
    }

    // Event listeners for tab clicks
    editorTab.addEventListener('click', () => showTab('editor'));
    stylesTab.addEventListener('click', () => showTab('styles'));

    // --- Dynamic Styling Logic ---

    // 1. Font Selection
    fontSelect.addEventListener('change', (event) => {
        // Remove existing font classes to prevent conflicts
        editorView.classList.remove('nastaleeq-font', 'amiri-font');

        // Add the new font class based on the selected value
        const selectedFontClass = event.target.value;
        editorView.classList.add(selectedFontClass);
    });

    // 2. Text Size Control
    textSizeControl.addEventListener('input', (event) => {
        const size = event.target.value + 'px';
        editorView.style.fontSize = size;
        textSizeValue.textContent = size; // Update the displayed value
    });

    // 3. Justification (Shakeeb Justify)
    justifyBtn.addEventListener('click', () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let parentElement = range.commonAncestorContainer;

            // Find a block-level element to apply the class to (e.g., <p>, <div>)
            while (parentElement && !['P', 'DIV', 'H1', 'H2'].includes(parentElement.tagName)) {
                parentElement = parentElement.parentElement;
            }

            if (parentElement) {
                // Toggle the 'justify-text' class to apply or remove the justification
                parentElement.classList.toggle('justify-text');
                // Optional: Provide a visual cue that the action was performed
                justifyBtn.textContent = parentElement.classList.contains('justify-text') ? 'جسٹفائی ہٹائیں' : 'جسٹفائی کریں';
            }
        }
    });

    // --- Initial State ---
    // Make sure the editor view is the first thing the user sees.
    showTab('editor');

    // Optional: Add some content on initial load for a better demo
    if (editorView.innerHTML.trim() === '') {
        editorView.innerHTML = `
            <h1 class="text-3xl font-bold mb-4">یہاں اپنی کتاب کا عنوان لکھیں۔</h1>
            <p>یہاں سے اپنی کتاب لکھنا شروع کریں۔</p>
            <p>مثال: اس سطر پر کلک کریں اور جسٹیفائی بٹن دبائیں شاعری کے لیے۔</p>
        `;
    }
});