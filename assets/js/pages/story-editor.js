console.info("[Histórias dos Crias] story-editor-fixed carregado");

import { setupTheme } from "../core/theme.js";
import {
    escapeHtml,
    formatDate,
    showMessage,
    storyCoverSource,
} from "../core/utils.js";

import { signOut } from "../services/auth.service.js";
import {
    getMyWriterAccount,
} from "../services/writer.service.js";

import {
    getWriterStoryById,
    updateStory,
    deleteStory,
} from "../services/story.service.js";

import {
    getWriterSeasons,
    createSeason,
    updateSeason,
    deleteSeason,
} from "../services/season.service.js";

import {
    createChapter,
    deleteChapter,
} from "../services/chapter.service.js";

import {
    getStoryCoverUrl,
    uploadStoryCover,
    removeStoryCover,
} from "../services/storage.service.js";

import {
    openFormModal,
    openConfirmModal,
} from "../core/modal.js";

setupTheme();

const root =
    document.querySelector("#editor-root");

const writerName =
    document.querySelector("#writer-name");

const storyId =
    Number(
        new URLSearchParams(location.search)
            .get("id")
    );

let story = null;
let seasons = [];

function getCover(storyData) {
    return storyCoverSource(
        storyData,
        getStoryCoverUrl,
    );
}

function seasonHtml(season) {
    const chapters =
        season.chapters ?? [];

    return `
        <article
            class="editor-season-card"
            data-season-id="${season.id}"
        >
            <div class="section-heading">
                <div>
                    <span class="eyebrow">
                        TEMPORADA ${season.number}
                    </span>

                    <h3 class="editable-season-title">
                        ${escapeHtml(season.title)}
                    </h3>
                </div>

                <div class="main-nav">
                    <button
                        type="button"
                        class="secondary-button rename-season-button"
                    >
                        Renomear
                    </button>

                    <button
                        type="button"
                        class="danger-button delete-season-button"
                    >
                        Excluir
                    </button>

                    <button
                        type="button"
                        class="primary-button new-chapter-button"
                    >
                        + Novo episódio
                    </button>
                </div>
            </div>

            <div class="chapter-editor-list">
                ${
                    chapters.length
                        ? chapters.map(
                            (chapter) => `
                                <div class="chapter-editor-row-wrapper">
                                    <a
                                        class="chapter-editor-row"
                                        href="./chapter-editor.html?chapter=${chapter.id}&story=${story.id}"
                                    >
                                        <div>
                                            <span class="chapter-number">
                                                ${
                                                    chapter.number === 0
                                                        ? "PILOTO"
                                                        : `EP. ${chapter.number}`
                                                }
                                            </span>

                                            <strong>
                                                ${escapeHtml(
                                                    chapter.title
                                                )}
                                            </strong>
                                        </div>

                                        <span class="status-pill ${chapter.status}">
                                            ${
                                                chapter.status === "published"
                                                    ? "Publicado"
                                                    : "Rascunho"
                                            }
                                        </span>
                                    </a>

                                    <button
                                        type="button"
                                        class="danger-icon-button delete-chapter-button"
                                        data-chapter-id="${chapter.id}"
                                        data-chapter-number="${chapter.number}"
                                        data-chapter-title="${escapeHtml(chapter.title)}"
                                        aria-label="Excluir ${escapeHtml(chapter.title)}"
                                        title="Excluir episódio"
                                    >
                                        ×
                                    </button>
                                </div>
                            `
                        ).join("")
                        : `
                            <div class="empty-card">
                                Nenhum episódio nesta temporada ainda.
                            </div>
                        `
                }
            </div>
        </article>
    `;
}

function render() {
    const cover =
        getCover(story);

    root.innerHTML = `
        <div class="editor-topbar">
            <div>
                <a
                    class="text-link"
                    href="./index.html"
                >
                    ← Dashboard
                </a>

                <span class="eyebrow">
                    EDITOR DA OBRA
                </span>

                <h1>${escapeHtml(story.title)}</h1>

                <p class="muted">
                    Última atualização:
                    ${formatDate(story.updated_at)}
                </p>
            </div>

            <div class="main-nav">
                <a
                    class="secondary-button"
                    href="../historia.html?slug=${encodeURIComponent(story.slug)}"
                    target="_blank"
                    rel="noopener"
                >
                    Ver publicação
                </a>
            </div>
        </div>

        <section class="editor-grid">
            <form
                id="story-settings-form"
                class="editor-panel"
            >
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            INFORMAÇÕES
                        </span>

                        <h2>Configuração da obra</h2>
                    </div>
                </div>

                <label>
                    Nome da história
                    <input
                        id="story-title"
                        maxlength="160"
                        value="${escapeHtml(story.title)}"
                        required
                    >
                </label>

                <label>
                    Descrição
                    <textarea
                        id="story-description"
                        maxlength="1000"
                        rows="7"
                    >${escapeHtml(story.description || "")}</textarea>
                </label>

                <div class="cover-editor">
                    <div>
                        <span class="eyebrow">
                            CAPA
                        </span>

                        <h3>Imagem geral da obra</h3>

                        <p class="muted">
                            Escolha um link externo ou envie
                            uma imagem para o Storage.
                        </p>
                    </div>

                    <img
                        id="story-cover-preview"
                        class="editor-cover-preview"
                        src="${getCover(story)}"
                        alt=""
                    >

                    <label>
                        Origem da capa
                        <select id="cover-type">
                            <option
                                value="none"
                                ${story.cover_type === "none" ? "selected" : ""}
                            >
                                Sem imagem
                            </option>
                            <option
                                value="url"
                                ${story.cover_type === "url" ? "selected" : ""}
                            >
                                Link da internet
                            </option>
                            <option
                                value="upload"
                                ${story.cover_type === "upload" ? "selected" : ""}
                            >
                                Upload do dispositivo
                            </option>
                        </select>
                    </label>

                    <label
                        id="cover-url-group"
                        ${
                            story.cover_type === "url"
                                ? ""
                                : "hidden"
                        }
                    >
                        Link da imagem
                        <input
                            id="cover-url"
                            type="url"
                            placeholder="https://..."
                            value="${escapeHtml(story.cover_url || "")}"
                        >
                    </label>

                    <label
                        id="cover-file-group"
                        ${
                            story.cover_type === "upload"
                                ? ""
                                : "hidden"
                        }
                    >
                        Escolher imagem
                        <input
                            id="cover-file"
                            type="file"
                            accept="image/*"
                        >
                    </label>
                </div>

                <div class="editor-actions">
                    <button
                        class="primary-button"
                        type="submit"
                    >
                        Salvar informações
                    </button>

                    <p
                        id="story-settings-message"
                        class="form-message"
                        role="alert"
                        aria-live="polite"
                    ></p>
                </div>
            </form>

            <aside class="editor-panel">
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            ESTRUTURA
                        </span>

                        <h2>Temporadas e episódios</h2>
                    </div>

                    <button
                        id="new-season-button"
                        class="primary-button"
                        type="button"
                    >
                        + Temporada
                    </button>
                </div>

                <div
                    id="season-list"
                    class="editor-season-list"
                >
                    ${
                        seasons.length
                            ? seasons.map(seasonHtml).join("")
                            : `
                                <div class="empty-card">
                                    Nenhuma temporada criada.
                                </div>
                            `
                    }
                </div>

                <div class="editor-help">
                    <strong>Como funciona</strong>
                    <p>
                        Crie o episódio, escreva no editor e use
                        <b>Salvar rascunho</b> até ficar pronto.
                        Só <b>Publicar</b> faz o episódio aparecer
                        para os leitores.
                    </p>
                </div>
            </aside>
        </section>

        <section class="danger-zone">
            <div>
                <span class="eyebrow danger-eyebrow">
                    ZONA DE PERIGO
                </span>

                <h2>Excluir esta história</h2>

                <p>
                    A exclusão remove a obra e, em cascata,
                    suas temporadas, episódios e avaliações vinculadas.
                    Esta ação não pode ser desfeita.
                </p>
            </div>

            <button
                id="delete-story-button"
                type="button"
                class="danger-button"
            >
                Excluir história definitivamente
            </button>
        </section>
    `;

    bindStorySettings();
    bindSeasons();
    bindDeleteStory();

    // O botão é criado dentro do render(), portanto
    // o listener precisa ser registrado depois que o
    // elemento existir no DOM.
    const newSeasonButton =
        document.querySelector(
            "#new-season-button"
        );

    if (newSeasonButton) {
        newSeasonButton.addEventListener(
            "click",
            handleNewSeason
        );
    }
}

function bindStorySettings() {
    const form =
        document.querySelector(
            "#story-settings-form"
        );

    const message =
        document.querySelector(
            "#story-settings-message"
        );

    const coverType =
        document.querySelector(
            "#cover-type"
        );

    const urlGroup =
        document.querySelector(
            "#cover-url-group"
        );

    const fileGroup =
        document.querySelector(
            "#cover-file-group"
        );

    const preview =
        document.querySelector(
            "#story-cover-preview"
        );

    function updateCoverControls() {
        urlGroup.hidden =
            coverType.value !== "url";

        fileGroup.hidden =
            coverType.value !== "upload";
    }

    coverType.addEventListener(
        "change",
        updateCoverControls,
    );

    form.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            showMessage(
                message,
                "Salvando..."
            );

            try {
                const newType =
                    coverType.value;

                const title =
                    document.querySelector(
                        "#story-title"
                    ).value.trim();

                const description =
                    document.querySelector(
                        "#story-description"
                    ).value.trim();

                const url =
                    document.querySelector(
                        "#cover-url"
                    ).value.trim();

                const file =
                    document.querySelector(
                        "#cover-file"
                    ).files[0] || null;

                let coverPath =
                    story.cover_path;

                let coverUrl =
                    story.cover_url;

                if (newType === "none") {
                    coverPath = null;
                    coverUrl = null;

                    if (story.cover_path) {
                        try {
                            await removeStoryCover(
                                story.cover_path
                            );
                        } catch (cleanupError) {
                            console.warn(
                                "Não foi possível remover a capa anterior:",
                                cleanupError,
                            );
                        }
                    }
                } else if (newType === "url") {
                    if (!url) {
                        throw new Error(
                            "Informe o link da capa."
                        );
                    }

                    if (
                        !/^https?:\/\//i.test(
                            url
                        )
                    ) {
                        throw new Error(
                            "O link da capa precisa começar com http:// ou https://."
                        );
                    }

                    coverUrl = url;
                    coverPath = null;

                    if (story.cover_path) {
                        try {
                            await removeStoryCover(
                                story.cover_path
                            );
                        } catch (cleanupError) {
                            console.warn(
                                "Não foi possível remover a capa anterior:",
                                cleanupError,
                            );
                        }
                    }
                } else {
                    if (file) {
                        const uploaded =
                            await uploadStoryCover(
                                story.id,
                                file,
                            );

                        const oldPath =
                            story.cover_path;

                        coverPath =
                            uploaded.path;

                        coverUrl = null;

                        if (oldPath) {
                            try {
                                await removeStoryCover(
                                    oldPath
                                );
                            } catch (cleanupError) {
                                console.warn(
                                    "A nova capa foi salva, mas a antiga não pôde ser removida:",
                                    cleanupError,
                                );
                            }
                        }
                    } else if (
                        story.cover_type !== "upload" ||
                        !story.cover_path
                    ) {
                        throw new Error(
                            "Selecione uma imagem para o upload."
                        );
                    }

                    coverUrl = null;
                }

                const updated =
                    await updateStory(
                        story.id,
                        {
                            title,
                            description,
                            coverType: newType,
                            coverUrl,
                            coverPath,
                        },
                    );

                story = {
                    ...story,
                    ...updated,
                    updated_at:
                        updated.updated_at ||
                        story.updated_at,
                };

                preview.src =
                    getCover(story);

                showMessage(
                    message,
                    "Informações salvas!",
                    "success",
                );

                // Mantém o cabeçalho atualizado.
                const heading =
                    root.querySelector(
                        ".editor-topbar h1"
                    );

                if (heading) {
                    heading.textContent =
                        story.title;
                }
            } catch (error) {
                console.error(error);

                showMessage(
                    message,
                    error.message ||
                        "Não foi possível salvar a história.",
                    "error",
                );
            }
        },
    );

    // Envia preview imediato para URLs.
    document.querySelector(
        "#cover-url"
    ).addEventListener(
        "input",
        (event) => {
            if (
                coverType.value === "url" &&
                /^https?:\/\//i.test(
                    event.target.value
                )
            ) {
                preview.src =
                    event.target.value;
            }
        },
    );

    document.querySelector(
        "#cover-file"
    ).addEventListener(
        "change",
        (event) => {
            const file =
                event.target.files[0];

            if (!file) return;

            preview.src =
                URL.createObjectURL(file);
        },
    );
}

function bindSeasons() {
    document.querySelectorAll(
        ".rename-season-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                const card =
                    event.target.closest(
                        "[data-season-id]"
                    );

                const seasonId =
                    Number(
                        card.dataset.seasonId
                    );

                const season =
                    seasons.find(
                        (item) =>
                            item.id === seasonId
                    );

                if (!season) return;

                openFormModal({
                    eyebrow: `TEMPORADA ${season.number}`,
                    title: "Renomear temporada",
                    html: `
                        <div class="modal-context">
                            <span class="modal-context-icon">✦</span>
                            <div>
                                <strong>${escapeHtml(season.title)}</strong>
                                <span>O novo nome será aplicado imediatamente ao painel.</span>
                            </div>
                        </div>

                        <label>
                            Nome da temporada
                            <input
                                id="modal-season-title"
                                maxlength="120"
                                value="${escapeHtml(season.title)}"
                                required
                            >
                        </label>
                    `,
                    onSubmit: async (form) => {
                        const title =
                            form.querySelector(
                                "#modal-season-title"
                            ).value.trim();

                        await updateSeason(
                            seasonId,
                            title,
                        );

                        season.title = title;

                        render();
                    },
                });
            },
        );
    });


    document.querySelectorAll(
        ".delete-season-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                const card =
                    event.target.closest(
                        "[data-season-id]"
                    );

                const seasonId =
                    Number(card.dataset.seasonId);

                const season =
                    seasons.find(
                        (item) =>
                            item.id === seasonId
                    );

                if (!season) return;

                const chapterCount =
                    (season.chapters ?? []).length;

                openConfirmModal({
                    eyebrow: `TEMPORADA ${season.number}`,
                    title: "Excluir temporada?",
                    message: `Excluir <strong>${escapeHtml(season.title)}</strong>?`,
                    details: `
                        <strong>O que será removido:</strong>
                        <ul>
                            <li>a temporada inteira;</li>
                            <li>${chapterCount} ${chapterCount === 1 ? "episódio" : "episódios"};</li>
                            <li>avaliações vinculadas aos episódios.</li>
                        </ul>
                        <span>Esta ação é definitiva.</span>
                    `,
                    confirmLabel: "Excluir temporada",
                    onConfirm: async () => {
                        await deleteSeason(seasonId);

                        seasons = seasons.filter(
                            (item) =>
                                item.id !== seasonId
                        );

                        render();
                    },
                });
            },
        );
    });

    document.querySelectorAll(
        ".new-chapter-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                const card =
                    event.target.closest(
                        "[data-season-id]"
                    );

                const seasonId =
                    Number(
                        card.dataset.seasonId
                    );

                const season =
                    seasons.find(
                        (item) =>
                            item.id === seasonId
                    );

                if (!season) return;

                const usedNumbers =
                    new Set(
                        (season.chapters ?? [])
                            .map(
                                (item) =>
                                    Number(
                                        item.number
                                    )
                            )
                    );

                const suggested =
                    usedNumbers.size
                        ? Math.max(
                            ...usedNumbers
                        ) + 1
                        : 0;

                openFormModal({
                    eyebrow: `TEMPORADA ${season.number}`,
                    title: "Novo episódio",
                    html: `
                        <div class="modal-context modal-context-accent">
                            <span class="modal-context-icon">✎</span>
                            <div>
                                <strong>
                                    ${escapeHtml(season.title)}
                                </strong>
                                <span>
                                    O episódio será criado como rascunho.
                                    Você poderá escrever e publicar depois.
                                </span>
                            </div>
                        </div>

                        <div class="modal-two-columns">
                            <label>
                                Número
                                <input
                                    id="modal-chapter-number"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value="${suggested}"
                                    required
                                >
                                <small class="field-help">
                                    Use <b>0</b> para o piloto.
                                </small>
                            </label>

                            <label>
                                Título
                                <input
                                    id="modal-chapter-title"
                                    maxlength="200"
                                    placeholder="Título do episódio"
                                    required
                                >
                            </label>
                        </div>

                        <div class="modal-preview">
                            <span class="eyebrow">PRÉVIA</span>
                            <strong id="chapter-preview-title">
                                ${suggested === 0 ? "Piloto" : `Episódio ${suggested}`}
                            </strong>
                            <span id="chapter-preview-subtitle">
                                Seu novo episódio começará como rascunho.
                            </span>
                        </div>
                    `,
                    onSubmit: async (form, feedback) => {
                        const number =
                            Number(
                                form.querySelector(
                                    "#modal-chapter-number"
                                ).value
                            );

                        const title =
                            form.querySelector(
                                "#modal-chapter-title"
                            ).value.trim();

                        if (
                            !Number.isInteger(number) ||
                            number < 0
                        ) {
                            throw new Error(
                                "O número deve ser um inteiro igual ou maior que 0."
                            );
                        }

                        if (usedNumbers.has(number)) {
                            throw new Error(
                                `O episódio ${number} já existe nesta temporada.`
                            );
                        }

                        const chapter =
                            await createChapter({
                                seasonId,
                                number,
                                title,
                                content: "",
                                status: "draft",
                            });

                        season.chapters =
                            [
                                ...(season.chapters ?? []),
                                {
                                    ...chapter,
                                },
                            ].sort(
                                (a, b) =>
                                    a.number -
                                    b.number
                            );

                        // Redireciona para o editor imediatamente.
                        location.href =
                            `./chapter-editor.html?chapter=${chapter.id}&story=${story.id}`;
                    },
                });

                const numberInput =
                    document.querySelector(
                        "#modal-chapter-number"
                    );

                const previewTitle =
                    document.querySelector(
                        "#chapter-preview-title"
                    );

                numberInput?.addEventListener(
                    "input",
                    () => {
                        const value =
                            Number(
                                numberInput.value
                            );

                        previewTitle.textContent =
                            value === 0
                                ? "Piloto"
                                : Number.isInteger(value) &&
                                  value > 0
                                    ? `Episódio ${value}`
                                    : "Novo episódio";
                    },
                );
            },
        );
    });


    document.querySelectorAll(
        ".delete-chapter-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                const chapterId =
                    Number(
                        event.currentTarget.dataset.chapterId
                    );

                const chapterNumber =
                    Number(
                        event.currentTarget.dataset.chapterNumber
                    );

                const chapterTitle =
                    event.currentTarget.dataset.chapterTitle ||
                    "este episódio";

                const seasonCard =
                    event.target.closest(
                        "[data-season-id]"
                    );

                const seasonId =
                    Number(
                        seasonCard.dataset.seasonId
                    );

                const season =
                    seasons.find(
                        (item) =>
                            item.id === seasonId
                    );

                openConfirmModal({
                    eyebrow:
                        chapterNumber === 0
                            ? "PILOTO"
                            : `EPISÓDIO ${chapterNumber}`,
                    title: "Excluir episódio?",
                    message: `Excluir <strong>${escapeHtml(chapterTitle)}</strong>?`,
                    details: `
                        <p>
                            A exclusão remove o conteúdo do episódio
                            e suas avaliações vinculadas.
                        </p>
                        <span>Esta ação é definitiva.</span>
                    `,
                    confirmLabel: "Excluir episódio",
                    onConfirm: async () => {
                        await deleteChapter(
                            chapterId
                        );

                        if (season) {
                            season.chapters =
                                (
                                    season.chapters ?? []
                                ).filter(
                                    (chapter) =>
                                        chapter.id !==
                                        chapterId
                                );
                        }

                        render();
                    },
                });
            },
        );
    });

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

function bindDeleteStory() {
    const button =
        document.querySelector(
            "#delete-story-button"
        );

    if (!button) return;

    const seasonCount =
        seasons.length;

    const chapterCount =
        seasons.reduce(
            (total, season) =>
                total +
                (season.chapters ?? []).length,
            0,
        );

    button.addEventListener(
        "click",
        () => {
            openConfirmModal({
                eyebrow: "ZONA DE PERIGO",
                title: "Excluir história?",
                message: `Você está prestes a excluir <strong>${escapeHtml(story.title)}</strong>.`,
                details: `
                    <ul>
                        <li>${seasonCount} ${seasonCount === 1 ? "temporada" : "temporadas"};</li>
                        <li>${chapterCount} ${chapterCount === 1 ? "episódio" : "episódios"};</li>
                        <li>avaliações vinculadas à obra e aos episódios;</li>
                        <li>a capa enviada ao Storage, quando aplicável.</li>
                    </ul>
                    <span><strong>Essa ação é definitiva e não pode ser desfeita.</strong></span>
                `,
                confirmLabel:
                    "Excluir história definitivamente",
                onConfirm: async () => {
                    const coverPath =
                        story.cover_path;

                    await deleteStory(
                        story.id
                    );

                    if (coverPath) {
                        try {
                            await removeStoryCover(
                                coverPath
                            );
                        } catch (cleanupError) {
                            console.warn(
                                "História excluída, mas a capa não pôde ser removida do Storage:",
                                cleanupError,
                            );
                        }
                    }

                    location.href =
                        "./index.html";
                },
            });
        },
    );
}

function handleNewSeason() {
    const nextNumber =
        seasons.length
            ? Math.max(
                ...seasons.map(
                    (season) =>
                        Number(
                            season.number
                        )
                )
            ) + 1
            : 1;

    openFormModal({
        eyebrow: "ESTRUTURA DA OBRA",
        title: "Nova temporada",
        html: `
            <div class="modal-context">
                <span class="modal-context-icon">▦</span>
                <div>
                    <strong>
                        Temporada ${nextNumber}
                    </strong>
                    <span>
                        Você poderá criar episódios assim que a temporada existir.
                    </span>
                </div>
            </div>

            <label>
                Nome da temporada
                <input
                    id="modal-new-season-title"
                    maxlength="120"
                    value="Temporada ${nextNumber}"
                    required
                >
            </label>
        `,
        onSubmit: async (form) => {
            const title =
                form.querySelector(
                    "#modal-new-season-title"
                ).value.trim();

            await createSeason(
                story.id,
                nextNumber,
                title,
            );

            seasons =
                await getWriterSeasons(
                    story.id
                );

            render();
        },
    });
}

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
            !Number.isInteger(storyId) ||
            storyId <= 0
        ) {
            throw new Error(
                "História inválida."
            );
        }

        story =
            await getWriterStoryById(
                storyId
            );

        seasons =
            await getWriterSeasons(
                story.id
            );

        render();
    } catch (error) {
        console.error(error);

        root.innerHTML = `
            <section class="empty-state">
                <span class="eyebrow">EDITOR</span>
                <h1>Não foi possível abrir a história</h1>
                <p class="muted">
                    ${
                        escapeHtml(
                            error.message ||
                            "Verifique seu acesso."
                        )
                    }
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
