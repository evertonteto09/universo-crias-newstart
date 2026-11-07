import { escapeHtml } from "./utils.js";

/**
 * Emojis estáticos do Universo dos Crias.
 * Os arquivos ficam em assets/emojis; o texto salvo usa somente o token
 * [[emoji:ID]]. No editor, o token é representado por uma imagem atômica.
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
const VALUE_DESCRIPTOR = typeof HTMLTextAreaElement === "undefined"
    ? null
    : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
const EDITOR_STATE = new WeakMap();

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

function getNativeValue(textarea) {
    if (!VALUE_DESCRIPTOR) throw new Error("O editor de emojis precisa ser executado em um navegador.");
    return VALUE_DESCRIPTOR.get.call(textarea);
}

function setNativeValue(textarea, value) {
    if (!VALUE_DESCRIPTOR) throw new Error("O editor de emojis precisa ser executado em um navegador.");
    VALUE_DESCRIPTOR.set.call(textarea, String(value ?? "").replace(/\r\n?/g, "\n"));
}

function emojiTokenLength(id) {
    return `[[emoji:${id}]]`.length;
}

function createEditorEmoji(id) {
    const emoji = EMOJI_BY_ID.get(String(id));
    if (!emoji) return null;

    const image = document.createElement("img");
    image.className = "emoji-editor-atom";
    image.src = new URL(emoji.file, EMOJI_DIRECTORY_URL).href;
    image.alt = emoji.name;
    image.title = emoji.name;
    image.dataset.emojiId = emoji.id;
    image.contentEditable = "false";
    image.draggable = false;
    image.setAttribute("aria-label", emoji.name);
    return image;
}

function createCanonicalFragment(value) {
    const fragment = document.createDocumentFragment();
    const text = String(value ?? "");
    const regex = /\[\[emoji:(\d{16,20})\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text))) {
        const emoji = createEditorEmoji(match[1]);
        if (!emoji) continue;

        if (match.index > lastIndex) {
            fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        fragment.append(emoji);
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        fragment.append(document.createTextNode(text.slice(lastIndex)));
    }

    return fragment;
}

function appendValueToEditor(editor, value) {
    editor.replaceChildren(createCanonicalFragment(value));
}

function serializeEditorNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    if (node.tagName === "IMG") {
        const id = node.dataset.emojiId;
        return EMOJI_BY_ID.has(id) ? `[[emoji:${id}]]` : (node.alt || "");
    }

    if (node.tagName === "BR") return "\n";
    return serializeEditorChildren(node);
}

function serializeEditorChildren(parent) {
    const children = [...parent.childNodes];
    let result = "";

    children.forEach((child, index) => {
        const isBlock = child.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes(child.tagName);
        if (isBlock) {
            if (result && !result.endsWith("\n")) result += "\n";
            result += serializeEditorNode(child);
            if (index < children.length - 1 && !result.endsWith("\n")) result += "\n";
        } else {
            result += serializeEditorNode(child);
        }
    });

    return result;
}

function getEditorValue(editor) {
    return serializeEditorChildren(editor);
}

function getEditorSelectionOffsets(editor, fallback) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return { ...fallback };

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) && range.startContainer !== editor) {
        return { ...fallback };
    }
    if (!editor.contains(range.endContainer) && range.endContainer !== editor) {
        return { ...fallback };
    }

    try {
        const startRange = document.createRange();
        startRange.selectNodeContents(editor);
        startRange.setEnd(range.startContainer, range.startOffset);
        const endRange = document.createRange();
        endRange.selectNodeContents(editor);
        endRange.setEnd(range.endContainer, range.endOffset);
        return {
            start: serializeEditorChildren(startRange.cloneContents()).length,
            end: serializeEditorChildren(endRange.cloneContents()).length,
        };
    } catch {
        return { ...fallback };
    }
}

function getNodeSerializedLength(node) {
    return serializeEditorNode(node).length;
}

function findDomPointForOffset(editor, requestedOffset) {
    const totalLength = getEditorValue(editor).length;
    let remaining = Math.max(0, Math.min(Number(requestedOffset) || 0, totalLength));

    const walk = (parent) => {
        const children = [...parent.childNodes];
        for (let index = 0; index < children.length; index += 1) {
            const node = children[index];
            const length = getNodeSerializedLength(node);

            if (node.nodeType === Node.TEXT_NODE) {
                if (remaining <= length) return { node, offset: remaining };
                remaining -= length;
                continue;
            }

            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "IMG") {
                if (remaining === 0) return { node: parent, offset: index };
                if (remaining <= length) {
                    return remaining < length / 2
                        ? { node: parent, offset: index }
                        : { node: parent, offset: index + 1 };
                }
                remaining -= length;
                continue;
            }

            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
                if (remaining === 0) return { node: parent, offset: index };
                if (remaining <= 1) return { node: parent, offset: index + 1 };
                remaining -= 1;
                continue;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const nestedPoint = walk(node);
                if (nestedPoint) return nestedPoint;
                // DIV/P adicionam uma quebra lógica entre blocos no serializer.
                if (["DIV", "P"].includes(node.tagName) && index < children.length - 1) {
                    if (remaining === 0) return { node: parent, offset: index + 1 };
                    remaining = Math.max(0, remaining - 1);
                }
            }
        }
        return null;
    };

    return walk(editor) ?? { node: editor, offset: editor.childNodes.length };
}

function setEditorSelection(editor, start, end = start, direction = "none") {
    const startPoint = findDomPointForOffset(editor, start);
    const endPoint = findDomPointForOffset(editor, end);
    const range = document.createRange();
    try {
        range.setStart(startPoint.node, startPoint.offset);
        range.setEnd(endPoint.node, endPoint.offset);
    } catch {
        range.selectNodeContents(editor);
        range.collapse(false);
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const state = EDITOR_STATE.get(editor);
    if (state) {
        state.lastSelection = {
            start: Math.min(start, end),
            end: Math.max(start, end),
            direction,
        };
    }
}

function dispatchTextareaInput(textarea, sourceEvent = null) {
    let event;
    try {
        event = new InputEvent("input", {
            bubbles: true,
            inputType: sourceEvent?.inputType || "insertText",
            data: sourceEvent?.data ?? null,
        });
    } catch {
        event = new Event("input", { bubbles: true });
    }
    textarea.dispatchEvent(event);
}

function dispatchForwardedEvent(textarea, type, originalEvent) {
    let forwarded;
    if (type === "beforeinput") {
        try {
            forwarded = new InputEvent(type, {
                bubbles: false,
                cancelable: true,
                inputType: originalEvent.inputType || "",
                data: originalEvent.data ?? null,
            });
        } catch {
            forwarded = new Event(type, { cancelable: true });
        }
    } else if (type === "keydown") {
        forwarded = new KeyboardEvent(type, {
            bubbles: false,
            cancelable: true,
            key: originalEvent.key,
            code: originalEvent.code,
            ctrlKey: originalEvent.ctrlKey,
            metaKey: originalEvent.metaKey,
            altKey: originalEvent.altKey,
            shiftKey: originalEvent.shiftKey,
            repeat: originalEvent.repeat,
        });
    } else {
        forwarded = new Event(type, { bubbles: false, cancelable: true });
    }

    textarea.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented) originalEvent.preventDefault();
    if (forwarded.cancelBubble) originalEvent.stopImmediatePropagation();
    return forwarded;
}

function removeAdjacentEmojiAtom(editor, direction) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) && range.startContainer !== editor) return false;

    let parent = range.startContainer;
    let candidate = null;

    if (parent.nodeType === Node.TEXT_NODE) {
        const textOffset = range.startOffset;
        const atBoundary = direction === "backward"
            ? textOffset === 0
            : textOffset === (parent.nodeValue ?? "").length;
        if (!atBoundary) return false;
        candidate = direction === "backward" ? parent.previousSibling : parent.nextSibling;
        parent = parent.parentNode;
    } else {
        candidate = parent.childNodes[direction === "backward" ? range.startOffset - 1 : range.startOffset] ?? null;
    }

    if (!candidate || candidate.nodeType !== Node.ELEMENT_NODE || candidate.tagName !== "IMG" || !EMOJI_BY_ID.has(candidate.dataset.emojiId)) {
        return false;
    }

    const imageParent = candidate.parentNode;
    const imageIndex = [...imageParent.childNodes].indexOf(candidate);
    candidate.remove();

    const caret = document.createRange();
    caret.setStart(imageParent, Math.min(imageIndex, imageParent.childNodes.length));
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    syncEditorFromDom(editor, null);
    return true;
}

function insertTextAtEditorSelection(editor, text) {
    const selection = window.getSelection();
    let range;
    if (selection?.rangeCount && (editor.contains(selection.anchorNode) || selection.anchorNode === editor)) {
        range = selection.getRangeAt(0);
    } else {
        const state = EDITOR_STATE.get(editor);
        const offsets = state?.lastSelection ?? { start: getEditorValue(editor).length, end: getEditorValue(editor).length };
        const start = findDomPointForOffset(editor, offsets.start);
        const end = findDomPointForOffset(editor, offsets.end);
        range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
    }

    range.deleteContents();
    const textNode = document.createTextNode(String(text ?? ""));
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorFromDom(editor, null);
}

function insertCanonicalTextAtEditorSelection(editor, text) {
    const selection = window.getSelection();
    let range;
    if (selection?.rangeCount && (editor.contains(selection.anchorNode) || selection.anchorNode === editor)) {
        range = selection.getRangeAt(0);
    } else {
        const state = EDITOR_STATE.get(editor);
        const offsets = state?.lastSelection ?? { start: getEditorValue(editor).length, end: getEditorValue(editor).length };
        const start = findDomPointForOffset(editor, offsets.start);
        const end = findDomPointForOffset(editor, offsets.end);
        range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
    }

    range.deleteContents();
    const fragment = createCanonicalFragment(text);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode?.parentNode) range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorFromDom(editor, null);
}

function syncEditorFromDom(editor, sourceEvent) {
    const state = EDITOR_STATE.get(editor);
    if (!state) return;

    const nextValue = getEditorValue(editor);
    const maxLength = Number(state.textarea.maxLength);
    if (maxLength > 0 && nextValue.length > maxLength) {
        const offsets = getEditorSelectionOffsets(editor, state.lastSelection);
        appendValueToEditor(editor, state.lastValidValue);
        const caret = Math.min(state.lastValidValue.length, offsets.start);
        setEditorSelection(editor, caret, caret);
        editor.dataset.limitReached = "true";
        return;
    }

    state.lastValidValue = nextValue;
    state.lastSelection = getEditorSelectionOffsets(editor, state.lastSelection);
    delete editor.dataset.limitReached;
    setNativeValue(state.textarea, nextValue);
    dispatchTextareaInput(state.textarea, sourceEvent);
}

function installTextareaFacade(textarea, editor, state) {
    Object.defineProperty(textarea, "value", {
        configurable: true,
        get() {
            return getEditorValue(editor);
        },
        set(value) {
            const nextValue = String(value ?? "").replace(/\r\n?/g, "\n");
            setNativeValue(textarea, nextValue);
            appendValueToEditor(editor, nextValue);
            state.lastValidValue = nextValue;
            state.lastSelection = { start: nextValue.length, end: nextValue.length, direction: "none" };
        },
    });

    Object.defineProperty(textarea, "selectionStart", {
        configurable: true,
        get() {
            const current = getEditorSelectionOffsets(editor, state.lastSelection);
            return current.start;
        },
    });
    Object.defineProperty(textarea, "selectionEnd", {
        configurable: true,
        get() {
            const current = getEditorSelectionOffsets(editor, state.lastSelection);
            return current.end;
        },
    });
    Object.defineProperty(textarea, "setSelectionRange", {
        configurable: true,
        value(start, end = start, direction = "none") {
            setEditorSelection(editor, start, end, direction);
        },
    });
    Object.defineProperty(textarea, "setRangeText", {
        configurable: true,
        value(replacement, start, end, selectionMode = "preserve") {
            const value = getEditorValue(editor);
            const current = getEditorSelectionOffsets(editor, state.lastSelection);
            const from = Math.max(0, Math.min(start ?? current.start, value.length));
            const to = Math.max(from, Math.min(end ?? current.end, value.length));
            const inserted = String(replacement ?? "");
            const nextValue = value.slice(0, from) + inserted + value.slice(to);
            this.value = nextValue;

            if (selectionMode === "select") {
                this.setSelectionRange(from, from + inserted.length);
            } else if (selectionMode === "start") {
                this.setSelectionRange(from, from);
            } else if (selectionMode === "preserve") {
                const cursor = current.start <= from ? current.start : current.start >= to
                    ? current.start + inserted.length - (to - from)
                    : from + inserted.length;
                this.setSelectionRange(cursor, cursor);
            } else {
                const cursor = from + inserted.length;
                this.setSelectionRange(cursor, cursor);
            }
        },
    });
    Object.defineProperty(textarea, "focus", {
        configurable: true,
        value(options) {
            editor.focus(options);
        },
    });
}

function mountRichEmojiEditor(textarea) {
    const existing = EDITOR_STATE.get(textarea);
    if (existing) return existing.editor;

    const initialValue = getNativeValue(textarea);
    const editor = document.createElement("div");
    editor.className = "emoji-rich-editor";
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    const labelClone = textarea.closest("label")?.cloneNode(true);
    labelClone?.querySelectorAll("textarea, .emoji-rich-editor").forEach((node) => node.remove());
    const labelText = labelClone?.textContent?.replace(/\s+/g, " ").trim();
    editor.setAttribute("aria-label", textarea.getAttribute("aria-label") || labelText || "Texto");
    editor.setAttribute("data-placeholder", textarea.getAttribute("placeholder") || "Escreva aqui...");
    editor.setAttribute("data-maxlength", String(textarea.maxLength > 0 ? textarea.maxLength : ""));
    editor.style.minHeight = `${Math.max(4, Number(textarea.rows) || 6) * 1.5}em`;
    if (textarea.required) editor.setAttribute("aria-required", "true");
    if (textarea.className) editor.classList.add(...textarea.className.split(/\s+/).filter(Boolean));

    const state = {
        textarea,
        editor,
        lastValidValue: initialValue,
        lastSelection: { start: initialValue.length, end: initialValue.length, direction: "none" },
    };
    EDITOR_STATE.set(textarea, state);
    EDITOR_STATE.set(editor, state);

    textarea.parentNode.insertBefore(editor, textarea);
    textarea.classList.add("emoji-source-textarea");
    textarea.required = false;
    textarea.tabIndex = -1;
    textarea.setAttribute("aria-hidden", "true");

    installTextareaFacade(textarea, editor, state);
    appendValueToEditor(editor, initialValue);

    const rememberSelection = () => {
        state.lastSelection = getEditorSelectionOffsets(editor, state.lastSelection);
    };
    ["keyup", "mouseup", "click", "focus", "blur", "input"].forEach((type) => {
        editor.addEventListener(type, rememberSelection);
    });

    editor.addEventListener("beforeinput", (event) => {
        dispatchForwardedEvent(textarea, "beforeinput", event);
        if (event.defaultPrevented) return;

        if (["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
            event.preventDefault();
            insertTextAtEditorSelection(editor, "\n");
            return;
        }

        if (event.inputType === "deleteContentBackward" && removeAdjacentEmojiAtom(editor, "backward")) {
            event.preventDefault();
            return;
        }
        if (event.inputType === "deleteContentForward" && removeAdjacentEmojiAtom(editor, "forward")) {
            event.preventDefault();
        }
    });

    editor.addEventListener("keydown", (event) => {
        dispatchForwardedEvent(textarea, "keydown", event);
        if (event.defaultPrevented) return;

        if (event.key === "Enter") {
            event.preventDefault();
            insertTextAtEditorSelection(editor, "\n");
            return;
        }
        if (event.key === "Backspace" && removeAdjacentEmojiAtom(editor, "backward")) {
            event.preventDefault();
            return;
        }
        if (event.key === "Delete" && removeAdjacentEmojiAtom(editor, "forward")) {
            event.preventDefault();
        }
    });

    editor.addEventListener("input", (event) => {
        if (event.defaultPrevented) return;
        syncEditorFromDom(editor, event);
    });

    editor.addEventListener("copy", (event) => {
        const selection = window.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== editor) return;
        const copiedValue = serializeEditorChildren(range.cloneContents());
        if (event.clipboardData) {
            event.clipboardData.setData("text/plain", copiedValue);
            event.preventDefault();
        }
    });

    editor.addEventListener("cut", (event) => {
        dispatchForwardedEvent(textarea, "cut", event);
        if (event.defaultPrevented) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== editor) return;
        const cutValue = serializeEditorChildren(range.cloneContents());
        if (event.clipboardData) event.clipboardData.setData("text/plain", cutValue);
        event.preventDefault();
        range.deleteContents();
        syncEditorFromDom(editor, event);
    });

    editor.addEventListener("paste", (event) => {
        dispatchForwardedEvent(textarea, "paste", event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const plainText = (event.clipboardData?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n");
        insertCanonicalTextAtEditorSelection(editor, plainText);
    });
    editor.addEventListener("drop", (event) => {
        dispatchForwardedEvent(textarea, "drop", event);
        if (!event.defaultPrevented) event.preventDefault();
    });

    const form = textarea.closest("form");
    form?.addEventListener("reset", () => {
        queueMicrotask(() => {
            const resetValue = getNativeValue(textarea);
            appendValueToEditor(editor, resetValue);
            state.lastValidValue = resetValue;
            state.lastSelection = { start: resetValue.length, end: resetValue.length, direction: "none" };
        });
    });

    return editor;
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
 * Substitui visualmente o textarea por um editor contenteditable que mostra
 * cada emoji como uma imagem indivisível. O textarea original permanece como
 * fonte compatível para o restante do site: seu .value continua serializado
 * como [[emoji:ID]], sem expor o identificador na interface.
 */
export function mountEmojiPicker({ textarea, host }) {
    if (!textarea || !host || host.dataset.emojiPickerReady === "true") return;

    const editor = mountRichEmojiEditor(textarea);
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

    // Mantém o editor conectado ao controle visual e informa ao leitor de tela
    // que as imagens embutidas representam emojis selecionáveis/removíveis.
    editor.dataset.emojiRichEditor = "true";
}
