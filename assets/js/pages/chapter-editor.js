import { setupTheme } from "../core/theme.js";
import {
    escapeHtml,
    showMessage,
} from "../core/utils.js";

import { signOut } from "../services/auth.service.js";
import {
    getMyWriterAccount,
} from "../services/writer.service.js";

import {
    getWriterChapter,
    updateChapter,
    deleteChapter,
} from "../services/chapter.service.js";

import { supabase } from "../core/supabase.js";
import {
    getChapterImageUrl,
    removeChapterImage,
} from "../services/storage.service.js";

import {
    openConfirmModal,
    openFormModal,
} from "../core/modal.js";

setupTheme();

const root =
    document.querySelector(
        "#chapter-editor-root"
    );

const writerName =
    document.querySelector(
        "#writer-name"
    );

const params =
    new URLSearchParams(
        location.search
    );

const chapterId =
    Number(params.get("chapter"));

const storyId =
    Number(params.get("story"));

let chapter = null;
let saveTimer = null;
let imageInsertSelection = { start: 0, end: 0 };
let protectedImageSnapshot = {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
};
let bypassProtectedGuard = 0;


function ensureChapterImageStyles() {
    if (
        document.querySelector(
            "#chapter-image-manager-styles"
        )
    ) {
        return;
    }

    const style = document.createElement("style");
    style.id = "chapter-image-manager-styles";
    style.textContent = `
        .chapter-images-manager {
            margin-top: 20px;
            padding: 24px;
            border: 1px solid rgba(127, 102, 255, 0.18);
            border-radius: 20px;
            background: rgba(127, 102, 255, 0.04);
        }

        .chapter-images-manager-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            margin-bottom: 18px;
        }

        .chapter-images-manager-title {
            margin: 4px 0 0;
            font-size: 1.15rem;
        }

        .chapter-images-manager-list {
            display: grid;
            gap: 18px;
        }

        .chapter-image-card {
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(127, 102, 255, 0.18);
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.03);
        }

        .chapter-image-card-visual {
            position: relative;
            min-height: 180px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 22px;
            background:
                radial-gradient(
                    circle at 50% 0%,
                    rgba(127, 102, 255, 0.12),
                    transparent 58%
                );
        }

        .chapter-image-card img {
            display: block;
            width: min(100%, 760px);
            max-height: 520px;
            object-fit: contain;
            border-radius: 12px;
        }

        .chapter-image-delete {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 2;
            width: 42px;
            height: 42px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255, 95, 95, 0.55);
            border-radius: 999px;
            background: rgba(120, 10, 10, 0.94);
            color: #ffffff;
            font-size: 1.4rem;
            font-weight: 800;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
            transition:
                transform 0.15s ease,
                background 0.15s ease;
        }

        .chapter-image-delete:hover {
            background: rgba(175, 18, 18, 0.98);
            transform: translateY(-1px);
        }

        .chapter-image-card-info {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 16px 18px 18px;
        }

        .chapter-image-card-info strong {
            font-size: 0.96rem;
        }

        .chapter-image-card-path {
            overflow-wrap: anywhere;
            font-size: 0.78rem;
            opacity: 0.72;
        }

        .chapter-image-card-origin {
            font-size: 0.76rem;
            opacity: 0.68;
        }

        .chapter-image-manager-empty {
            padding: 22px;
            border: 1px dashed rgba(127, 102, 255, 0.24);
            border-radius: 14px;
            text-align: center;
        }

        .chapter-image-manager-loading {
            display: flex;
            align-items: center;
            min-height: 70px;
        }

        @media (max-width: 700px) {
            .chapter-images-manager {
                padding: 18px;
            }

            .chapter-image-card-visual {
                padding: 12px;
            }

            .chapter-image-card img {
                max-height: 420px;
            }

            .chapter-image-delete {
                top: 8px;
                right: 8px;
            }
        }
    `;

    document.head.appendChild(style);
}

function render() {
    ensureChapterImageStyles();

    root.innerHTML = `
        <div class="editor-topbar">
            <div>
                <a
                    class="text-link"
                    href="./story-editor.html?id=${storyId}"
                >
                    ← Voltar para a história
                </a>

                <span class="eyebrow">
                    EDITOR DE EPISÓDIO
                </span>

                <h1>
                    ${escapeHtml(
                        chapter.title
                    )}
                </h1>

                <p class="muted">
                    ${
                        chapter.number === 0
                            ? "Piloto"
                            : `Episódio ${chapter.number}`
                    }
                    ·
                    <span id="save-state">
                        ${
                            chapter.status ===
                            "published"
                                ? "Publicado"
                                : "Rascunho"
                        }
                    </span>
                </p>
            </div>
        </div>

        <section class="chapter-editor-shell">
            <div class="editor-panel chapter-toolbar">
                <label>
                    Título do episódio
                    <input
                        id="chapter-title"
                        maxlength="200"
                        value="${escapeHtml(
                            chapter.title
                        )}"
                    >
                </label>

                <div class="editor-toolbar-row">
                    <div>
                        <span class="eyebrow">
                            CONTEÚDO
                        </span>

                        <span
                            id="content-counter"
                            class="muted"
                        >
                            0 caracteres · 0 palavras
                        </span>
                    </div>

                    <span
                        class="status-pill ${chapter.status}"
                        id="chapter-status-pill"
                    >
                        ${
                            chapter.status ===
                            "published"
                                ? "Publicado"
                                : "Rascunho"
                        }
                    </span>
                </div>

                <div class="chapter-media-tools">
                    <button
                        id="insert-image-button"
                        class="secondary-button"
                        type="button"
                    >
                        🖼️ Inserir imagem
                    </button>

                    <span class="muted">
                        A imagem será inserida na posição atual do cursor.
                        Linhas de imagem são protegidas e só podem ser removidas pelo gerenciador abaixo.
                    </span>
                </div>
            </div>

            <textarea
                id="chapter-content"
                class="chapter-content-editor"
                spellcheck="true"
                placeholder="Escreva seu episódio aqui..."
            >${escapeHtml(
                chapter.content || ""
            )}</textarea>

            <section
                class="chapter-images-manager"
                id="chapter-images-manager"
            >
                <div class="chapter-images-manager-header">
                    <div>
                        <span class="eyebrow">
                            ILUSTRAÇÕES
                        </span>

                        <h2 class="chapter-images-manager-title">
                            Imagens do episódio
                        </h2>

                        <p class="muted">
                            As imagens inseridas no texto aparecem aqui.
                            O <strong>×</strong> vermelho remove a imagem
                            do episódio e apaga o arquivo enviado ao Storage.
                        </p>
                    </div>

                    <span
                        class="muted"
                        id="chapter-images-count"
                    >
                        0 imagens
                    </span>
                </div>

                <div
                    id="chapter-images-list"
                    class="chapter-images-manager-list"
                >
                    <div class="chapter-image-manager-loading muted">
                        Carregando imagens...
                    </div>
                </div>
            </section>


            <div class="editor-actions sticky-actions">
                <button
                    id="save-draft-button"
                    class="secondary-button"
                    type="button"
                >
                    Salvar rascunho
                </button>

                <button
                    id="publish-button"
                    class="primary-button"
                    type="button"
                >
                    Publicar episódio
                </button>

                <button
                    id="unpublish-button"
                    class="secondary-button"
                    type="button"
                    hidden
                >
                    Voltar para rascunho
                </button>

                <button
                    id="delete-chapter-button"
                    class="danger-button"
                    type="button"
                >
                    Excluir episódio
                </button>

                <span
                    id="chapter-message"
                    class="form-message"
                    role="alert"
                    aria-live="polite"
                ></span>
            </div>

            <aside class="editor-help">
                <strong>Rascunho seguro</strong>
                <p>
                    Enquanto o episódio estiver como rascunho,
                    ele permanece disponível somente para o
                    escritor autorizado. O leitor só recebe
                    capítulos publicados.
                </p>

                <p>
                    Para ilustrar uma cena, use <strong>Inserir imagem</strong>.
                    Arquivos enviados ficam no Storage e a referência é salva
                    junto do texto do episódio. Linhas de imagem ficam protegidas
                    contra edição manual; use o X da imagem para removê-las.
                </p>
            </aside>
        </section>
    `;

    updateCounter();
    bind();
    syncProtectedImageSnapshot();
    renderChapterImages();
}

function getProtectedImageRanges(content) {
    const source = String(content ?? "");
    const ranges = [];

    const regex =
        /^[ \t]*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\][ \t]*(?:\r?\n|$)/gim;

    for (const match of source.matchAll(regex)) {
        const start = Number(match.index) || 0;
        const raw = String(match[0] ?? "");

        ranges.push({
            start,
            end: start + raw.length,
            token: raw.replace(/\r?\n$/u, ""),
        });
    }

    return ranges;
}

function getProtectedImageSignature(content) {
    return getProtectedImageRanges(content)
        .map((range) => range.token)
        .join("\n\u0000");
}

function captureProtectedImageSnapshot(textarea) {
    if (!textarea) return;

    protectedImageSnapshot = {
        value: textarea.value,
        selectionStart:
            Number(textarea.selectionStart) || 0,
        selectionEnd:
            Number(textarea.selectionEnd) || 0,
    };
}

function syncProtectedImageSnapshot(textarea) {
    const target =
        textarea ||
        document.querySelector("#chapter-content");

    captureProtectedImageSnapshot(target);
}

function protectedSelectionIntersects(start, end, ranges) {
    if (start === end) {
        return ranges.some(
            (range) =>
                start >= range.start &&
                start < range.end
        );
    }

    return ranges.some(
        (range) =>
            start < range.end &&
            end > range.start
    );
}

function isEditingKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }

    return (
        event.key.length === 1 ||
        event.key === "Enter" ||
        event.key === "Backspace" ||
        event.key === "Delete"
    );
}

function showProtectedImageMessage() {
    const message =
        document.querySelector("#chapter-message");

    if (!message) return;

    showMessage(
        message,
        "A linha da imagem é protegida. Use o X da imagem para removê-la.",
        "error",
    );
}

function restoreProtectedImageSnapshot(textarea) {
    if (!textarea) return;

    bypassProtectedGuard += 1;

    try {
        textarea.value =
            protectedImageSnapshot.value;

        const selectionStart =
            Math.min(
                protectedImageSnapshot.selectionStart,
                textarea.value.length,
            );

        const selectionEnd =
            Math.min(
                protectedImageSnapshot.selectionEnd,
                textarea.value.length,
            );

        textarea.focus();
        textarea.setSelectionRange(
            selectionStart,
            selectionEnd,
        );
    } finally {
        bypassProtectedGuard -= 1;
    }
}

function isSelectionInsideProtectedLine(
    textarea,
) {
    if (!textarea) return false;

    const ranges =
        getProtectedImageRanges(
            textarea.value
        );

    return protectedSelectionIntersects(
        Number(textarea.selectionStart) || 0,
        Number(textarea.selectionEnd) || 0,
        ranges,
    );
}

function bindProtectedImageEditing(textarea) {
    if (!textarea || textarea.dataset.protectedImagesBound === "true") {
        return;
    }

    textarea.dataset.protectedImagesBound = "true";

    syncProtectedImageSnapshot(textarea);

    textarea.addEventListener(
        "beforeinput",
        (event) => {
            if (bypassProtectedGuard > 0) {
                return;
            }

            const start =
                Number(textarea.selectionStart) || 0;
            const end =
                Number(textarea.selectionEnd) || 0;

            if (
                shouldBlockProtectedEdit(
                    event.inputType || "",
                    start,
                    end,
                    textarea.value,
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showProtectedImageMessage();
            }
        },
    );

    textarea.addEventListener(
        "keydown",
        (event) => {
            if (bypassProtectedGuard > 0) {
                return;
            }

            const start =
                Number(textarea.selectionStart) || 0;
            const end =
                Number(textarea.selectionEnd) || 0;

            const ranges =
                getProtectedImageRanges(
                    textarea.value
                );

            if (
                ranges.length &&
                isEditingKey(event) &&
                protectedSelectionIntersects(
                    start,
                    end,
                    ranges,
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showProtectedImageMessage();
                return;
            }

            if (event.key === "Backspace") {
                const shouldBlock =
                    ranges.some(
                        (range) =>
                            start === range.start ||
                            (
                                start > range.start &&
                                start <= range.end
                            )
                    );

                if (shouldBlock) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    showProtectedImageMessage();
                    return;
                }
            }

            if (event.key === "Delete") {
                const shouldBlock =
                    ranges.some(
                        (range) =>
                            start >= range.start &&
                            start < range.end
                    );

                if (shouldBlock) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    showProtectedImageMessage();
                }
            }
        },
    );

    textarea.addEventListener(
        "cut",
        (event) => {
            if (bypassProtectedGuard > 0) {
                return;
            }

            if (
                isSelectionInsideProtectedLine(
                    textarea
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showProtectedImageMessage();
            }
        },
    );

    textarea.addEventListener(
        "paste",
        (event) => {
            if (bypassProtectedGuard > 0) {
                return;
            }

            if (
                isSelectionInsideProtectedLine(
                    textarea
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showProtectedImageMessage();
            }
        },
    );

    textarea.addEventListener(
        "drop",
        (event) => {
            if (bypassProtectedGuard > 0) {
                return;
            }

            if (
                isSelectionInsideProtectedLine(
                    textarea
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showProtectedImageMessage();
            }
        },
    );

    textarea.addEventListener(
        "input",
        (event) => {
            if (bypassProtectedGuard > 0) {
                return;
            }

            const previousSignature =
                getProtectedImageSignature(
                    protectedImageSnapshot.value
                );

            const currentSignature =
                getProtectedImageSignature(
                    textarea.value
                );

            if (
                previousSignature !==
                currentSignature
            ) {
                restoreProtectedImageSnapshot(
                    textarea
                );
                updateCounter();
                renderChapterImages();
                event.stopImmediatePropagation();
                showProtectedImageMessage();
                return;
            }

            syncProtectedImageSnapshot(
                textarea
            );
        },
    );
}

function shouldBlockProtectedEdit(
    inputType,
    start,
    end,
    value,
) {
    const ranges =
        getProtectedImageRanges(value);

    if (!ranges.length) {
        return false;
    }

    if (start !== end) {
        return protectedSelectionIntersects(
            start,
            end,
            ranges,
        );
    }

    if (
        inputType === "deleteContentBackward" ||
        inputType === "deleteWordBackward" ||
        inputType === "deleteSoftLineBackward" ||
        inputType === "deleteHardLineBackward"
    ) {
        return ranges.some(
            (range) =>
                start === range.start ||
                (
                    start > range.start &&
                    start <= range.end
                )
        );
    }

    if (
        inputType === "deleteContentForward" ||
        inputType === "deleteWordForward" ||
        inputType === "deleteSoftLineForward" ||
        inputType === "deleteHardLineForward"
    ) {
        return ranges.some(
            (range) =>
                start >= range.start &&
                start < range.end
        );
    }

    return ranges.some(
        (range) =>
            start >= range.start &&
            start < range.end
    );
}

function updateCounter() {
    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    const counter =
        document.querySelector(
            "#content-counter"
        );

    if (!textarea || !counter) return;

    const text = textarea.value;

    const length =
        text.length;

    const words =
        text.trim()
            ? text.trim().split(/\s+/u).filter(Boolean).length
            : 0;

    counter.textContent =
        `${length.toLocaleString("pt-BR")} ${
            length === 1
                ? "caractere"
                : "caracteres"
        } · ${words.toLocaleString("pt-BR")} ${
            words === 1
                ? "palavra"
                : "palavras"
        }`;
}

function setStatusUi(
    status,
) {
    const pill =
        document.querySelector(
            "#chapter-status-pill"
        );

    const saveState =
        document.querySelector(
            "#save-state"
        );

    const unpublish =
        document.querySelector(
            "#unpublish-button"
        );

    if (!pill || !saveState) return;

    pill.className =
        `status-pill ${status}`;

    pill.textContent =
        status === "published"
            ? "Publicado"
            : "Rascunho";

    saveState.textContent =
        status === "published"
            ? "Publicado"
            : "Rascunho";

    if (unpublish) {
        unpublish.hidden =
            status !== "published";
    }
}

async function save(
    status,
) {
    const message =
        document.querySelector(
            "#chapter-message"
        );

    showMessage(
        message,
        status === "published"
            ? "Publicando..."
            : "Salvando rascunho..."
    );

    try {
        const updated =
            await updateChapter(
                chapter.id,
                {
                    title:
                        document.querySelector(
                            "#chapter-title"
                        ).value,
                    content:
                        document.querySelector(
                            "#chapter-content"
                        ).value,
                    status,
                },
            );

        chapter = {
            ...chapter,
            ...updated,
        };

        setStatusUi(
            updated.status
        );

        showMessage(
            message,
            updated.status === "published"
                ? "Episódio publicado!"
                : "Rascunho salvo!",
            "success",
        );

        document.title =
            `${updated.title} | Histórias dos Crias`;

    } catch (error) {
        console.error(error);

        showMessage(
            message,
            error.message ||
                "Não foi possível salvar o episódio.",
            "error",
        );
    }
}


function rememberImageSelection() {
    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    if (!textarea) return;

    imageInsertSelection = {
        start:
            Number(textarea.selectionStart) || 0,
        end:
            Number(textarea.selectionEnd) || 0,
    };
}

function sanitizeImageAlt(value) {
    return String(value ?? "")
        .replaceAll("|", "—")
        .replaceAll("]]", "] ]")
        .trim()
        .slice(0, 180);
}

async function uploadChapterImageDirect(file) {
    if (!file) {
        throw new Error(
            "Selecione uma imagem para enviar."
        );
    }

    if (!(file instanceof File)) {
        throw new Error(
            "O arquivo selecionado é inválido."
        );
    }

    if (!file.type.startsWith("image/")) {
        throw new Error(
            "O arquivo selecionado não é uma imagem."
        );
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
        throw new Error(
            "A imagem não pode ultrapassar 5 MB."
        );
    }

    const safeName =
        file.name
            .replace(/[^a-zA-Z0-9._() -]/gu, "_")
            .replace(/\s+/gu, " ")
            .trim()
            .slice(0, 150) ||
        "imagem";

    const path =
        `chapters/${chapter.id}/${crypto.randomUUID()}-${safeName}`;

    const { data, error } =
        await supabase.storage
            .from("chapter-images")
            .upload(
                path,
                file,
                {
                    cacheControl: "3600",
                    contentType:
                        file.type ||
                        undefined,
                    upsert: false,
                }
            );

    if (error) {
        console.error(
            "Erro ao enviar imagem do capítulo:",
            error
        );

        throw new Error(
            error.message ||
            "Não foi possível enviar a imagem."
        );
    }

    return data;
}

function insertImageToken(token) {
    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    if (!textarea) return;

    const value = textarea.value;
    const start = Math.min(
        imageInsertSelection.start,
        value.length,
    );
    const end = Math.min(
        Math.max(imageInsertSelection.end, start),
        value.length,
    );

    const needsPrefix =
        start > 0 &&
        value[start - 1] !== "\n";

    const needsSuffix =
        end < value.length &&
        value[end] !== "\n";

    const insertion =
        `${needsPrefix ? "\n" : ""}${token}${needsSuffix ? "\n" : ""}`;

    bypassProtectedGuard += 1;

    try {
        textarea.value =
            value.slice(0, start) +
            insertion +
            value.slice(end);

        const cursor =
            start + insertion.length;

        textarea.focus();
        textarea.setSelectionRange(
            cursor,
            cursor,
        );

        textarea.dispatchEvent(
            new Event("input", {
                bubbles: true,
            })
        );
    } finally {
        bypassProtectedGuard -= 1;
    }

    syncProtectedImageSnapshot(
        textarea
    );
}


function parseChapterImageTokens(content) {
    const source = String(content ?? "");

    const regex =
        /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/gim;

    const images = [];

    for (const match of source.matchAll(regex)) {
        const path =
            String(match[1] ?? "").trim();

        const alt =
            String(match[2] ?? "").trim() ||
            "Imagem da cena";

        if (!path) {
            continue;
        }

        images.push({
            path,
            alt,
            internal:
                path.startsWith("chapters/") &&
                !/^https?:\/\//i.test(path),
        });
    }

    return images;
}

function removeChapterImageToken(
    content,
    targetPath,
) {
    const target =
        String(targetPath ?? "").trim();

    return String(content ?? "")
        .split(/\r?\n/u)
        .filter(
            (line) => {
                const match =
                    line.match(
                        /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/i
                    );

                if (!match) {
                    return true;
                }

                return (
                    String(
                        match[1] ?? ""
                    ).trim() !== target
                );
            }
        )
        .join("\n");
}

async function renderChapterImages() {
    const list =
        document.querySelector(
            "#chapter-images-list"
        );

    const count =
        document.querySelector(
            "#chapter-images-count"
        );

    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    if (!list || !count || !textarea) {
        return;
    }

    const images =
        parseChapterImageTokens(
            textarea.value
        );

    count.textContent =
        `${images.length.toLocaleString("pt-BR")} ${
            images.length === 1
                ? "imagem"
                : "imagens"
        }`;

    if (!images.length) {
        list.innerHTML = `
            <div class="chapter-image-manager-empty muted">
                Nenhuma imagem inserida neste episódio.
            </div>
        `;
        return;
    }

    list.innerHTML = `
        <div class="chapter-image-manager-loading muted">
            Carregando ${images.length === 1 ? "imagem" : "imagens"}...
        </div>
    `;

    const resolved =
        await Promise.all(
            images.map(
                async (image) => {
                    try {
                        const url =
                            image.internal
                                ? await getChapterImageUrl(
                                    image.path
                                )
                                : image.path;

                        return {
                            ...image,
                            url,
                            error: null,
                        };
                    } catch (error) {
                        return {
                            ...image,
                            url: null,
                            error,
                        };
                    }
                }
            )
        );

    list.innerHTML =
        resolved.map(
            (image, index) => {
                const visual =
                    image.url
                        ? `
                            <img
                                src="${escapeHtml(image.url)}"
                                alt="${escapeHtml(image.alt)}"
                                loading="lazy"
                            >
                        `
                        : `
                            <div class="chapter-image-manager-empty muted">
                                Não foi possível carregar esta imagem.
                            </div>
                        `;

                const origin =
                    image.internal
                        ? "Arquivo enviado ao Storage"
                        : "Link externo";

                return `
                    <article
                        class="chapter-image-card"
                        data-image-path="${escapeHtml(image.path)}"
                    >
                        <div class="chapter-image-card-visual">
                            ${visual}

                            <button
                                type="button"
                                class="chapter-image-delete"
                                data-delete-image="${escapeHtml(image.path)}"
                                aria-label="Excluir imagem"
                                title="Excluir imagem"
                            >
                                ×
                            </button>
                        </div>

                        <div class="chapter-image-card-info">
                            <strong>
                                ${escapeHtml(image.alt)}
                            </strong>

                            <span class="chapter-image-card-path">
                                ${escapeHtml(image.path)}
                            </span>

                            <span class="chapter-image-card-origin">
                                ${origin}
                                · imagem ${index + 1} de ${images.length}
                            </span>
                        </div>
                    </article>
                `;
            }
        ).join("");

    list
        .querySelectorAll(
            "[data-delete-image]"
        )
        .forEach(
            (button) => {
                button.addEventListener(
                    "click",
                    () => {
                        deleteChapterImage(
                            button.dataset.deleteImage || ""
                        );
                    }
                );
            }
        );
}

async function deleteChapterImage(path) {
    const value =
        String(path ?? "").trim();

    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    if (!value || !textarea) {
        return;
    }

    const image =
        parseChapterImageTokens(
            textarea.value
        ).find(
            (item) =>
                item.path === value
        );

    if (!image) {
        return;
    }

    openConfirmModal({
        eyebrow: "ILUSTRAÇÃO DE CENA",
        title: "Excluir imagem?",
        message:
            `Remover <strong>${escapeHtml(image.alt)}</strong>?`,
        details: `
            <p>
                A referência será removida do texto do episódio.
                ${
                    image.internal
                        ? "O arquivo enviado também será apagado do Storage."
                        : "O link externo será apenas removido do texto."
                }
            </p>

            <span>
                <strong>Esta ação é definitiva.</strong>
            </span>
        `,
        confirmLabel: "Excluir imagem",
        onConfirm: async () => {
            const message =
                document.querySelector(
                    "#chapter-message"
                );

            const nextContent =
                removeChapterImageToken(
                    textarea.value,
                    value
                );

            if (
                nextContent ===
                textarea.value
            ) {
                throw new Error(
                    "A referência dessa imagem não foi encontrada no texto."
                );
            }

            showMessage(
                message,
                "Removendo imagem..."
            );

            try {
                /*
                    Primeiro atualizamos o capítulo para remover
                    a referência. Assim o episódio não fica apontando
                    para um objeto que acabou de ser apagado.
                */
                const updated =
                    await updateChapter(
                        chapter.id,
                        {
                            title:
                                document.querySelector(
                                    "#chapter-title"
                                ).value,
                            content:
                                nextContent,
                            status:
                                chapter.status,
                        },
                    );

                chapter = {
                    ...chapter,
                    ...updated,
                };

                bypassProtectedGuard += 1;

                try {
                    textarea.value =
                        nextContent;

                    updateCounter();
                } finally {
                    bypassProtectedGuard -= 1;
                }

                syncProtectedImageSnapshot(
                    textarea
                );

                if (image.internal) {
                    await removeChapterImage(
                        image.path
                    );
                }

                showMessage(
                    message,
                    image.internal
                        ? "Imagem removida do episódio e do Storage."
                        : "Imagem removida do episódio.",
                    "success",
                );

                syncProtectedImageSnapshot();
                await renderChapterImages();
            } catch (error) {
                console.error(
                    "Erro ao remover imagem do episódio:",
                    error
                );

                showMessage(
                    message,
                    error.message ||
                        "Não foi possível remover a imagem.",
                    "error",
                );

                await renderChapterImages();
            }
        },
    });
}

function openImageInsertModal() {
    rememberImageSelection();

    const modal = openFormModal({
        title: "Inserir imagem",
        eyebrow: "ILUSTRAÇÃO DE CENA",
        width: "680px",
        html: `
            <label>
                Origem da imagem
                <select id="image-source-type">
                    <option value="upload">
                        Enviar arquivo do dispositivo
                    </option>
                    <option value="url">
                        Usar link externo
                    </option>
                </select>
            </label>

            <div id="image-upload-panel">
                <label>
                    Arquivo
                    <input
                        id="chapter-image-file"
                        type="file"
                        accept="image/*"
                    >
                </label>

                <p class="muted modal-help-text">
                    Formatos de imagem aceitos. Limite de 5 MB.
                </p>
            </div>

            <div id="image-url-panel" hidden>
                <label>
                    Link da imagem
                    <input
                        id="chapter-image-url"
                        type="url"
                        placeholder="https://exemplo.com/imagem.jpg"
                        autocomplete="off"
                    >
                </label>

                <p class="muted modal-help-text">
                    Prefira links HTTPS diretos para imagens.
                </p>
            </div>

            <label>
                Texto alternativo
                <input
                    id="chapter-image-alt"
                    maxlength="180"
                    placeholder="Ex.: O grupo diante da cidade abandonada"
                >
            </label>

            <p class="muted modal-help-text">
                A imagem será colocada em uma linha própria do episódio.
            </p>
        `,
        onSubmit: async (form) => {
            const sourceType =
                form.querySelector(
                    "#image-source-type"
                ).value;

            const alt =
                sanitizeImageAlt(
                    form.querySelector(
                        "#chapter-image-alt"
                    ).value,
                ) || "Imagem da cena";

            let source = "";

            if (sourceType === "upload") {
                const fileInput =
                    form.querySelector(
                        "#chapter-image-file"
                    );

                const file =
                    fileInput.files?.[0];

                const uploaded =
                    await uploadChapterImageDirect(
                        file,
                    );

                source = uploaded.path;
            } else {
                const rawUrl =
                    form.querySelector(
                        "#chapter-image-url"
                    ).value.trim();

                if (!rawUrl) {
                    throw new Error(
                        "Informe o link da imagem."
                    );
                }

                let parsed;

                try {
                    parsed = new URL(
                        rawUrl,
                        location.href,
                    );
                } catch {
                    throw new Error(
                        "O link informado não é válido."
                    );
                }

                if (
                    !/^https?:$/i.test(
                        parsed.protocol
                    )
                ) {
                    throw new Error(
                        "Use um link HTTP ou HTTPS."
                    );
                }

                source = parsed.href;
            }

            insertImageToken(
                `[[image:${source}|${alt}]]`
            );

            const message =
                document.querySelector(
                    "#chapter-message"
                );

            showMessage(
                message,
                sourceType === "upload"
                    ? "Imagem enviada e inserida no texto."
                    : "Imagem por link inserida no texto.",
                "success",
            );

            return true;
        },
    });

    const sourceType =
        modal.body.querySelector(
            "#image-source-type"
        );

    const uploadPanel =
        modal.body.querySelector(
            "#image-upload-panel"
        );

    const urlPanel =
        modal.body.querySelector(
            "#image-url-panel"
        );

    const syncPanels = () => {
        const isUpload =
            sourceType.value === "upload";

        uploadPanel.hidden = !isUpload;
        urlPanel.hidden = isUpload;
    };

    sourceType.addEventListener(
        "change",
        syncPanels,
    );

    syncPanels();
}

function bind() {
    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    bindProtectedImageEditing(
        textarea
    );

    textarea.addEventListener(
        "input",
        () => {
            updateCounter();
            renderChapterImages();

            clearTimeout(
                saveTimer
            );

            saveTimer =
                setTimeout(
                    async () => {
                        // Autosave apenas quando já é rascunho.
                        if (
                            chapter.status !==
                            "published"
                        ) {
                            await save(
                                "draft"
                            );
                        }
                    },
                    2500,
                );
        },
    );

    document.querySelector(
        "#insert-image-button"
    ).addEventListener(
        "click",
        openImageInsertModal,
    );

    document.querySelector(
        "#save-draft-button"
    ).addEventListener(
        "click",
        () => save("draft")
    );

    document.querySelector(
        "#publish-button"
    ).addEventListener(
        "click",
        async () => {
            const confirmed =
                confirm(
                    "Publicar este episódio para os leitores agora?"
                );

            if (!confirmed) {
                return;
            }

            await save(
                "published"
            );
        }
    );

    document.querySelector(
        "#unpublish-button"
    ).addEventListener(
        "click",
        async () => {
            await save(
                "draft"
            );
        }
    );

    document.querySelector(
        "#delete-chapter-button"
    ).addEventListener(
        "click",
        () => {
            openConfirmModal({
                eyebrow:
                    chapter.number === 0
                        ? "PILOTO"
                        : `EPISÓDIO ${chapter.number}`,
                title: "Excluir episódio?",
                message: `Excluir <strong>${escapeHtml(chapter.title)}</strong>?`,
                details: `
                    <p>
                        O conteúdo do episódio e as avaliações
                        vinculadas serão removidos.
                    </p>
                    <span><strong>Esta ação é definitiva.</strong></span>
                `,
                confirmLabel: "Excluir episódio",
                onConfirm: async () => {
                    await deleteChapter(
                        chapter.id
                    );

                    location.href =
                        `./story-editor.html?id=${storyId}`;
                },
            });
        },
    );
}

document.querySelector(
    "#logout-button"
).addEventListener(
    "click",
    async () => {
        try {
            await signOut();
        } finally {
            location.href =
                "./login.html";
        }
    }
);

async function init() {
    try {
        const writer =
            await getMyWriterAccount();

        if (!writer) {
            location.href =
                "./login.html";
            return;
        }

        writerName.textContent =
            writer.auth_user.email ||
            "Escritor";

        if (
            !Number.isInteger(chapterId) ||
            chapterId <= 0
        ) {
            throw new Error(
                "Episódio inválido."
            );
        }

        chapter =
            await getWriterChapter(
                chapterId
            );

        // Garante que a página nunca tente editar
        // um capítulo que o RLS não permitiu retornar.
        if (!chapter) {
            throw new Error(
                "Episódio não encontrado ou sem permissão."
            );
        }

        // storyId é usado somente para o caminho visual.
        // A autorização real vem do RLS no capítulo.
        render();
    } catch (error) {
        console.error(error);

        root.innerHTML = `
            <section class="empty-state">
                <span class="eyebrow">
                    EDITOR
                </span>

                <h1>
                    Não foi possível abrir o episódio
                </h1>

                <p class="muted">
                    ${escapeHtml(
                        error.message ||
                        "Verifique seu acesso."
                    )}
                </p>

                <a
                    class="primary-button"
                    href="./index.html"
                >
                    Voltar ao dashboard
                </a>
            </section>
        `;
    }
}

init();
