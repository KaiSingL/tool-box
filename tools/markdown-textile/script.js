// State Management
const inputEl = document.getElementById('input');
const toTextileBtn = document.getElementById('to-textile');
const toMarkdownBtn = document.getElementById('to-markdown');
const copyBtn = document.getElementById('copy-btn');
const errorEl = document.getElementById('error');
const actionsEl = document.getElementById('converter-actions');
const formHeaderEl = document.querySelector('.form-group__header');

const PIN_OFFSET = 80;
let formHeaderTop = 0;

function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
}

// Editor: grow height to match content so the page scrolls instead of the textarea
function autoGrow() {
    const scrollY = window.scrollY;
    inputEl.style.height = 'auto';
    const borderHeight = inputEl.offsetHeight - inputEl.clientHeight;
    inputEl.style.height = inputEl.scrollHeight + borderHeight + 'px';
    window.scrollTo({ top: scrollY, behavior: 'instant' });
}

// Actions bar: stays on the Markup row at the top, floats when scrolled down
function measureFormHeader() {
    formHeaderTop = formHeaderEl.getBoundingClientRect().top + window.scrollY;
    updateActions();
}

function updateActions() {
    const shouldPin = window.scrollY >= formHeaderTop - PIN_OFFSET;
    actionsEl.classList.toggle('is-fixed', shouldPin);
}

// Conversion: Markdown -> Textile (offline, vendored library)
function convertToTextile() {
    clearError();
    const source = inputEl.value;
    if (!source.trim()) {
        showError('Nothing to convert. Paste some markup first.');
        return;
    }
    try {
        const result = new MarkdownToTextile().convert(source);
        inputEl.value = result;
        autoGrow();
        inputEl.focus({ preventScroll: true });
    } catch (err) {
        showError('Failed to convert to Textile: ' + err.message);
    }
}

// Conversion: Textile -> Markdown (textile-js -> turndown)
function convertToMarkdown() {
    clearError();
    const source = inputEl.value;
    if (!source.trim()) {
        showError('Nothing to convert. Paste some markup first.');
        return;
    }
    try {
        const result = convertTextileToMarkdown(source);
        inputEl.value = result;
        autoGrow();
        inputEl.focus({ preventScroll: true });
    } catch (err) {
        showError('Failed to convert to Markdown: ' + err.message);
    }
}

async function copyOutput() {
    const text = inputEl.value;
    if (!text) {
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = original;
        }, 1500);
    } catch (err) {
        showError('Could not copy to clipboard: ' + err.message);
    }
}

// Event Listeners
toTextileBtn.addEventListener('click', convertToTextile);
toMarkdownBtn.addEventListener('click', convertToMarkdown);
copyBtn.addEventListener('click', copyOutput);

inputEl.addEventListener('input', () => {
    clearError();
    autoGrow();
});

window.addEventListener('scroll', updateActions, { passive: true });
window.addEventListener('resize', measureFormHeader);
window.addEventListener('load', () => {
    autoGrow();
    measureFormHeader();
});
