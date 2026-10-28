import { setupTheme } from "../core/theme.js?v=20261028-spoiler-news-images-1";
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
    scheduleChapterPublication,
    cancelChapterPublicationSchedule,
    deleteChapter,
} from "../services/chapter.service.js?v=20261028-spoiler-news-images-1";

import {
    getWriterStoryById,
} from "../services/story.service.js?v=20261027-scheduled-release-1";

import {
    initCriasPresence,
} from "../services/crias-presence.service.js?v=20261028-spoiler-news-images-1";

import {
    CRIAS_PRESENCE_LOGO_URL,
    getPresenceStoryCoverUrl,
    getPresenceChapterImageUrl,
} from "../services/crias-presence-images.service.js?v=20261028-spoiler-news-images-1";

import { supabase } from "../core/supabase.js";
import {
    getChapterImageUrl,
    removeChapterImage,
} from "../services/storage.service.js?v=20261028-spoiler-news-images-1";

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
let story = null;
let criasPresence = null;
let presenceTitleTimer = null;
let saveTimer = null;
let scheduleRefreshTimer = null;
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

        .chapter-image-spoiler-control {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-top: 5px;
            font-size: 0.88rem;
            cursor: pointer;
        }

        .chapter-image-spoiler-control input {
            width: auto;
            min-height: 0;
            flex: 0 0 auto;
        }

        .chapter-image-spoiler-note {
            margin: 4px 0 0;
            line-height: 1.5;
            font-size: 0.84rem;
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

let chapterPresenceUpdateSequence = 0;

async function updateChapterEditorPresence(titleOverride = null) {
    if (!criasPresence || !chapter) return;

    const sequence = ++chapterPresenceUpdateSequence;
    const storyTitle = String(story?.title ?? "").trim();
    const titleInput = document.querySelector("#chapter-title");
    const chapterTitle = String(titleOverride ?? titleInput?.value ?? chapter.title ?? "").trim() || "Episódio sem título";
    const contentInput = document.querySelector("#chapter-content");
    const content = contentInput ? contentInput.value : chapter.content;
    const chapterNumber = Number(chapter.number);
    const episodeLabel = chapterNumber === 0
        ? "Piloto"
        : Number.isFinite(chapterNumber) && chapterNumber > 0
            ? `Episódio ${chapterNumber}`
            : "Episódio";
    const context = storyTitle
        ? `${storyTitle} · ${episodeLabel}: ${chapterTitle}`
        : `${episodeLabel}: ${chapterTitle}`;

    const [storyCoverUrl, episodeImageUrl] = await Promise.all([
        getPresenceStoryCoverUrl(story),
        getPresenceChapterImageUrl(content, chapter),
    ]);
    // Evita que uma consulta de imagem iniciada antes de outra atualize a presença por último.
    if (sequence !== chapterPresenceUpdateSequence || !criasPresence) return;

    const primaryImageUrl = episodeImageUrl || storyCoverUrl || CRIAS_PRESENCE_LOGO_URL;
    criasPresence.update({
        details: "Editando um episódio",
        state: context,
        largeImageUrl: primaryImageUrl,
        largeImageText: episodeImageUrl ? chapterTitle : (storyTitle || "Universo dos Crias"),
        smallImageUrl: episodeImageUrl ? (storyCoverUrl || CRIAS_PRESENCE_LOGO_URL) : CRIAS_PRESENCE_LOGO_URL,
        smallImageText: episodeImageUrl ? (storyTitle || "Universo dos Crias") : "Universo dos Crias",
    });
}

function scheduleChapterPresenceTitleUpdate(value) {
    if (presenceTitleTimer) {
        clearTimeout(presenceTitleTimer);
    }

    // Evita enviar uma atualização RPC a cada tecla digitada.
    presenceTitleTimer = setTimeout(() => {
        presenceTitleTimer = null;
        updateChapterEditorPresence(value);
    }, 900);
}

function isChapterScheduled(chapterData = chapter) {
    return Boolean(
        chapterData &&
        chapterData.status !== "published" &&
        chapterData.scheduled_publish_at
    );
}

function chapterStatusLabel(chapterData = chapter) {
    if (chapterData?.status === "published") return "Publicado";
    if (isChapterScheduled(chapterData)) return "Estreia agendada";
    return "Rascunho";
}

function formatScheduleDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "data inválida";
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(date);
}

function dateToLocalInputValue(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function getScheduleInitialValue() {
    const existing = chapter?.scheduled_publish_at
        ? new Date(chapter.scheduled_publish_at)
        : null;
    if (existing && Number.isFinite(existing.getTime()) && existing.getTime() > Date.now()) {
        return dateToLocalInputValue(existing);
    }
    return dateToLocalInputValue(new Date(Date.now() + 60 * 60 * 1000));
}

function updateScheduledNote(scheduledPublishAt = chapter?.scheduled_publish_at) {
    const note = document.querySelector("#scheduled-publication-note");
    const dateNode = document.querySelector("#scheduled-publication-date");
    if (!note || !dateNode) return;
    const scheduled = chapter?.status !== "published" && Boolean(scheduledPublishAt);
    note.hidden = !scheduled;
    if (scheduled) dateNode.textContent = formatScheduleDate(scheduledPublishAt);
}

function startScheduledPublicationRefresh() {
    if (scheduleRefreshTimer) {
        clearTimeout(scheduleRefreshTimer);
        scheduleRefreshTimer = null;
    }
    if (!isChapterScheduled()) return;

    const scheduledTime = new Date(chapter.scheduled_publish_at).getTime();
    const untilDue = Number.isFinite(scheduledTime) ? scheduledTime - Date.now() : 0;
    const delay = Math.max(5000, Math.min(60000, untilDue + 1500));

    scheduleRefreshTimer = setTimeout(async () => {
        try {
            const previousSchedule = chapter?.scheduled_publish_at;
            const fresh = await getWriterChapter(chapter.id);
            chapter = { ...chapter, ...fresh };
            setStatusUi(chapter.status, chapter.scheduled_publish_at);
            if (previousSchedule && chapter.status === "published" && !chapter.scheduled_publish_at) {
                showMessage(
                    document.querySelector("#chapter-message"),
                    "A estreia foi publicada automaticamente pelo servidor.",
                    "success",
                );
            }
        } catch (error) {
            console.warn("Não foi possível atualizar o estado da estreia agendada:", error);
        }
        startScheduledPublicationRefresh();
    }, delay);
}

function openSchedulePublicationModal() {
    if (chapter?.status === "published") {
        throw new Error("Volte o episódio para rascunho antes de agendar uma nova estreia.");
    }

    const initialValue = getScheduleInitialValue();
    const minValue = dateToLocalInputValue(new Date(Date.now() + 60 * 1000));

    const modal = openFormModal({
        eyebrow: chapter.number === 0 ? "PILOTO" : `EPISÓDIO ${chapter.number}`,
        title: isChapterScheduled() ? "Alterar estreia" : "Agendar estreia",
        width: "600px",
        html: `
            <div class="modal-context modal-context-accent">
                <span class="modal-context-icon">◷</span>
                <div>
                    <strong>Publicação automática</strong>
                    <span>O episódio continuará como rascunho até o horário escolhido. O servidor verificará os agendamentos a cada minuto.</span>
                </div>
            </div>
            <label>
                Data e horário de estreia
                <input id="scheduled-publication-input" type="datetime-local" min="${minValue}" value="${initialValue}" required>
                <small class="field-help">O horário usa o fuso local deste dispositivo: ${escapeHtml(Intl.DateTimeFormat().resolvedOptions().timeZone || "fuso local")}.</small>
            </label>
            <p class="muted">A estreia pode ocorrer até aproximadamente um minuto depois do horário escolhido, conforme o ciclo do agendador.</p>
        `,
        onSubmit: async (form) => {
            const localValue = form.querySelector("#scheduled-publication-input")?.value;
            if (!localValue) throw new Error("Escolha a data e o horário da estreia.");
            const scheduledDate = new Date(localValue);
            if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
                throw new Error("Escolha uma data e um horário futuros.");
            }

            const updated = await scheduleChapterPublication(chapter.id, {
                title: document.querySelector("#chapter-title").value,
                content: document.querySelector("#chapter-content").value,
                scheduledPublishAt: scheduledDate.toISOString(),
            });

            chapter = { ...chapter, ...updated };
            if (presenceTitleTimer) {
                clearTimeout(presenceTitleTimer);
                presenceTitleTimer = null;
            }
            updateChapterEditorPresence(updated.title);
            setStatusUi(chapter.status, chapter.scheduled_publish_at);
            showMessage(
                document.querySelector("#chapter-message"),
                `Estreia agendada para ${formatScheduleDate(chapter.scheduled_publish_at)}.`,
                "success",
            );
            startScheduledPublicationRefresh();
        },
    });
    return modal;
}

function confirmCancelSchedule() {
    if (!isChapterScheduled()) return;
    openConfirmModal({
        eyebrow: "ESTREIA AGENDADA",
        title: "Cancelar agendamento?",
        message: `Cancelar a estreia programada de <strong>${escapeHtml(chapter.title)}</strong>?`,
        details: `<p>O episódio continuará salvo como rascunho e não será publicado automaticamente.</p>`,
        confirmLabel: "Cancelar estreia",
        danger: true,
        onConfirm: async () => {
            const updated = await cancelChapterPublicationSchedule(chapter.id, {
                title: document.querySelector("#chapter-title").value,
                content: document.querySelector("#chapter-content").value,
            });
            chapter = { ...chapter, ...updated };
            setStatusUi(chapter.status, chapter.scheduled_publish_at);
            showMessage(
                document.querySelector("#chapter-message"),
                "Estreia cancelada. O episódio continua como rascunho.",
                "success",
            );
            startScheduledPublicationRefresh();
        },
    });
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
                        ${chapterStatusLabel(chapter)}
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
                        class="status-pill ${isChapterScheduled(chapter) ? "scheduled" : chapter.status}"
                        id="chapter-status-pill"
                    >
                        ${chapterStatusLabel(chapter)}
                    </span>
                </div>

                <div class="chapter-scheduled-note" id="scheduled-publication-note" ${isChapterScheduled(chapter) ? "" : "hidden"}>
                    <span class="eyebrow">ESTREIA AGENDADA</span>
                    <strong id="scheduled-publication-date">${escapeHtml(formatScheduleDate(chapter.scheduled_publish_at))}</strong>
                    <p>O servidor publicará este episódio automaticamente no horário programado. Até lá, ele continua indisponível para leitores.</p>
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
                    Publicar episódio agora
                </button>

                <button
                    id="schedule-publication-button"
                    class="secondary-button"
                    type="button"
                    ${chapter.status === "published" ? "hidden" : ""}
                >
                    ${isChapterScheduled(chapter) ? "Alterar estreia" : "Agendar estreia"}
                </button>

                <button
                    id="cancel-schedule-button"
                    class="secondary-button"
                    type="button"
                    ${isChapterScheduled(chapter) ? "" : "hidden"}
                >
                    Cancelar estreia
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
    scheduledPublishAt = chapter?.scheduled_publish_at,
) {
    const pill = document.querySelector("#chapter-status-pill");
    const saveState = document.querySelector("#save-state");
    const unpublish = document.querySelector("#unpublish-button");
    const scheduleButton = document.querySelector("#schedule-publication-button");
    const cancelScheduleButton = document.querySelector("#cancel-schedule-button");

    if (!pill || !saveState) return;

    const scheduled = status !== "published" && Boolean(scheduledPublishAt);
    const label = status === "published" ? "Publicado" : scheduled ? "Estreia agendada" : "Rascunho";
    pill.className = `status-pill ${scheduled ? "scheduled" : status}`;
    pill.textContent = label;
    saveState.textContent = label;

    if (unpublish) unpublish.hidden = status !== "published";
    if (scheduleButton) {
        scheduleButton.hidden = status === "published";
        scheduleButton.textContent = scheduled ? "Alterar estreia" : "Agendar estreia";
    }
    if (cancelScheduleButton) cancelScheduleButton.hidden = !scheduled;
    updateScheduledNote(scheduledPublishAt);
}

async function save(status) {
    const message =
        document.querySelector(
            "#chapter-message"
        );

    const scheduledBeforeSave = chapter.scheduled_publish_at;
    // Durante um agendamento, salvar o conteúdo não deve forçar status=draft:
    // o Cron pode ter publicado o episódio entre dois autosaves.
    const effectiveStatus = status === "draft" && scheduledBeforeSave
        ? undefined
        : status;

    showMessage(
        message,
        effectiveStatus === "published"
            ? "Publicando..."
            : "Salvando alterações..."
    );

    try {
        const previousStatus = chapter.status;
        const updated =
            await updateChapter(
                chapter.id,
                {
                    title: document.querySelector("#chapter-title").value,
                    content: document.querySelector("#chapter-content").value,
                    status: effectiveStatus,
                },
                {
                    fetchSeasonStatus: Boolean(effectiveStatus && chapter.status !== effectiveStatus),
                },
            );

        chapter = {
            ...chapter,
            ...updated,
        };

        if (presenceTitleTimer) {
            clearTimeout(presenceTitleTimer);
            presenceTitleTimer = null;
        }

        updateChapterEditorPresence(updated.title);

        setStatusUi(
            updated.status,
            updated.scheduled_publish_at,
        );
        startScheduledPublicationRefresh();

        let successMessage = updated.status === "published"
            ? (previousStatus === "published"
                ? "Alterações do episódio publicadas."
                : "Episódio publicado!")
            : updated.scheduled_publish_at
                ? `Alterações salvas. Estreia agendada para ${formatScheduleDate(updated.scheduled_publish_at)}.`
                : (previousStatus === "published"
                    ? "Episódio voltou para rascunho."
                    : "Rascunho salvo!");

        // Só anunciamos a mudança automática da temporada quando o status do episódio mudou.
        if (previousStatus !== updated.status) {
            if (
                updated.status === "published" &&
                updated.seasonStatus === "published"
            ) {
                successMessage = "Episódio publicado! A temporada foi publicada automaticamente.";
            } else if (
                updated.status === "draft" &&
                updated.seasonStatus === "published"
            ) {
                successMessage = "Episódio voltou para rascunho. A temporada continua publicada porque ainda possui outros episódios publicados.";
            } else if (
                updated.status === "draft" &&
                updated.seasonStatus === "draft"
            ) {
                successMessage = "Episódio voltou para rascunho. A temporada também voltou para rascunho automaticamente.";
            }
        }

        showMessage(
            message,
            successMessage,
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


function parseImageMetadata(rawMetadata) {
    const fields = String(rawMetadata ?? "").split("|");
    return {
        alt: String(fields[0] ?? "Imagem da cena").trim() || "Imagem da cena",
        spoiler: fields.slice(1).some((value) => value.trim().toLowerCase() === "spoiler"),
    };
}

function parseChapterImageTokens(content) {
    const source = String(content ?? "").replaceAll("\r\n", "\n");
    const lines = source.split("\n");
    const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);
    const images = [];
    const regex = /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/i;

    lines.forEach((line, lineIndex) => {
        const match = line.match(regex);
        if (!match) return;

        const path = String(match[1] ?? "").trim();
        if (!path) return;

        const metadata = parseImageMetadata(match[2]);
        images.push({
            path,
            alt: metadata.alt,
            spoiler: metadata.spoiler,
            // A primeira linha não vazia só é a capa quando ela própria é uma imagem.
            isCover: lineIndex === firstNonEmptyLineIndex,
            internal: path.startsWith("chapters/") && !/^https?:\/\//i.test(path),
        });
    });

    return images;
}

function updateChapterImageSpoiler(path, enabled) {
    const textarea = document.querySelector("#chapter-content");
    if (!textarea) return;

    const source = String(textarea.value ?? "").replaceAll("\r\n", "\n");
    const lines = source.split("\n");
    const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);
    const regex = /^(\s*)\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\](\s*)$/i;
    const lineIndex = lines.findIndex((line) => {
        const match = line.match(regex);
        return match && String(match[2] ?? "").trim() === String(path ?? "").trim();
    });

    if (lineIndex < 0) return;
    if (lineIndex === firstNonEmptyLineIndex) {
        showMessage(
            document.querySelector("#chapter-message"),
            "A imagem da primeira linha é a capa do episódio e não pode ser marcada como spoiler.",
            "error",
        );
        renderChapterImages();
        return;
    }

    const match = lines[lineIndex].match(regex);
    if (!match) return;

    const metadata = parseImageMetadata(match[3]);
    const alt = sanitizeImageAlt(metadata.alt) || "Imagem da cena";
    lines[lineIndex] = `${match[1]}[[image:${String(path).trim()}|${alt}${enabled ? "|spoiler" : ""}]]${match[4]}`;

    bypassProtectedGuard += 1;
    try {
        textarea.value = lines.join("\n");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } finally {
        bypassProtectedGuard -= 1;
    }
    syncProtectedImageSnapshot(textarea);

    showMessage(
        document.querySelector("#chapter-message"),
        `Spoiler ${enabled ? "ativado" : "desativado"}. Salve o episódio para confirmar a alteração.`,
        "success",
    );
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
                            ${image.isCover ? `
                                <p class="chapter-image-spoiler-note muted">
                                    Esta é a capa do episódio. A opção de spoiler não se aplica a ela.
                                </p>
                            ` : `
                                <label class="chapter-image-spoiler-control">
                                    <input
                                        type="checkbox"
                                        data-toggle-image-spoiler="${escapeHtml(image.path)}"
                                        ${image.spoiler ? "checked" : ""}
                                    >
                                    Marcar como spoiler
                                </label>
                            `}
                        </div>
                    </article>
                `;
            }
        ).join("");

    list.querySelectorAll("[data-toggle-image-spoiler]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            updateChapterImageSpoiler(
                checkbox.dataset.toggleImageSpoiler || "",
                checkbox.checked,
            );
        });
    });

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

    const titleInput =
        document.querySelector(
            "#chapter-title"
        );

    titleInput?.addEventListener("input", () => {
        scheduleChapterPresenceTitleUpdate(titleInput.value);
    });

    bindProtectedImageEditing(
        textarea
    );

    textarea.addEventListener(
        "input",
        () => {
            updateCounter();
            renderChapterImages();
            scheduleChapterPresenceTitleUpdate();

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
                                isChapterScheduled() ? undefined : "draft"
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
        "#schedule-publication-button"
    ).addEventListener(
        "click",
        () => {
            try {
                openSchedulePublicationModal();
            } catch (error) {
                showMessage(document.querySelector("#chapter-message"), error.message, "error");
            }
        },
    );

    document.querySelector(
        "#cancel-schedule-button"
    ).addEventListener(
        "click",
        confirmCancelSchedule,
    );

    document.querySelector(
        "#publish-button"
    ).addEventListener(
        "click",
        async () => {
            const confirmed =
                confirm(
                    "Publicar este episódio para os leitores agora? O agendamento existente será removido."
                );

            if (!confirmed) {
                return;
            }

            await save("published");
        }
    );

    document.querySelector(
        "#unpublish-button"
    ).addEventListener(
        "click",
        async () => {
            await save("draft");
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

window.addEventListener("beforeunload", () => {
    if (scheduleRefreshTimer) clearTimeout(scheduleRefreshTimer);
    if (saveTimer) clearTimeout(saveTimer);
    if (presenceTitleTimer) clearTimeout(presenceTitleTimer);
});

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

        // O título da história é usado apenas para descrever a atividade.
        // Se a consulta falhar, o editor continua funcionando normalmente.
        if (Number.isInteger(storyId) && storyId > 0) {
            try {
                story = await getWriterStoryById(storyId);
            } catch (storyError) {
                console.warn(
                    "Não foi possível carregar o título da história para a presença:",
                    storyError,
                );
            }
        }

        // Inicializa a presença somente depois de validar o escritor
        // e carregar o episódio autorizado.
        criasPresence = initCriasPresence({
            details: "Editando um episódio",
            state: "Carregando episódio...",
        });

        updateChapterEditorPresence();

        // storyId é usado somente para o caminho visual.
        // A autorização real vem do RLS no capítulo.
        render();
        startScheduledPublicationRefresh();
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
