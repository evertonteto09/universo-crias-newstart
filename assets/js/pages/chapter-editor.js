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

import {
    openConfirmModal,
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

function render() {
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
                            0 caracteres
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
            </div>

            <textarea
                id="chapter-content"
                class="chapter-content-editor"
                spellcheck="true"
                placeholder="Escreva seu episódio aqui..."
            >${escapeHtml(
                chapter.content || ""
            )}</textarea>

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
            </aside>
        </section>
    `;

    updateCounter();
    bind();
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

    const length =
        textarea.value.length;

    counter.textContent =
        `${length.toLocaleString("pt-BR")} ${
            length === 1
                ? "caractere"
                : "caracteres"
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

function bind() {
    const textarea =
        document.querySelector(
            "#chapter-content"
        );

    textarea.addEventListener(
        "input",
        () => {
            updateCounter();

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
