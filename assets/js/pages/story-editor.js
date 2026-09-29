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
} from "../services/story.service.js";

import {
    getWriterSeasons,
    createSeason,
    updateSeason,
} from "../services/season.service.js";

import {
    createChapter,
} from "../services/chapter.service.js";

import {
    getStoryCoverUrl,
    uploadStoryCover,
    removeStoryCover,
} from "../services/storage.service.js";

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
    `;

    bindStorySettings();
    bindSeasons();

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
            async (event) => {
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
                            item.id ===
                            seasonId
                    );

                const nextTitle =
                    prompt(
                        "Novo nome da temporada:",
                        season?.title || ""
                    );

                if (
                    nextTitle === null
                ) {
                    return;
                }

                try {
                    await updateSeason(
                        seasonId,
                        nextTitle,
                    );

                    season.title =
                        nextTitle.trim();

                    render();
                } catch (error) {
                    console.error(error);
                    alert(
                        error.message ||
                            "Não foi possível renomear a temporada."
                    );
                }
            }
        );
    });

    document.querySelectorAll(
        ".new-chapter-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            async (event) => {
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
                            item.id ===
                            seasonId
                    );

                const chapterNumbers =
                    (season?.chapters ?? [])
                        .map(
                            (item) =>
                                Number(
                                    item.number
                                )
                        );

                const suggested =
                    chapterNumbers.length
                        ? Math.max(
                            ...chapterNumbers
                        ) + 1
                        : 0;

                const numberText =
                    prompt(
                        `Número do episódio (0 para piloto):`,
                        String(suggested),
                    );

                if (
                    numberText === null
                ) {
                    return;
                }

                const number =
                    Number(
                        numberText
                    );

                const title =
                    prompt(
                        "Título do episódio:"
                    );

                if (
                    title === null
                ) {
                    return;
                }

                try {
                    const chapter =
                        await createChapter({
                            seasonId,
                            number,
                            title,
                            content: "",
                            status: "draft",
                        });

                    location.href =
                        `./chapter-editor.html?chapter=${chapter.id}&story=${story.id}`;
                } catch (error) {
                    console.error(error);
                    alert(
                        error.message ||
                            "Não foi possível criar o episódio."
                    );
                }
            }
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

async function handleNewSeason() {
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

    const title =
        prompt(
            "Nome da temporada:",
            `Temporada ${nextNumber}`
        );

    if (title === null) {
        return;
    }

    try {
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
    } catch (error) {
        console.error(error);
        alert(
            error.message ||
                "Não foi possível criar a temporada."
        );
    }
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
