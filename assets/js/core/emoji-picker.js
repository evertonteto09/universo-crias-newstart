import { escapeHtml } from "./utils.js";

/**
 * Emojis estáticos do Universo dos Crias.
 * Os arquivos ficam em assets/emojis e não precisam ser enviados ao Supabase.
 * O identificador gravado no texto é o nome numérico do arquivo, sem extensão.
 */
export const EMOJI_CATALOG = Object.freeze([
    { id: "1113196881007345726", name: "Carinho azul", file: "1113196881007345726.png" },
    { id: "1117810861097091134", name: "Personagem de anime com óculos", file: "1117810861097091134.png" },
    { id: "1171628585182838864", name: "Gato de óculos", file: "1171628585182838864.png" },
    { id: "1339388374263271434", name: "Gato fazendo joinha", file: "1339388374263271434.png" },
    { id: "1364037079507533905", name: "Cachorrinho", file: "1364037079507533905.png" },
    { id: "1364037208691970090", name: "Rosto surpreso", file: "1364037208691970090.png" },
    { id: "1411891533854150656", name: "Gato palhaço", file: "1411891533854150656.png" },
    { id: "1453803004376645673", name: "Gato emocionado", file: "1453803004376645673.png" },
    { id: "1499030628761600010", name: "Sapo com uma cruz", file: "1499030628761600010.png" },
    { id: "1559955451934802031", name: "Pessoa de óculos", file: "1559955451934802031.png" },
    { id: "1568365307570032800", name: "Jogador sorrindo", file: "1568365307570032800.png" },
    { id: "1568365346417549463", name: "Meme Does he know", file: "1568365346417549463.png" },
    { id: "1568365438155366430", name: "Jogador de futebol", file: "1568365438155366430.png" },
    { id: "1568365515498590249", name: "Guaxinim", file: "1568365515498590249.png" },
    { id: "1568365541591355392", name: "Personagem de anime em preto e branco", file: "1568365541591355392.png" },
    { id: "1568365580900114453", name: "Coelho", file: "1568365580900114453.png" },
    { id: "492031932717072395", name: "Calopsita de chapéu", file: "492031932717072395.png" },
]);

const EMOJI_BY_ID = new Map(EMOJI_CATALOG.map((emoji) => [emoji.id, emoji]));
const EMOJI_TOKEN_REGEX = /\[\[emoji:(\d{16,20})\]\]/g;
const EMOJI_DIRECTORY_URL = new URL("../../emojis/", import.meta.url);

export function getEmojiMarkup(id) {
    const emoji = EMOJI_BY_ID.get(String(id));
    if (!emoji) return null;

    const imageUrl = new URL(emoji.file, EMOJI_DIRECTORY_URL).href;
    return `<img class="site-emoji" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(emoji.name)}" title="${escapeHtml(emoji.name)}" loading="lazy" decoding="async">`;
}

/** Recebe texto já escapado e substitui somente os tokens conhecidos. */
export function renderEmojiTokens(escapedText) {
    return String(escapedText ?? "").replace(EMOJI_TOKEN_REGEX, (token, id) => {
        return getEmojiMarkup(id) ?? token;
    });
}

/** Escapa texto enviado por leitores/escritores e renderiza os emojis permitidos. */
export function renderEmojiText(value) {
    return renderEmojiTokens(escapeHtml(value));
}

let activePickerHost = null;
let globalPickerListenersReady = false;
let pickerSequence = 0;
const pickerTextareaByHost = new WeakMap();

function closePicker(host) {
    if (!host) return;
    const toggle = host.querySelector("[data-emoji-picker-toggle]");
    const panel = host.querySelector("[data-emoji-picker-panel]");
    if (panel) panel.hidden = true;
    if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "😊 Inserir emoji";
    }
    host.dataset.open = "false";
    if (activePickerHost === host) activePickerHost = null;
}

function ensureGlobalPickerListeners() {
    if (globalPickerListenersReady || typeof document === "undefined") return;
    globalPickerListenersReady = true;

    document.addEventListener("click", (event) => {
        if (!activePickerHost) return;
        if (!activePickerHost.isConnected) {
            activePickerHost = null;
            return;
        }
        if (!activePickerHost.contains(event.target)) {
            closePicker(activePickerHost);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && activePickerHost) {
            closePicker(activePickerHost);
        }
    });
}

/**
 * Monta o seletor visual de emojis para um textarea.
 * O texto inserido é um token curto; as imagens são servidas diretamente
 * pelo GitHub Pages a partir de assets/emojis.
 */
export function mountEmojiPicker({ textarea, host }) {
    if (!textarea || !host || host.dataset.emojiPickerReady === "true") return;

    host.dataset.emojiPickerReady = "true";
    host.classList.add("emoji-picker-host");
    pickerTextareaByHost.set(host, textarea);
    ensureGlobalPickerListeners();

    const panelId = `emoji-picker-panel-${++pickerSequence}`;
    host.innerHTML = `
        <button
            type="button"
            class="secondary-button emoji-picker-toggle"
            data-emoji-picker-toggle
            aria-expanded="false"
            aria-controls="${panelId}"
        >
            😊 Inserir emoji
        </button>
        <section
            id="${panelId}"
            class="emoji-picker-panel"
            data-emoji-picker-panel
            aria-label="Tabela de emojis"
            hidden
        >
            <p class="emoji-picker-heading">Escolha um emoji</p>
            <div class="emoji-picker-grid" role="group" aria-label="Emojis disponíveis">
                ${EMOJI_CATALOG.map((emoji) => {
                    const imageUrl = new URL(emoji.file, EMOJI_DIRECTORY_URL).href;
                    return `
                        <button
                            type="button"
                            class="emoji-picker-option"
                            data-emoji-id="${emoji.id}"
                            title="${escapeHtml(emoji.name)}"
                            aria-label="Inserir ${escapeHtml(emoji.name)}"
                        >
                            <img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async">
                        </button>
                    `;
                }).join("")}
            </div>
            <p class="emoji-picker-feedback" data-emoji-picker-feedback role="status" aria-live="polite"></p>
        </section>
    `;

    host.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-emoji-picker-toggle]");
        if (toggle) {
            event.preventDefault();
            if (activePickerHost && activePickerHost !== host) {
                closePicker(activePickerHost);
            }

            const panel = host.querySelector("[data-emoji-picker-panel]");
            const isOpen = host.dataset.open === "true";
            if (isOpen) {
                closePicker(host);
            } else {
                panel.hidden = false;
                host.dataset.open = "true";
                activePickerHost = host;
                toggle.setAttribute("aria-expanded", "true");
                toggle.textContent = "✕ Fechar emojis";
            }
            return;
        }

        const choice = event.target.closest("[data-emoji-id]");
        if (!choice) return;
        event.preventDefault();

        const target = pickerTextareaByHost.get(host);
        const emojiId = choice.dataset.emojiId;
        if (!target || !EMOJI_BY_ID.has(emojiId)) return;

        const token = `[[emoji:${emojiId}]]`;
        const start = Number.isInteger(target.selectionStart) ? target.selectionStart : target.value.length;
        const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : start;
        const currentValue = String(target.value ?? "");
        const maxLength = Number(target.maxLength);
        const nextLength = currentValue.length - (end - start) + token.length;
        const feedback = host.querySelector("[data-emoji-picker-feedback]");

        if (maxLength > 0 && nextLength > maxLength) {
            if (feedback) feedback.textContent = `Este emoji ultrapassaria o limite de ${maxLength} caracteres.`;
            return;
        }

        target.setRangeText(token, start, end, "end");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        if (feedback) feedback.textContent = `${EMOJI_BY_ID.get(emojiId).name} inserido.`;
        closePicker(host);
        target.focus({ preventScroll: true });
    });
}
