import { setupTheme } from "../core/theme.js?v=20261028-crias-presence-final-1";
import {
    escapeHtml,
    formatDate,
    showMessage,
    storyCoverSource,
} from "../core/utils.js";
import {
    renderStoryGenreChoices,
    readSelectedStoryGenres,
} from "../core/story-genres.js?v=20261028-story-genres-1";

import { signOut } from "../services/auth.service.js";
import {
    getMyWriterAccount,
} from "../services/writer.service.js?v=20261027-coauthor-2";
import {
    getStoryCollaborators,
    isCurrentUserStoryCollaborator,
    addStoryCollaborator,
    removeStoryCollaborator,
} from "../services/story-collaboration.service.js?v=20261027-coauthor-2";

import {
    getWriterStoryById,
    updateStory,
    updateStoryStatus,
    deleteStory,
} from "../services/story.service.js?v=20261028-story-genres-1";

import {
    getWriterSeasons,
    createSeason,
    updateSeason,
    deleteSeason,
} from "../services/season.service.js?v=20261027-scheduled-release-1";

import {
    createChapter,
    deleteChapter,
} from "../services/chapter.service.js?v=20261028-crias-presence-final-1";

import {
    getStoryCoverUrl,
    uploadStoryCover,
    removeStoryCover,
    downloadStoryCover,
    restoreStoryCover,
    getStoryNewsImageUrl,
    uploadStoryNewsImage,
    extractStoryNewsImagePaths,
    removeStoryNewsImage,
} from "../services/storage.service.js?v=20261028-spoiler-news-images-1";

import {
    getWriterStoryNews,
    createStoryNews,
    updateStoryNews,
    deleteStoryNews,
} from "../services/news.service.js";

import {
    openFormModal,
    openConfirmModal,
} from "../core/modal.js";

import {
    initCriasPresence,
} from "../services/crias-presence.service.js?v=20261028-crias-presence-final-1";

import {
    CRIAS_PRESENCE_LOGO_URL,
    getPresenceStoryCoverUrl,
} from "../services/crias-presence-images.service.js?v=20261028-crias-presence-final-1";

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
let news = [];
let criasPresence = null;
let isPrimaryAuthor = false;
let collaborators = [];
let collaboratorsLoadError = null;
let collaboratorFeedback = null;
let protectedNewsImageState = null;

async function getCover(storyData) {
    return storyCoverSource(
        storyData,
        getStoryCoverUrl,
    );
}

async function updateStoryEditorPresence() {
    if (!story) return;
    const coverUrl = await getPresenceStoryCoverUrl(story);
    const activity = {
        details: "Editando uma história",
        state: story.title || "Editor da história",
        pageContext: "writer",
        largeImageUrl: coverUrl || CRIAS_PRESENCE_LOGO_URL,
        largeImageText: story.title || "Universo dos Crias",
        smallImageUrl: CRIAS_PRESENCE_LOGO_URL,
        smallImageText: "Universo dos Crias",
    };

    if (!criasPresence) {
        criasPresence = initCriasPresence(activity);
    } else {
        criasPresence.update(activity);
    }
}

function chapterStatusMarkup(chapter) {
    const isScheduled = chapter.status !== "published" && Boolean(chapter.scheduled_publish_at);
    if (isScheduled) {
        const dateLabel = formatDate(chapter.scheduled_publish_at);
        return `<span class="chapter-status-wrap"><span class="status-pill scheduled" title="Estreia prevista para ${escapeHtml(dateLabel)}">Estreia agendada</span><small class="scheduled-time-hint">Prevista para ${escapeHtml(dateLabel)}</small></span>`;
    }

    return `<span class="status-pill ${chapter.status === "published" ? "published" : "draft"}">${chapter.status === "published" ? "Publicado" : "Rascunho"}</span>`;
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
                    <span class="status-pill season-status-pill ${season.status === "published" ? "published" : "draft"}" data-season-status-pill>
                        ${season.status === "published" ? "Publicada" : "Rascunho"}
                    </span>
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

                                        ${chapterStatusMarkup(chapter)}
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


function newsHtml(item) {
    const title =
        String(item.title ?? "").trim() ||
        "Sem título";

    const content = String(item.content ?? "").trim().replace(
        /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/gim,
        (_token, source, rawMetadata) => {
            const metadata = String(rawMetadata ?? "").split("|");
            const alt = String(metadata[0] ?? "Imagem").trim() || "Imagem";
            const spoiler = metadata.slice(1).some((part) => part.trim().toLowerCase() === "spoiler");
            return `[🖼️ ${alt}${spoiler ? " · spoiler" : ""}]`;
        },
    );

    return `
        <article
            class="story-news-card"
            data-news-id="${Number(item.id)}"
        >
            <div class="story-news-card-main">
                <div class="story-news-meta">
                    <span class="eyebrow">
                        NOTÍCIA DA OBRA
                    </span>

                    <span class="story-news-date">
                        ${formatDate(item.updated_at || item.created_at)}
                    </span>
                </div>

                <h3>
                    ${escapeHtml(title)}
                </h3>

                <p class="story-news-content">${escapeHtml(content.trim())}</p>
            </div>

            <div class="story-news-actions">
                <button
                    type="button"
                    class="secondary-button edit-news-button"
                >
                    Editar
                </button>

                <button
                    type="button"
                    class="danger-icon-button delete-news-button"
                    aria-label="Excluir notícia ${escapeHtml(title)}"
                    title="Excluir notícia"
                >
                    ×
                </button>
            </div>
        </article>
    `;
}


function renderNewsSection() {
    const list =
        news.length
            ? news.map(newsHtml).join("")
            : `
                <article class="empty-card">
                    Essa história ainda não possui notícias.
                    Publique uma novidade para que os leitores
                    saibam o que está acontecendo com a obra.
                </article>
            `;

    return `
        <section class="editor-panel story-news-editor-section">
            <div class="section-heading">
                <div>
                    <span class="eyebrow">
                        ATUALIZAÇÕES
                    </span>

                    <h2>Notícias da história</h2>
                </div>

                <button
                    id="new-news-button"
                    class="primary-button"
                    type="button"
                >
                    + Nova notícia
                </button>
            </div>

            <p class="muted story-news-help">
                Publique novidades, avisos, pausas ou informações
                sobre esta obra. A notícia fica disponível para os
                leitores assim que for publicada.
            </p>

            <div class="story-news-list">
                ${list}
            </div>
        </section>
    `;
}

function renderCollaborationSection() {
    const mainAuthorName =
        story.writers?.name || story.writers?.username || `Escritor #${story.writer_id}`;
    const mainAuthorUsername = story.writers?.username
        ? `@${story.writers.username}`
        : "";

    const collaboratorsList = collaborators.length
        ? collaborators.map((entry) => {
            const name = entry.writers?.name || entry.writers?.username || `Escritor #${entry.writer_id}`;
            const username = entry.writers?.username ? `@${entry.writers.username}` : "";
            return `
                <article class="collaborator-row" data-collaborator-row="${Number(entry.writer_id)}">
                    <div class="collaborator-identity">
                        <strong>${escapeHtml(name)}</strong>
                        <span class="collaborator-handle">${escapeHtml(username || "Escritor vinculado")}</span>
                    </div>
                    <div class="collaborator-row-actions">
                        <span class="collaboration-role-pill">Coautor</span>
                        ${isPrimaryAuthor ? `
                            <button
                                type="button"
                                class="danger-button collaborator-remove-button"
                                data-remove-collaborator="${Number(entry.writer_id)}"
                                data-collaborator-name="${escapeHtml(name)}"
                            >Remover</button>
                        ` : ""}
                    </div>
                </article>
            `;
        }).join("")
        : `
            <article class="empty-card collaborator-empty-card">
                Ainda não há coautores vinculados a esta história.
            </article>
        `;

    const feedback = collaboratorFeedback
        ? `<p class="form-message ${collaboratorFeedback.type === "error" ? "error" : collaboratorFeedback.type === "warning" ? "warning" : "success"}" role="status" aria-live="polite">${escapeHtml(collaboratorFeedback.message)}</p>`
        : "";

    const loadError = collaboratorsLoadError
        ? `<p class="form-message error" role="alert">Não foi possível carregar a lista de coautores: ${escapeHtml(collaboratorsLoadError)}. Confira se a migração SQL de coautoria foi aplicada.</p>`
        : "";

    return `
        <section id="story-collaboration-container" class="editor-panel story-collaboration-panel">
            <div class="section-heading story-collaboration-heading">
                <div>
                    <span class="eyebrow">AUTORIA</span>
                    <h2>Coautoria e créditos</h2>
                    <p class="muted">
                        Compartilhe o acesso de edição com outros escritores. Os nomes dos participantes aparecem nos créditos públicos da obra.
                    </p>
                </div>
                <span class="collaboration-role-pill ${isPrimaryAuthor ? "is-owner" : ""}">${isPrimaryAuthor ? "Autoria principal" : "Coautor"}</span>
            </div>

            ${loadError}

            <div class="collaborator-list">
                <article class="collaborator-row collaborator-row-owner">
                    <div class="collaborator-identity">
                        <strong>${escapeHtml(mainAuthorName)}</strong>
                        <span class="collaborator-handle">${escapeHtml(mainAuthorUsername || "Responsável pela obra")}</span>
                    </div>
                    <span class="collaboration-role-pill is-owner">Autor principal</span>
                </article>
                ${collaboratorsList}
            </div>

            ${isPrimaryAuthor ? `
                <form id="add-story-collaborator-form" class="collaborator-add-form">
                    <label for="story-collaborator-username">
                        Adicionar escritor por nome de usuário
                        <input
                            id="story-collaborator-username"
                            name="username"
                            type="text"
                            maxlength="80"
                            placeholder="@nome_de_usuario"
                            autocomplete="off"
                            required
                        >
                    </label>
                    <p class="muted collaborator-form-help">
                        A pessoa precisa ter um cadastro de escritor ativo no Universo dos Crias. Informe o username do escritor, não o e-mail.
                    </p>
                    <div class="collaborator-form-actions">
                        <button type="submit" class="primary-button">Adicionar coautor</button>
                    </div>
                </form>
            ` : `
                <p class="muted collaborator-coauthor-note">
                    Você pode editar o conteúdo da obra. Somente a autoria principal pode adicionar ou remover colaboradores e excluir a história.
                </p>
            `}
            <div id="collaborator-feedback-container">${feedback}</div>
        </section>
    `;
}

function renderStoryDangerZone() {
    if (!isPrimaryAuthor) {
        return "";
    }

    return `
        <section class="danger-zone">
            <div>
                <span class="eyebrow danger-eyebrow">ZONA DE PERIGO</span>
                <h2>Excluir esta história</h2>
                <p>
                    A exclusão remove a obra e, em cascata,
                    suas temporadas, episódios e avaliações vinculadas.
                    Esta ação não pode ser desfeita.
                </p>
            </div>
            <button id="delete-story-button" type="button" class="danger-button">
                Excluir história definitivamente
            </button>
        </section>
    `;
}

function replaceCollaborationSection() {
    const current = document.querySelector("#story-collaboration-container");
    if (!current) return;

    const template = document.createElement("template");
    template.innerHTML = renderCollaborationSection().trim();
    const next = template.content.firstElementChild;
    if (!next) return;

    current.replaceWith(next);
    bindStoryCollaborators();
}

async function reloadCollaboratorsAfterChange(message, type = "success") {
    try {
        collaborators = await getStoryCollaborators(story.id);
        collaboratorsLoadError = null;
    } catch (error) {
        collaboratorsLoadError = error?.message || "Falha ao atualizar os colaboradores.";
        type = "warning";
        message = `${message} Atualize a página para recarregar a lista.`;
    }

    collaboratorFeedback = { type, message };
    replaceCollaborationSection();
}

function bindStoryCollaborators() {
    const form = document.querySelector("#add-story-collaborator-form");

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector("#story-collaborator-username");
        const submitButton = form.querySelector('button[type="submit"]');
        const username = input?.value?.trim() || "";

        if (!username) return;

        submitButton.disabled = true;
        const feedbackContainer = document.querySelector("#collaborator-feedback-container");
        if (feedbackContainer) {
            feedbackContainer.innerHTML = '<p class="form-message" role="status">Adicionando coautor…</p>';
        }

        try {
            await addStoryCollaborator(story.id, username);
            await reloadCollaboratorsAfterChange("Coautor adicionado com sucesso.");
        } catch (error) {
            console.error("Não foi possível adicionar o coautor:", error);
            if (feedbackContainer?.isConnected) {
                feedbackContainer.innerHTML = `<p class="form-message error" role="alert">${escapeHtml(error?.message || "Não foi possível adicionar esse coautor.")}</p>`;
            } else {
                collaboratorFeedback = { type: "error", message: error?.message || "Não foi possível adicionar esse coautor." };
                replaceCollaborationSection();
            }
            if (submitButton.isConnected) submitButton.disabled = false;
        }
    });

    document.querySelectorAll("[data-remove-collaborator]").forEach((button) => {
        button.addEventListener("click", () => {
            const writerId = Number(button.dataset.removeCollaborator);
            const collaboratorName = button.dataset.collaboratorName || "este coautor";
            if (!Number.isSafeInteger(writerId) || writerId <= 0) return;

            openConfirmModal({
                eyebrow: "COAUTORIA",
                title: "Remover coautor?",
                message: `Remover <strong>${escapeHtml(collaboratorName)}</strong> desta história?`,
                details: "A pessoa perderá o acesso de edição desta obra. As histórias próprias dela e a conta de escritor não serão removidas.",
                confirmLabel: "Remover acesso",
                danger: true,
                onConfirm: async () => {
                    await removeStoryCollaborator(story.id, writerId);
                    await reloadCollaboratorsAfterChange("Acesso do coautor removido.");
                },
            });
        });
    });
}


async function render() {
    const cover =
        await getCover(story);

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
                    ${isPrimaryAuthor ? "AUTORIA PRINCIPAL" : "EDIÇÃO POR COAUTORIA"}
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

        <section class="story-publication-panel">
            <div class="story-publication-main">
                <div class="story-publication-copy">
                    <span class="eyebrow">PUBLICAÇÃO</span>
                    <h2>Visibilidade da história</h2>
                    <p class="muted">
                        Publique esta obra independentemente dos episódios.
                        Ela poderá aparecer na página inicial mesmo sem temporadas
                        ou episódios publicados. Cada episódio só fica visível
                        quando a história, a temporada e o próprio episódio estão publicados. A temporada é sincronizada automaticamente pelo banco quando há episódios publicados.
                    </p>
                </div>

                <div class="story-publication-controls">
                    <span
                        id="story-status-pill"
                        class="status-pill ${story.status === "published" ? "published" : "draft"}"
                    >
                        ${story.status === "published" ? "Publicada" : "Rascunho"}
                    </span>

                    <button
                        id="toggle-story-publication-button"
                        class="${story.status === "published" ? "secondary-button" : "primary-button"}"
                        type="button"
                    >
                        ${story.status === "published" ? "Voltar para rascunho" : "Publicar história"}
                    </button>
                </div>
            </div>

            <p
                id="story-publication-message"
                class="form-message"
                role="alert"
                aria-live="polite"
            ></p>
        </section>

        ${renderCollaborationSection()}

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

                <section class="story-genres-editor" aria-labelledby="story-genres-editor-title">
                    <div class="story-genres-editor-heading">
                        <span class="eyebrow">CLASSIFICAÇÃO</span>
                        <h3 id="story-genres-editor-title">Gêneros da história</h3>
                        <p class="muted">Selecione todos os gêneros que combinam com a obra. Eles aparecerão na página pública da história.</p>
                    </div>
                    ${renderStoryGenreChoices(story.genres)}
                </section>

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
                        src="${escapeHtml(cover)}"
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

                    <button
                        id="story-cover-crop-toggle"
                        class="secondary-button story-cover-crop-toggle"
                        type="button"
                        ${story.cover_type === "none" ? "hidden" : ""}
                        aria-expanded="false"
                        aria-controls="story-cover-crop-controls"
                    >
                        Personalizar enquadramento da capa
                    </button>
                    <p class="muted story-cover-crop-intro">
                        Ajuste o recorte antes de salvar. Ao salvar um recorte personalizado,
                        a imagem ajustada será salva como a capa da obra.
                    </p>

                    <section
                        id="story-cover-crop-controls"
                        class="story-cover-crop-controls"
                        hidden
                        aria-label="Personalizar enquadramento da capa"
                    >
                        <div>
                            <span class="eyebrow">ENQUADRAMENTO</span>
                            <h4>Escolha o que aparece na capa</h4>
                            <p class="muted">Arraste a imagem, ajuste o zoom, gire ou espelhe. O recorte final usa proporção vertical 3:4.</p>
                        </div>

                        <div
                            id="story-cover-crop-viewport"
                            class="story-cover-crop-viewport"
                            role="application"
                            tabindex="0"
                            aria-label="Área de recorte. Arraste a imagem para reposicionar."
                        >
                            <div id="story-cover-crop-layer" class="story-cover-crop-layer">
                                <img id="story-cover-crop-image" alt="Prévia da capa" draggable="false" hidden>
                            </div>
                            <div class="story-cover-crop-grid" aria-hidden="true"><span></span><span></span></div>
                            <p id="story-cover-crop-placeholder" class="story-cover-crop-placeholder">Selecione um arquivo ou informe um link válido para ajustar a capa.</p>
                        </div>

                        <label class="story-cover-crop-zoom-label" for="story-cover-crop-zoom">
                            <span>Zoom <output id="story-cover-crop-zoom-output">100%</output></span>
                            <input id="story-cover-crop-zoom" type="range" min="100" max="300" step="5" value="100">
                        </label>

                        <div class="story-cover-crop-actions">
                            <button type="button" class="secondary-button" data-cover-crop-rotate="-90">Girar à esquerda</button>
                            <button type="button" class="secondary-button" data-cover-crop-rotate="90">Girar à direita</button>
                            <button type="button" class="secondary-button" id="story-cover-crop-flip-x" aria-pressed="false">Espelhar horizontal</button>
                            <button type="button" class="secondary-button" id="story-cover-crop-flip-y" aria-pressed="false">Espelhar vertical</button>
                            <button type="button" class="secondary-button" id="story-cover-crop-reset">Redefinir recorte</button>
                        </div>
                        <p id="story-cover-crop-message" class="form-message" role="status" aria-live="polite"></p>
                    </section>
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
                        Crie o episódio e use <b>Salvar rascunho</b> até ficar pronto.
                        Ao publicar o primeiro episódio, a temporada é publicada
                        automaticamente. Se todos os episódios voltarem para rascunho
                        ou forem excluídos, a temporada também volta para rascunho.
                    </p>
                </div>
            </aside>
        </section>

        ${renderNewsSection()}

        ${renderStoryDangerZone()}
    `;

    bindStoryPublication();
    bindStorySettings();
    bindSeasons();
    bindNews();
    bindDeleteStory();
    bindStoryCollaborators();

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

function parseNewsImageTokens(content) {
    const source = String(content ?? "").replaceAll("\r\n", "\n");
    const lines = source.split("\n");
    const regex = /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/i;
    const images = [];

    lines.forEach((line, lineIndex) => {
        const match = line.match(regex);
        if (!match) return;
        const path = String(match[1] ?? "").trim();
        if (!path) return;
        const metadata = String(match[2] ?? "").split("|");
        const alt = String(metadata[0] ?? "Imagem da notícia").trim() || "Imagem da notícia";
        const spoiler = metadata.slice(1).some((part) => part.trim().toLowerCase() === "spoiler");
        images.push({ path, alt, spoiler, lineIndex, internal: /^stories\/\d+\/news\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(path) });
    });

    return images;
}

function sanitizeNewsImageAlt(value) {
    return String(value ?? "")
        .replaceAll("|", "—")
        .replaceAll("]]", "] ]")
        .trim()
        .slice(0, 180);
}

function getProtectedNewsImageRanges(content) {
    const source = String(content ?? "");
    const ranges = [];
    const regex = /^[ \t]*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\][ \t]*(?:\r?\n|$)/gim;

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

function getProtectedNewsImageSignature(content) {
    return getProtectedNewsImageRanges(content)
        .map((range) => range.token)
        .join("\n\u0000");
}

function protectedNewsSelectionIntersects(start, end, ranges) {
    if (start === end) {
        return ranges.some((range) => start >= range.start && start < range.end);
    }

    return ranges.some((range) => start < range.end && end > range.start);
}

function isProtectedNewsEditingKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    return event.key.length === 1 || ["Enter", "Backspace", "Delete"].includes(event.key);
}

function showProtectedNewsImageMessage(state = protectedNewsImageState) {
    const feedback = state?.feedback || document.querySelector("#modal-news-image-feedback");
    if (!feedback) return;
    feedback.className = "form-message error";
    feedback.textContent = "O código da imagem é protegido. Para removê-la, use o botão ‘Remover imagem’ no gerenciador abaixo.";
}

function syncProtectedNewsImageSnapshot(textarea, state = protectedNewsImageState) {
    if (!textarea || !state || state.textarea !== textarea) return;
    state.snapshot = {
        value: textarea.value,
        selectionStart: Number(textarea.selectionStart) || 0,
        selectionEnd: Number(textarea.selectionEnd) || 0,
    };
}

function restoreProtectedNewsImageSnapshot(textarea, state) {
    if (!textarea || !state?.snapshot) return;
    state.bypass += 1;
    try {
        textarea.value = state.snapshot.value;
        const selectionStart = Math.min(state.snapshot.selectionStart, textarea.value.length);
        const selectionEnd = Math.min(state.snapshot.selectionEnd, textarea.value.length);
        textarea.focus();
        textarea.setSelectionRange(selectionStart, selectionEnd);
    } finally {
        state.bypass -= 1;
    }
}

function shouldBlockProtectedNewsImageEdit(inputType, start, end, value) {
    const ranges = getProtectedNewsImageRanges(value);
    if (!ranges.length) return false;

    if (start !== end) {
        return protectedNewsSelectionIntersects(start, end, ranges);
    }

    if ([
        "deleteContentBackward",
        "deleteWordBackward",
        "deleteSoftLineBackward",
        "deleteHardLineBackward",
    ].includes(inputType)) {
        return ranges.some((range) => start === range.start || (start > range.start && start <= range.end));
    }

    if ([
        "deleteContentForward",
        "deleteWordForward",
        "deleteSoftLineForward",
        "deleteHardLineForward",
    ].includes(inputType)) {
        return ranges.some((range) => start >= range.start && start < range.end);
    }

    return ranges.some((range) => start >= range.start && start < range.end);
}

function bindProtectedNewsImageEditing(textarea, feedback) {
    if (!textarea || textarea.dataset.protectedNewsImagesBound === "true") return;

    const state = {
        textarea,
        feedback,
        bypass: 0,
        snapshot: {
            value: textarea.value,
            selectionStart: Number(textarea.selectionStart) || 0,
            selectionEnd: Number(textarea.selectionEnd) || 0,
        },
    };
    protectedNewsImageState = state;
    textarea.dataset.protectedNewsImagesBound = "true";

    textarea.addEventListener("beforeinput", (event) => {
        if (state.bypass > 0) return;
        const start = Number(textarea.selectionStart) || 0;
        const end = Number(textarea.selectionEnd) || 0;
        if (shouldBlockProtectedNewsImageEdit(event.inputType || "", start, end, textarea.value)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            showProtectedNewsImageMessage(state);
        }
    });

    textarea.addEventListener("keydown", (event) => {
        if (state.bypass > 0) return;
        const start = Number(textarea.selectionStart) || 0;
        const end = Number(textarea.selectionEnd) || 0;
        const ranges = getProtectedNewsImageRanges(textarea.value);

        if (ranges.length && isProtectedNewsEditingKey(event) && protectedNewsSelectionIntersects(start, end, ranges)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            showProtectedNewsImageMessage(state);
            return;
        }

        if (event.key === "Backspace" && ranges.some((range) => start === range.start || (start > range.start && start <= range.end))) {
            event.preventDefault();
            event.stopImmediatePropagation();
            showProtectedNewsImageMessage(state);
            return;
        }

        if (event.key === "Delete" && ranges.some((range) => start >= range.start && start < range.end)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            showProtectedNewsImageMessage(state);
        }
    });

    const blockClipboardEdit = (event) => {
        if (state.bypass > 0) return;
        const start = Number(textarea.selectionStart) || 0;
        const end = Number(textarea.selectionEnd) || 0;
        if (protectedNewsSelectionIntersects(start, end, getProtectedNewsImageRanges(textarea.value))) {
            event.preventDefault();
            event.stopImmediatePropagation();
            showProtectedNewsImageMessage(state);
        }
    };
    textarea.addEventListener("cut", blockClipboardEdit);
    textarea.addEventListener("paste", blockClipboardEdit);
    textarea.addEventListener("drop", blockClipboardEdit);

    textarea.addEventListener("input", (event) => {
        if (state.bypass > 0) return;

        const previousSignature = getProtectedNewsImageSignature(state.snapshot.value);
        const currentSignature = getProtectedNewsImageSignature(textarea.value);
        if (previousSignature !== currentSignature) {
            restoreProtectedNewsImageSnapshot(textarea, state);
            event.stopImmediatePropagation();
            showProtectedNewsImageMessage(state);
            return;
        }

        syncProtectedNewsImageSnapshot(textarea, state);
    });
}

function runProtectedNewsImageMutation(textarea, callback) {
    const state = protectedNewsImageState;
    if (!state || state.textarea !== textarea) {
        callback();
        return;
    }

    state.bypass += 1;
    try {
        callback();
    } finally {
        state.bypass -= 1;
        syncProtectedNewsImageSnapshot(textarea, state);
    }
}

function insertNewsImageToken(textarea, token) {
    const value = textarea.value;
    const start = Math.min(Number(textarea.selectionStart) || 0, value.length);
    const end = Math.min(Math.max(Number(textarea.selectionEnd) || start, start), value.length);
    if (protectedNewsSelectionIntersects(start, end, getProtectedNewsImageRanges(value))) {
        throw new Error("O código de uma imagem é protegido. Posicione o cursor fora da imagem para inserir outra.");
    }

    const needsPrefix = start > 0 && value[start - 1] !== "\n";
    const needsSuffix = end < value.length && value[end] !== "\n";
    const insertion = `${needsPrefix ? "\n" : ""}${token}${needsSuffix ? "\n" : ""}`;
    const next = value.slice(0, start) + insertion + value.slice(end);

    if (next.length > 10000) {
        throw new Error("A notícia ultrapassaria o limite de 10.000 caracteres ao inserir a imagem.");
    }

    runProtectedNewsImageMutation(textarea, () => {
        textarea.value = next;
        const cursor = start + insertion.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function updateNewsImageSpoiler(textarea, image, enabled) {
    const lines = String(textarea.value ?? "").replaceAll("\r\n", "\n").split("\n");
    const line = lines[image.lineIndex];
    if (typeof line !== "string") return;
    const match = line.match(/^(\s*)\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\](\s*)$/i);
    if (!match || String(match[2] ?? "").trim() !== image.path) return;
    const metadata = String(match[3] ?? "").split("|");
    const alt = sanitizeNewsImageAlt(metadata[0]) || "Imagem da notícia";
    lines[image.lineIndex] = `${match[1]}[[image:${image.path}|${alt}${enabled ? "|spoiler" : ""}]]${match[4]}`;
    runProtectedNewsImageMutation(textarea, () => {
        textarea.value = lines.join("\n");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function renderNewsImageManager(modalBody) {
    const textarea = modalBody.querySelector("#modal-news-content");
    const manager = modalBody.querySelector("#story-news-image-manager");
    if (!textarea || !manager) return;

    const revision = Number(manager.dataset.renderRevision || 0) + 1;
    manager.dataset.renderRevision = String(revision);
    const images = parseNewsImageTokens(textarea.value);
    if (!images.length) {
        manager.innerHTML = `<p class="story-news-image-manager-empty">Nenhuma imagem inserida nesta notícia ainda.</p>`;
        return;
    }

    manager.innerHTML = `<p class="story-news-image-manager-empty">Carregando prévias das imagens...</p>`;
    const resolved = await Promise.all(images.map(async (image) => {
        try {
            let url = image.path;
            if (image.internal) url = await getStoryNewsImageUrl(image.path);
            else if (!/^https?:\/\//i.test(image.path)) url = "";
            if (url) {
                const parsed = new URL(url, location.href);
                if (!/^https?:$/i.test(parsed.protocol)) url = "";
                else url = parsed.href;
            }
            return { ...image, url };
        } catch (error) {
            console.warn("Prévia de imagem da notícia indisponível.", error);
            return { ...image, url: "" };
        }
    }));

    if (manager.dataset.renderRevision !== String(revision)) return;

    manager.innerHTML = resolved.map((image) => `
        <article class="story-news-image-manager-card">
            ${image.url ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy">` : `<div class="story-news-image-manager-empty">Prévia indisponível</div>`}
            <div class="story-news-image-manager-info">
                <strong>${escapeHtml(image.alt)}</strong>
                <small>${image.internal ? "Arquivo privado do Storage" : "Link externo"}</small>
                <label class="news-image-spoiler-control">
                    <input type="checkbox" data-news-image-spoiler="${image.lineIndex}" ${image.spoiler ? "checked" : ""}>
                    Marcar como spoiler
                </label>
            </div>
            <div class="story-news-image-manager-actions">
                <button type="button" class="secondary-button" data-remove-news-image="${image.lineIndex}">Remover imagem</button>
            </div>
        </article>
    `).join("");

    manager.querySelectorAll("[data-news-image-spoiler]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const currentImage = parseNewsImageTokens(textarea.value).find((entry) => entry.lineIndex === Number(checkbox.dataset.newsImageSpoiler));
            if (!currentImage) return;
            updateNewsImageSpoiler(textarea, currentImage, checkbox.checked);
            void renderNewsImageManager(modalBody);
        });
    });

    manager.querySelectorAll("[data-remove-news-image]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.removeNewsImage);
            const lines = String(textarea.value ?? "").replaceAll("\r\n", "\n").split("\n");
            if (!Number.isInteger(index) || index < 0 || index >= lines.length) return;
            const match = lines[index].match(/^\s*\[\[image:([^\]\n|]+)(?:\|[^\]\n]*)?\]\]\s*$/i);
            if (!match) return;
            lines.splice(index, 1);
            runProtectedNewsImageMutation(textarea, () => {
                textarea.value = lines.join("\n");
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
            });
            void renderNewsImageManager(modalBody);
        });
    });
}

function openNewsForm(existingNews = null) {
    const isEditing = Boolean(existingNews);
    const temporaryUploadedPaths = new Set();
    let newsSaved = false;

    const modalApi = openFormModal({
        eyebrow: "ATUALIZAÇÃO DA OBRA",
        title: isEditing ? "Editar notícia" : "Nova notícia",
        width: "760px",
        html: `
            <div class="modal-context modal-context-accent">
                <span class="modal-context-icon">📰</span>
                <div>
                    <strong>${escapeHtml(story.title)}</strong>
                    <span>${isEditing ? "Atualize a novidade publicada para os leitores." : "A notícia será publicada imediatamente na página da história."}</span>
                </div>
            </div>

            <label>
                Título da notícia
                <input id="modal-news-title" maxlength="200" value="${isEditing ? escapeHtml(existingNews.title) : ""}" placeholder="Ex.: Novo episódio chegando!" autocomplete="off" required>
            </label>

            <label>
                Conteúdo
                <textarea id="modal-news-content" rows="10" maxlength="10000" placeholder="Escreva a novidade que deseja compartilhar..." required>${isEditing ? escapeHtml(existingNews.content) : ""}</textarea>
            </label>
            <small class="field-help">A notícia aceita quebras de linha. Os códigos das imagens são protegidos: para remover uma imagem, use o botão “Remover imagem” no gerenciador abaixo.</small>

            <section class="story-news-image-composer" aria-label="Adicionar imagens à notícia">
                <h4>🖼️ Imagens da notícia</h4>
                <div class="story-news-image-tools-grid">
                    <label>
                        Origem da imagem
                        <select id="modal-news-image-source-type">
                            <option value="upload">Enviar arquivo do dispositivo</option>
                            <option value="url">Usar link externo</option>
                        </select>
                    </label>
                    <label id="modal-news-image-upload-panel">
                        Arquivo (até 5 MB)
                        <input id="modal-news-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif">
                    </label>
                    <label id="modal-news-image-url-panel" hidden>
                        Link direto da imagem
                        <input id="modal-news-image-url" type="url" placeholder="https://exemplo.com/imagem.png" autocomplete="off">
                    </label>
                    <label>
                        Texto alternativo
                        <input id="modal-news-image-alt" maxlength="180" placeholder="Descreva a imagem" autocomplete="off">
                    </label>
                    <label class="story-news-image-spoiler-toggle">
                        <input id="modal-news-image-spoiler" type="checkbox">
                        Marcar esta imagem como spoiler
                    </label>
                    <button type="button" id="insert-news-image-button" class="secondary-button">Inserir imagem no conteúdo</button>
                </div>
                <p id="modal-news-image-feedback" class="form-message" role="status" aria-live="polite"></p>
                <div id="story-news-image-manager" class="story-news-image-manager">
                    <p class="story-news-image-manager-empty">Nenhuma imagem inserida nesta notícia ainda.</p>
                </div>
            </section>
        `,
        onSubmit: async (form) => {
            const newsTitle = form.querySelector("#modal-news-title").value.trim();
            const textarea = form.querySelector("#modal-news-content");
            const content = textarea.value.trim();

            if (!newsTitle) throw new Error("Informe um título para a notícia.");
            if (!content) throw new Error("Informe o conteúdo da notícia.");
            if (newsTitle.length > 200) throw new Error("O título da notícia deve ter no máximo 200 caracteres.");
            if (content.length > 10000) throw new Error("O conteúdo da notícia deve ter no máximo 10.000 caracteres.");

            let savedNews;
            if (isEditing) {
                savedNews = await updateStoryNews(existingNews.id, { title: newsTitle, content });
            } else {
                savedNews = await createStoryNews({ storyId: story.id, title: newsTitle, content });
            }

            newsSaved = true;
            const retainedPaths = new Set(extractStoryNewsImagePaths(content));
            const oldPaths = isEditing ? extractStoryNewsImagePaths(existingNews.content) : [];
            const otherNews = news.filter((item) => !isEditing || item.id !== existingNews.id);
            const pathsStillUsedElsewhere = new Set(
                otherNews.flatMap((item) => extractStoryNewsImagePaths(item.content)),
            );
            const pathsToRemove = [
                ...oldPaths.filter((path) => !retainedPaths.has(path)),
                ...[...temporaryUploadedPaths].filter((path) => !retainedPaths.has(path)),
            ].filter((path) => !pathsStillUsedElsewhere.has(path));
            for (const path of new Set(pathsToRemove)) {
                try {
                    await removeStoryNewsImage(path);
                    temporaryUploadedPaths.delete(path);
                } catch (error) {
                    console.warn("Não foi possível limpar uma imagem de notícia sem referência.", error);
                }
            }

            if (isEditing) {
                news = news.map((item) => item.id === existingNews.id ? { ...item, ...savedNews } : item);
            } else {
                news = [savedNews, ...news];
            }
            await render();
        },
    });

    // Modal atual e os uploads temporários são tratados juntos para evitar
    // deixar arquivos órfãos quando o escritor cancela a criação/edição.
    const modal = modalApi.dialog;
    if (!modal) return;
    const form = modal.querySelector("[data-modal-form]");
    const textarea = form?.querySelector("#modal-news-content");
    const sourceType = form?.querySelector("#modal-news-image-source-type");
    const uploadPanel = form?.querySelector("#modal-news-image-upload-panel");
    const urlPanel = form?.querySelector("#modal-news-image-url-panel");
    const feedback = form?.querySelector("#modal-news-image-feedback");
    const insertButton = form?.querySelector("#insert-news-image-button");

    const syncSourcePanels = () => {
        if (!sourceType || !uploadPanel || !urlPanel) return;
        const isUpload = sourceType.value === "upload";
        uploadPanel.hidden = !isUpload;
        urlPanel.hidden = isUpload;
    };
    sourceType?.addEventListener("change", syncSourcePanels);
    syncSourcePanels();

    bindProtectedNewsImageEditing(textarea, feedback);
    textarea?.addEventListener("input", () => void renderNewsImageManager(modal));
    void renderNewsImageManager(modal);

    insertButton?.addEventListener("click", async () => {
        if (!textarea || !sourceType || !insertButton) return;
        insertButton.disabled = true;
        if (feedback) {
            feedback.className = "form-message";
            feedback.textContent = "Preparando imagem...";
        }
        let uploadedPath = "";
        try {
            const alt = sanitizeNewsImageAlt(form.querySelector("#modal-news-image-alt").value) || "Imagem da notícia";
            const spoiler = form.querySelector("#modal-news-image-spoiler").checked;
            let imageSource = "";

            if (sourceType.value === "upload") {
                const file = form.querySelector("#modal-news-image-file").files?.[0];
                if (!file) throw new Error("Selecione um arquivo de imagem.");
                const uploaded = await uploadStoryNewsImage(story.id, file);
                uploadedPath = uploaded.path;
                temporaryUploadedPaths.add(uploadedPath);
                imageSource = uploadedPath;
            } else {
                const rawUrl = form.querySelector("#modal-news-image-url").value.trim();
                if (!rawUrl) throw new Error("Informe o link direto da imagem.");
                let parsed;
                try { parsed = new URL(rawUrl); } catch { throw new Error("O link da imagem não é válido."); }
                if (!/^https?:$/i.test(parsed.protocol)) throw new Error("Use um link HTTP ou HTTPS para a imagem.");
                imageSource = parsed.href;
            }

            const token = `[[image:${imageSource}|${alt}${spoiler ? "|spoiler" : ""}]]`;
            try {
                insertNewsImageToken(textarea, token);
            } catch (error) {
                if (uploadedPath) {
                    try { await removeStoryNewsImage(uploadedPath); } catch (cleanupError) { console.warn(cleanupError); }
                    temporaryUploadedPaths.delete(uploadedPath);
                }
                throw error;
            }

            form.querySelector("#modal-news-image-alt").value = "";
            form.querySelector("#modal-news-image-spoiler").checked = false;
            form.querySelector("#modal-news-image-file").value = "";
            if (feedback) {
                feedback.className = "form-message success";
                feedback.textContent = "Imagem inserida. Salve a notícia para publicar a alteração.";
            }
            await renderNewsImageManager(modal);
        } catch (error) {
            if (feedback) {
                feedback.className = "form-message error";
                feedback.textContent = error.message || "Não foi possível inserir a imagem.";
            }
        } finally {
            insertButton.disabled = false;
        }
    });

    modal.addEventListener("close", () => {
        if (protectedNewsImageState?.textarea === textarea) {
            protectedNewsImageState = null;
        }
        if (newsSaved) return;
        for (const path of temporaryUploadedPaths) {
            void removeStoryNewsImage(path).catch((error) => console.warn("Não foi possível limpar imagem temporária da notícia.", error));
        }
    }, { once: true });
}


function bindNews() {
    const newButton =
        document.querySelector(
            "#new-news-button"
        );

    if (newButton) {
        newButton.addEventListener(
            "click",
            () => openNewsForm()
        );
    }

    document.querySelectorAll(
        ".edit-news-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                const card =
                    event.currentTarget.closest(
                        "[data-news-id]"
                    );

                const newsId =
                    Number(
                        card?.dataset.newsId
                    );

                const item =
                    news.find(
                        (newsItem) =>
                            newsItem.id === newsId
                    );

                if (!item) return;

                openNewsForm(item);
            }
        );
    });

    document.querySelectorAll(
        ".delete-news-button"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                const card =
                    event.currentTarget.closest(
                        "[data-news-id]"
                    );

                const newsId =
                    Number(
                        card?.dataset.newsId
                    );

                const item =
                    news.find(
                        (newsItem) =>
                            newsItem.id === newsId
                    );

                if (!item) return;

                openConfirmModal({
                    eyebrow: "ATUALIZAÇÃO DA OBRA",
                    title: "Excluir notícia?",
                    message: `Excluir permanentemente <strong>${escapeHtml(item.title)}</strong>?`,
                    details: `
                        <p>
                            A notícia será removida da página pública
                            e não poderá mais ser recuperada.
                        </p>
                        <span>Esta ação é definitiva.</span>
                    `,
                    confirmLabel: "Excluir notícia",
                    onConfirm: async () => {
                        await deleteStoryNews(item.id);
                        const otherNewsPaths = new Set(
                            news.filter((newsItem) => newsItem.id !== item.id)
                                .flatMap((newsItem) => extractStoryNewsImagePaths(newsItem.content)),
                        );
                        for (const path of extractStoryNewsImagePaths(item.content).filter((value) => !otherNewsPaths.has(value))) {
                            try {
                                await removeStoryNewsImage(path);
                            } catch (error) {
                                console.warn("Notícia excluída, mas uma imagem não pôde ser removida do Storage.", error);
                            }
                        }

                        news =
                            news.filter(
                                (newsItem) =>
                                    newsItem.id !== item.id
                            );

                        await render();
                    },
                });
            }
        );
    });
}


function updateStoryPublicationUi() {
    const pill = root.querySelector("#story-status-pill");
    const button = root.querySelector("#toggle-story-publication-button");
    if (!pill || !button) return;

    const published = story.status === "published";
    pill.className = `status-pill ${published ? "published" : "draft"}`;
    pill.textContent = published ? "Publicada" : "Rascunho";

    button.className = published ? "secondary-button" : "primary-button";
    button.textContent = published ? "Voltar para rascunho" : "Publicar história";
    button.setAttribute(
        "aria-label",
        published ? "Voltar a história para rascunho" : "Publicar história para os leitores",
    );
}

function updateSeasonStatusPills() {
    for (const season of seasons) {
        const card = root.querySelector(
            `[data-season-id="${Number(season.id)}"]`,
        );
        const pill = card?.querySelector("[data-season-status-pill]");
        if (!pill) continue;

        const published = season.status === "published";
        pill.className = `status-pill season-status-pill ${published ? "published" : "draft"}`;
        pill.textContent = published ? "Publicada" : "Rascunho";
    }
}

function bindStoryPublication() {
    const button = root.querySelector("#toggle-story-publication-button");
    const message = root.querySelector("#story-publication-message");
    if (!button || !message) return;

    button.addEventListener("click", async () => {
        const nextStatus = story.status === "published" ? "draft" : "published";
        const publishing = nextStatus === "published";
        const prompt = publishing
            ? `Publicar a história “${story.title}”? Ela aparecerá na página inicial mesmo que ainda não tenha episódios publicados.`
            : `Voltar “${story.title}” para rascunho? A história deixará de aparecer publicamente, e seus episódios ficarão indisponíveis aos leitores até ela ser publicada novamente.`;

        if (!confirm(prompt)) return;

        button.disabled = true;
        showMessage(
            message,
            publishing
                ? "Publicando história..."
                : "Voltando a história para rascunho...",
        );

        try {
            // O estado da história é independente do estado das temporadas.
            // As temporadas são sincronizadas no banco quando episódios mudam.
            const updated = await updateStoryStatus(story.id, nextStatus);
            story = { ...story, ...updated };
            seasons = await getWriterSeasons(story.id);

            updateStoryPublicationUi();
            updateSeasonStatusPills();

            showMessage(
                message,
                publishing
                    ? "História publicada! Ela já pode aparecer na página inicial, mesmo sem episódios publicados."
                    : "História voltou para rascunho. Ela não aparecerá na página inicial até ser publicada novamente.",
                "success",
            );
        } catch (error) {
            console.error("Não foi possível alterar a publicação da história:", error);
            showMessage(
                message,
                error.message || "Não foi possível alterar o estado da história.",
                "error",
            );
        } finally {
            button.disabled = false;
        }
    });
}


function bindStorySettings() {
    const form = document.querySelector("#story-settings-form");
    const message = document.querySelector("#story-settings-message");
    const coverType = document.querySelector("#cover-type");
    const urlGroup = document.querySelector("#cover-url-group");
    const fileGroup = document.querySelector("#cover-file-group");
    const preview = document.querySelector("#story-cover-preview");
    const coverUrlInput = document.querySelector("#cover-url");
    const coverFileInput = document.querySelector("#cover-file");
    const cropToggle = document.querySelector("#story-cover-crop-toggle");
    const cropControls = document.querySelector("#story-cover-crop-controls");
    const cropViewport = document.querySelector("#story-cover-crop-viewport");
    const cropLayer = document.querySelector("#story-cover-crop-layer");
    const cropImage = document.querySelector("#story-cover-crop-image");
    const cropPlaceholder = document.querySelector("#story-cover-crop-placeholder");
    const cropZoom = document.querySelector("#story-cover-crop-zoom");
    const cropZoomOutput = document.querySelector("#story-cover-crop-zoom-output");
    const cropMessage = document.querySelector("#story-cover-crop-message");
    const flipXButton = document.querySelector("#story-cover-crop-flip-x");
    const flipYButton = document.querySelector("#story-cover-crop-flip-y");
    const cropState = {
        zoom: 1,
        rotation: 0,
        flipX: false,
        flipY: false,
        offsetX: 0,
        offsetY: 0,
    };
    let cropSourceKey = "";
    let cropSourceError = null;
    let cropObjectUrl = null;
    let previewObjectUrl = null;
    let cropDrag = null;
    let urlCropDebounce = null;

    function setCropMessage(text = "", type = "") {
        if (!cropMessage) return;
        cropMessage.className = `form-message${type ? ` ${type}` : ""}`;
        cropMessage.textContent = text;
    }

    function normalizeRotation(value) {
        return ((Number(value) % 360) + 360) % 360;
    }

    function getCropSourceDescriptor() {
        if (coverType.value === "upload") {
            const file = coverFileInput.files?.[0] || null;
            if (file) {
                return {
                    key: `file:${file.name}:${file.size}:${file.lastModified}`,
                    file,
                    url: "",
                };
            }
            if (story.cover_type === "upload" && story.cover_path && preview.src) {
                return {
                    key: `stored:${story.cover_path}`,
                    file: null,
                    url: preview.currentSrc || preview.src,
                };
            }
            return null;
        }

        if (coverType.value === "url") {
            const url = coverUrlInput.value.trim();
            if (!/^https?:\/\//i.test(url)) return null;
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
                return { key: `url:${parsed.href}`, file: null, url: parsed.href };
            } catch {
                return null;
            }
        }
        return null;
    }

    function clampCropOffsets() {
        if (!cropImage.naturalWidth || !cropViewport.clientWidth || !cropViewport.clientHeight) return;
        const vw = cropViewport.clientWidth;
        const vh = cropViewport.clientHeight;
        const rotation = normalizeRotation(cropState.rotation);
        const rotatedWidth = rotation % 180 === 0 ? cropImage.naturalWidth : cropImage.naturalHeight;
        const rotatedHeight = rotation % 180 === 0 ? cropImage.naturalHeight : cropImage.naturalWidth;
        const fit = Math.max(vw / rotatedWidth, vh / rotatedHeight);
        const maxX = Math.max(0, (rotatedWidth * fit * cropState.zoom - vw) / (2 * vw));
        const maxY = Math.max(0, (rotatedHeight * fit * cropState.zoom - vh) / (2 * vh));
        cropState.offsetX = Math.max(-maxX, Math.min(maxX, cropState.offsetX));
        cropState.offsetY = Math.max(-maxY, Math.min(maxY, cropState.offsetY));
    }

    function updateCropPreview() {
        if (!cropImage.naturalWidth) return;
        const vw = cropViewport.clientWidth;
        const vh = cropViewport.clientHeight;
        if (!vw || !vh) return;
        const rotation = normalizeRotation(cropState.rotation);
        const rotatedWidth = rotation % 180 === 0 ? cropImage.naturalWidth : cropImage.naturalHeight;
        const rotatedHeight = rotation % 180 === 0 ? cropImage.naturalHeight : cropImage.naturalWidth;
        const fit = Math.max(vw / rotatedWidth, vh / rotatedHeight);
        cropLayer.style.width = `${cropImage.naturalWidth * fit}px`;
        cropLayer.style.height = `${cropImage.naturalHeight * fit}px`;
        clampCropOffsets();
        cropLayer.style.transform = `translate(calc(-50% + ${cropState.offsetX * vw}px), calc(-50% + ${cropState.offsetY * vh}px)) rotate(${rotation}deg) scale(${cropState.zoom}) scaleX(${cropState.flipX ? -1 : 1}) scaleY(${cropState.flipY ? -1 : 1})`;
        cropZoom.value = String(Math.round(cropState.zoom * 100));
        cropZoomOutput.value = `${Math.round(cropState.zoom * 100)}%`;
        flipXButton.setAttribute("aria-pressed", String(cropState.flipX));
        flipYButton.setAttribute("aria-pressed", String(cropState.flipY));
    }

    async function loadCropSource(force = false) {
        const descriptor = getCropSourceDescriptor();
        if (!descriptor) {
            cropSourceError = new Error("Selecione uma imagem ou informe um link válido antes de personalizar o recorte.");
            cropPlaceholder.hidden = false;
            cropImage.hidden = true;
            cropLayer.style.width = "0";
            cropLayer.style.height = "0";
            setCropMessage(cropSourceError.message, "error");
            return false;
        }

        if (!force && descriptor.key === cropSourceKey && cropImage.complete && cropImage.naturalWidth > 0 && !cropSourceError) {
            updateCropPreview();
            return true;
        }

        cropSourceError = null;
        setCropMessage("Carregando imagem para recorte…");
        cropPlaceholder.hidden = true;
        cropImage.hidden = false;

        let nextObjectUrl = null;
        let src = descriptor.url;
        if (descriptor.file) {
            nextObjectUrl = URL.createObjectURL(descriptor.file);
            src = nextObjectUrl;
        }

        try {
            await new Promise((resolve, reject) => {
                const onLoad = () => {
                    cropImage.removeEventListener("load", onLoad);
                    cropImage.removeEventListener("error", onError);
                    resolve();
                };
                const onError = () => {
                    cropImage.removeEventListener("load", onLoad);
                    cropImage.removeEventListener("error", onError);
                    reject(new Error("Não foi possível carregar a imagem para recorte. Links externos precisam permitir acesso à imagem pelo navegador (CORS); se necessário, envie o arquivo diretamente."));
                };
                cropImage.addEventListener("load", onLoad, { once: true });
                cropImage.addEventListener("error", onError, { once: true });
                if (/^https?:\/\//i.test(src)) {
                    cropImage.crossOrigin = "anonymous";
                } else {
                    cropImage.removeAttribute("crossorigin");
                }
                cropImage.src = src;
                if (cropImage.complete && cropImage.naturalWidth > 0) onLoad();
            });
            if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
            cropObjectUrl = nextObjectUrl;
            cropSourceKey = descriptor.key;
            cropState.zoom = 1;
            cropState.rotation = 0;
            cropState.flipX = false;
            cropState.flipY = false;
            cropState.offsetX = 0;
            cropState.offsetY = 0;
            updateCropPreview();
            cropPlaceholder.hidden = true;
            setCropMessage("Arraste a imagem ou use os controles para ajustar o recorte.", "success");
            return true;
        } catch (error) {
            if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
            cropSourceError = error;
            cropSourceKey = "";
            cropImage.hidden = true;
            cropPlaceholder.hidden = false;
            cropPlaceholder.textContent = "Não foi possível preparar a imagem para recorte. Tente outro link ou envie o arquivo.";
            setCropMessage(error.message, "error");
            return false;
        }
    }

    function updateCoverControls() {
        urlGroup.hidden = coverType.value !== "url";
        fileGroup.hidden = coverType.value !== "upload";
        cropToggle.hidden = coverType.value === "none";
        if (coverType.value === "none") {
            cropControls.hidden = true;
            cropToggle.textContent = "Personalizar enquadramento da capa";
            cropToggle.setAttribute("aria-expanded", "false");
        }
        const hasSource = Boolean(getCropSourceDescriptor());
        cropToggle.disabled = !hasSource;
        cropToggle.title = hasSource ? "Abrir os ajustes de enquadramento" : "Selecione uma imagem para ajustar o enquadramento";
    }

    coverType.addEventListener("change", () => {
        updateCoverControls();
        if (!cropControls.hidden) loadCropSource(true);
    });

    cropToggle.addEventListener("click", async () => {
        if (cropControls.hidden) {
            cropControls.hidden = false;
            cropToggle.textContent = "Ocultar ajustes de enquadramento";
            cropToggle.setAttribute("aria-expanded", "true");
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const loaded = await loadCropSource();
            if (!loaded) cropViewport.setAttribute("aria-disabled", "true");
            else cropViewport.setAttribute("aria-disabled", "false");
        } else {
            cropControls.hidden = true;
            cropToggle.textContent = "Personalizar enquadramento da capa";
            cropToggle.setAttribute("aria-expanded", "false");
        }
    });

    cropZoom.addEventListener("input", () => {
        cropState.zoom = Number(cropZoom.value) / 100;
        updateCropPreview();
    });

    document.querySelectorAll("[data-cover-crop-rotate]").forEach((button) => {
        button.addEventListener("click", () => {
            cropState.rotation = normalizeRotation(cropState.rotation + Number(button.dataset.coverCropRotate));
            updateCropPreview();
        });
    });

    flipXButton.addEventListener("click", () => {
        cropState.flipX = !cropState.flipX;
        updateCropPreview();
    });
    flipYButton.addEventListener("click", () => {
        cropState.flipY = !cropState.flipY;
        updateCropPreview();
    });

    document.querySelector("#story-cover-crop-reset").addEventListener("click", () => {
        cropState.zoom = 1;
        cropState.rotation = 0;
        cropState.flipX = false;
        cropState.flipY = false;
        cropState.offsetX = 0;
        cropState.offsetY = 0;
        updateCropPreview();
        setCropMessage("Enquadramento redefinido.", "success");
    });

    cropViewport.addEventListener("pointerdown", (event) => {
        if (!cropImage.naturalWidth || cropImage.hidden || cropControls.hidden) return;
        event.preventDefault();
        cropDrag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            offsetX: cropState.offsetX,
            offsetY: cropState.offsetY,
        };
        cropViewport.classList.add("is-dragging");
        cropViewport.setPointerCapture(event.pointerId);
    });

    cropViewport.addEventListener("pointermove", (event) => {
        if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
        const width = Math.max(1, cropViewport.clientWidth);
        const height = Math.max(1, cropViewport.clientHeight);
        cropState.offsetX = cropDrag.offsetX + (event.clientX - cropDrag.x) / width;
        cropState.offsetY = cropDrag.offsetY + (event.clientY - cropDrag.y) / height;
        updateCropPreview();
    });

    function stopCropDrag(event) {
        if (!cropDrag) return;
        if (event && cropDrag.pointerId !== event.pointerId) return;
        cropDrag = null;
        cropViewport.classList.remove("is-dragging");
    }
    cropViewport.addEventListener("pointerup", stopCropDrag);
    cropViewport.addEventListener("pointercancel", stopCropDrag);
    cropViewport.addEventListener("lostpointercapture", stopCropDrag);

    window.addEventListener("resize", () => {
        if (!cropControls.hidden) updateCropPreview();
    }, { passive: true });

    async function createCroppedCoverFile() {
        if (!cropImage.naturalWidth || cropImage.hidden || cropSourceError) {
            throw cropSourceError || new Error("Carregue a imagem no editor de recorte antes de salvar.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 1200;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("Não foi possível preparar o recorte da capa neste navegador.");

        const naturalWidth = cropImage.naturalWidth;
        const naturalHeight = cropImage.naturalHeight;
        const rotation = normalizeRotation(cropState.rotation);
        const rotatedWidth = rotation % 180 === 0 ? naturalWidth : naturalHeight;
        const rotatedHeight = rotation % 180 === 0 ? naturalHeight : naturalWidth;
        const fit = Math.max(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.translate(canvas.width / 2 + cropState.offsetX * canvas.width, canvas.height / 2 + cropState.offsetY * canvas.height);
        context.rotate(rotation * Math.PI / 180);
        context.scale(cropState.flipX ? -1 : 1, cropState.flipY ? -1 : 1);
        context.scale(fit * cropState.zoom, fit * cropState.zoom);
        context.drawImage(cropImage, -naturalWidth / 2, -naturalHeight / 2, naturalWidth, naturalHeight);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível gerar a imagem recortada.")), "image/webp", 0.92);
        });
        return new File([blob], "capa-personalizada.webp", { type: blob.type || "image/webp", lastModified: Date.now() });
    }

    coverUrlInput.addEventListener("input", (event) => {
        const url = event.target.value.trim();
        if (coverType.value === "url" && /^https?:\/\//i.test(url)) {
            preview.src = url;
        }
        updateCoverControls();
        if (!cropControls.hidden && coverType.value === "url") {
            clearTimeout(urlCropDebounce);
            urlCropDebounce = setTimeout(() => loadCropSource(true), 450);
        }
    });

    coverFileInput.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            updateCoverControls();
            return;
        }
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(file);
        preview.src = previewObjectUrl;
        updateCoverControls();
        if (!cropControls.hidden) loadCropSource(true);
    });

    function cleanupCropUiAfterSave() {
        cropControls.hidden = true;
        cropToggle.textContent = "Personalizar enquadramento da capa";
        cropToggle.setAttribute("aria-expanded", "false");
        cropSourceKey = "";
        cropSourceError = null;
        if (cropObjectUrl) {
            URL.revokeObjectURL(cropObjectUrl);
            cropObjectUrl = null;
        }
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showMessage(message, "Salvando...");
        let newlyUploadedCoverPath = null;

        try {
            const previousCoverPath = story.cover_path;
            const selectedType = coverType.value;
            let effectiveCoverType = selectedType;
            const title = document.querySelector("#story-title").value.trim();
            const description = document.querySelector("#story-description").value.trim();
            const genres = readSelectedStoryGenres(form);
            const url = coverUrlInput.value.trim();
            const file = coverFileInput.files?.[0] || null;
            let coverPath = story.cover_path;
            let coverUrl = story.cover_url;

            if (selectedType === "none") {
                coverPath = null;
                coverUrl = null;
            } else if (selectedType === "url") {
                if (!url) throw new Error("Informe o link da capa.");
                if (!/^https?:\/\//i.test(url)) throw new Error("O link da capa precisa começar com http:// ou https://.");
                coverUrl = url;
                coverPath = null;
            } else {
                if (file) {
                    coverPath = null;
                    coverUrl = null;
                } else if (story.cover_type !== "upload" || !story.cover_path) {
                    throw new Error("Selecione uma imagem para o upload.");
                }
                coverUrl = null;
            }

            if (selectedType !== "none" && !cropControls.hidden) {
                const loaded = await loadCropSource();
                if (!loaded) throw cropSourceError || new Error("Não foi possível carregar a imagem para recorte.");
                const croppedFile = await createCroppedCoverFile();
                const uploaded = await uploadStoryCover(story.id, croppedFile);
                coverPath = uploaded.path;
                newlyUploadedCoverPath = uploaded.path;
                coverUrl = null;
                effectiveCoverType = "upload";
            } else if (selectedType === "upload" && file) {
                const uploaded = await uploadStoryCover(story.id, file);
                coverPath = uploaded.path;
                newlyUploadedCoverPath = uploaded.path;
                coverUrl = null;
            }

            const updated = await updateStory(story.id, {
                title,
                description,
                genres,
                coverType: effectiveCoverType,
                coverUrl,
                coverPath,
            });

            story = {
                ...story,
                ...updated,
                updated_at: updated.updated_at || story.updated_at,
            };

            newlyUploadedCoverPath = null;
            if (previousCoverPath && previousCoverPath !== story.cover_path) {
                try {
                    await removeStoryCover(previousCoverPath);
                } catch (cleanupError) {
                    console.warn("As informações foram salvas, mas a capa anterior não pôde ser removida:", cleanupError);
                }
            }

            coverType.value = story.cover_type || "none";
            coverUrlInput.value = story.cover_url || "";
            coverFileInput.value = "";
            preview.src = await getCover(story);
            cleanupCropUiAfterSave();
            updateCoverControls();
            showMessage(message, "Informações salvas!", "success");

            const heading = root.querySelector(".editor-topbar h1");
            if (heading) heading.textContent = story.title;
            await updateStoryEditorPresence();
        } catch (error) {
            console.error(error);
            if (newlyUploadedCoverPath) {
                try {
                    await removeStoryCover(newlyUploadedCoverPath);
                } catch (cleanupError) {
                    console.warn("Não foi possível limpar a nova capa após falha ao salvar a história:", cleanupError);
                }
            }
            showMessage(message, error.message || "Não foi possível salvar a história.", "error");
        }
    });

    updateCoverControls();
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

                        await render();
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

                        await render();
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
                        const deleted = await deleteChapter(chapterId);

                        if (season) {
                            season.chapters =
                                (season.chapters ?? []).filter(
                                    (chapter) => chapter.id !== chapterId
                                );

                            if (deleted.seasonStatus) {
                                season.status = deleted.seasonStatus;
                            } else {
                                // Fallback visual caso a consulta pós-trigger falhe.
                                seasons = await getWriterSeasons(story.id);
                            }
                        }

                        await render();
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
                    const coverPath = story.cover_path;
                    let coverBackup = null;

                    // Remove a capa enquanto a história ainda existe, pois a
                    // política do Storage confirma a propriedade pela história.
                    if (coverPath) {
                        coverBackup = await downloadStoryCover(coverPath);
                        await removeStoryCover(coverPath);
                    }

                    try {
                        await deleteStory(story.id);
                    } catch (deleteError) {
                        // Se a exclusão do registro falhar, tenta restaurar a capa
                        // no mesmo caminho para que a obra não fique quebrada.
                        if (coverPath && coverBackup) {
                            try {
                                await restoreStoryCover(coverPath, coverBackup);
                            } catch (restoreError) {
                                console.error(
                                    "A exclusão da história falhou e a capa também não pôde ser restaurada:",
                                    restoreError,
                                );
                                deleteError.message = `${deleteError.message || "Não foi possível excluir a história."} A capa não pôde ser restaurada; verifique o Storage.`;
                            }
                        }
                        throw deleteError;
                    }

                    location.href = "./index.html";
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

            await render();
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

        isPrimaryAuthor = Number(writer.writer_id) === Number(story.writer_id);

        try {
            collaborators = await getStoryCollaborators(story.id);
            collaboratorsLoadError = null;
        } catch (collaboratorError) {
            collaborators = [];
            collaboratorsLoadError = collaboratorError?.message || "Falha ao consultar a coautoria.";
        }

        if (!isPrimaryAuthor) {
            const hasCoauthorAccess = await isCurrentUserStoryCollaborator(story.id);
            if (!hasCoauthorAccess) {
                throw new Error("Esta história não está vinculada à sua conta de escritor.");
            }
        }

        seasons =
            await getWriterSeasons(
                story.id
            );

        news =
            await getWriterStoryNews(
                story.id
            );

        await render();

        // Inicializa/atualiza a presença somente depois de autenticar o escritor
        // e carregar a obra. A capa continua opcional e passa pelo controle de privacidade.
        await updateStoryEditorPresence();
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
