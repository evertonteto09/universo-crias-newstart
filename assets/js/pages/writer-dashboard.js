import { setupTheme } from "../core/theme.js?v=20261028-crias-presence-final-1";
import { openConfirmModal } from "../core/modal.js";
import {
    escapeHtml,
    storyCoverSource,
    ratingStars,
    showMessage,
} from "../core/utils.js";
import {
    renderStoryGenreChoices,
    readSelectedStoryGenres,
} from "../core/story-genres.js?v=20261028-story-genres-1";

import { signOut, linkDiscordIdentity, getCurrentUserIdentities, getCurrentUser } from "../services/auth.service.js";
import { rememberWriterLoginState, readPendingDiscordLogin, clearPendingDiscordLogin, clearPendingDiscordLoginIfExpired, invalidateRememberedDiscordLink } from "../services/local-account-state.service.js?v=20261024-local-login-state-2";
import {
    getMyWriterAccount,
    getMyStories,
    createStory,
} from "../services/writer.service.js?v=20261028-story-genres-1";

import {
    getStoryReviewSummary,
    getWriterStoryById,
} from "../services/story.service.js?v=20261028-story-genres-1";

import {
    getWriterReviews,
    moderateReview,
    deleteReview,
} from "../services/review.service.js";

import {
    getStoryCoverUrl,
    uploadStoryCover,
} from "../services/storage.service.js";

import {
    initCriasPresence,
} from "../services/crias-presence.service.js?v=20261028-crias-presence-final-1";

setupTheme();

const criasPresence = initCriasPresence({
    details: "No portal do Escritor",
    state: "Universo dos Crias",
    pageContext: "writer",
});

const writerName =
    document.querySelector(
        "#writer-name"
    );
const linkDiscordButton = document.querySelector("#link-discord-button");
const discordLinkControl = document.querySelector("#discord-link-control");
const discordLinkFeedback = document.querySelector("#discord-link-feedback");

const DISCORD_LINK_PENDING_KEY = "hdc-discord-link-pending";

const grid =
    document.querySelector(
        "#writer-story-grid"
    );

const reviewList =
    document.querySelector(
        "#review-list"
    );

const newStoryButton =
    document.querySelector(
        "#new-story-button"
    );

let stories = [];

const dialog =
    document.createElement("dialog");

dialog.className =
    "writer-dialog";

dialog.innerHTML = `
    <form
        id="create-story-form"
        class="review-form"
    >
        <div class="section-heading">
            <div>
                <span class="eyebrow">
                    NOVA OBRA
                </span>
                <h2>Criar história</h2>
            </div>
        </div>

        <label>
            Nome da história
            <input
                id="new-story-title"
                maxlength="160"
                required
            >
        </label>

        <label>
            Descrição inicial
            <textarea
                id="new-story-description"
                maxlength="1000"
                rows="5"
            ></textarea>
        </label>

        <section class="story-genres-editor story-genres-create" aria-labelledby="new-story-genres-title">
            <div class="story-genres-editor-heading">
                <span class="eyebrow">CLASSIFICAÇÃO</span>
                <h3 id="new-story-genres-title">Gêneros da história</h3>
                <p class="muted">Selecione os gêneros agora ou deixe para definir depois no editor.</p>
            </div>
            ${renderStoryGenreChoices([])}
        </section>

        <p class="muted">
            A história será criada sem capa e com a
            configuração mínima. Depois você poderá
            editar tudo no editor.
        </p>

        <div class="main-nav">
            <button
                type="button"
                class="secondary-button"
                id="cancel-story"
            >
                Cancelar
            </button>

            <button
                class="primary-button"
                type="submit"
            >
                Criar e abrir editor
            </button>
        </div>

        <p
            id="create-story-message"
            class="form-message"
            role="alert"
        ></p>
    </form>
`;

document.body.appendChild(dialog);

const form =
    dialog.querySelector(
        "#create-story-form"
    );

const createMessage =
    dialog.querySelector(
        "#create-story-message"
    );

newStoryButton.addEventListener(
    "click",
    () => {
        form.reset();
        createMessage.textContent = "";
        dialog.showModal();
    }
);

dialog.querySelector(
    "#cancel-story"
).addEventListener(
    "click",
    () => dialog.close()
);

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

async function storyCard(story, summary) {
    const cover =
        await storyCoverSource(
            story,
            getStoryCoverUrl
        );

    const isCoauthor = story.collaboration_role === "coauthor";

    return `
        <article
            class="writer-story-card ${isCoauthor ? "writer-story-card-coauthor" : ""}"
            data-story-id="${story.id}"
            data-collaboration-role="${isCoauthor ? "coauthor" : "owner"}"
        >
            <img
                class="story-cover"
                src="${escapeHtml(cover)}"
                alt=""
                loading="lazy"
            >

            <div>
                <div class="writer-story-meta">
                    <span class="eyebrow">${isCoauthor ? "COAUTORIA" : "MINHA OBRA"}</span>
                    ${isCoauthor ? '<span class="collaboration-role-pill">Coautor</span>' : ""}
                    <span class="status-pill ${story.status === "published" ? "published" : "draft"}">
                        ${story.status === "published" ? "Publicada" : "Rascunho"}
                    </span>
                </div>

                <h3>
                    ${escapeHtml(
                        story.title
                    )}
                </h3>

                <p>
                    ${escapeHtml(
                        story.description ||
                        "Sem descrição."
                    )}
                </p>

                <div class="rating-line">
                    <span>
                        ${ratingStars(
                            summary.average
                        )}
                    </span>

                    <span class="muted">
                        ${
                            summary.count
                                ? `${summary.average.toFixed(1)}/10 · ${summary.count} avaliações`
                                : "Sem avaliações da obra"
                        }
                    </span>
                </div>

                <div class="main-nav writer-card-actions">
                    <a
                        class="primary-button"
                        href="./story-editor.html?id=${story.id}"
                    >
                        Editar história
                    </a>

                    <a
                        class="secondary-button"
                        href="../historia.html?slug=${encodeURIComponent(story.slug)}"
                        target="_blank"
                        rel="noopener"
                    >
                        Ver publicação
                    </a>
                    <button
                        type="button"
                        class="secondary-button manage-story-reviews-button"
                        data-manage-story-reviews="${Number(story.id)}"
                        aria-pressed="false"
                    >
                        Gerenciar avaliações
                    </button>
                </div>
            </div>
        </article>
    `;
}

async function loadReviews(storyId) {
    const normalizedStoryId = Number(storyId);
    if (!Number.isSafeInteger(normalizedStoryId) || normalizedStoryId <= 0) {
        throw new Error("Selecione uma história válida para consultar as avaliações.");
    }

    const selectedStory = stories.find(
        (story) => Number(story.id) === normalizedStoryId,
    );
    const selectionHint = document.querySelector("#review-selection-hint");

    if (selectionHint) {
        if (selectedStory) {
            const roleLabel = selectedStory.collaboration_role === "coauthor"
                ? "Coautoria"
                : "Autoria principal";
            selectionHint.textContent = `Avaliações de “${selectedStory.title}” · ${roleLabel}`;
        } else {
            selectionHint.textContent = "Avaliações da história selecionada";
        }
    }

    document.querySelectorAll("[data-manage-story-reviews]").forEach((button) => {
        const isSelected = Number(button.dataset.manageStoryReviews) === normalizedStoryId;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
    });

    reviewList.innerHTML = `
        <article class="loading-card">
            Carregando avaliações...
        </article>
    `;

    try {
        const reviews = await getWriterReviews(normalizedStoryId);

        reviewList.innerHTML = reviews.length
            ? reviews.map((review) => {
                const isPublished = review.status === "published";
                return `
                    <article
                        class="review-card review-card-writer"
                        data-review-id="${Number(review.id)}"
                    >
                        <div class="review-card-content">
                            <div class="review-meta">
                                <strong>${escapeHtml(review.reader_name)}</strong>
                                <span class="review-rating-display" title="${Number(review.rating)}/10">
                                    ${ratingStars(review.rating)}
                                    <strong>${Number(review.rating)}/10</strong>
                                </span>
                            </div>
                            <p>${escapeHtml(review.content)}</p>
                            <small class="muted">
                                ${review.chapter_id ? "Episódio específico" : "Obra completa"}
                                · ${isPublished ? "Visível" : "Oculta"}
                            </small>
                        </div>
                        <div class="review-writer-actions">
                            <button
                                type="button"
                                class="secondary-button toggle-review-status-button"
                                data-next-status="${isPublished ? "hidden" : "published"}"
                                aria-label="${isPublished ? "Ocultar" : "Restaurar"} avaliação de ${escapeHtml(review.reader_name)}"
                            >
                                ${isPublished ? "Ocultar avaliação" : "Restaurar avaliação"}
                            </button>
                            <button
                                type="button"
                                class="danger-icon-button delete-review-button"
                                aria-label="Excluir avaliação de ${escapeHtml(review.reader_name)}"
                                title="Excluir avaliação"
                            >
                                ×
                            </button>
                        </div>
                    </article>
                `;
            }).join("")
            : `
                <article class="empty-card">
                    Essa história ainda não recebeu avaliações.
                </article>
            `;

        reviewList.querySelectorAll(".toggle-review-status-button").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();

                const card = event.currentTarget.closest("[data-review-id]");
                const reviewId = Number(card?.dataset.reviewId);
                const nextStatus = event.currentTarget.dataset.nextStatus;
                const readerName = card?.querySelector(".review-meta strong")?.textContent?.trim() || "este leitor";
                if (!Number.isSafeInteger(reviewId) || !["published", "hidden"].includes(nextStatus)) return;

                const hiding = nextStatus === "hidden";
                openConfirmModal({
                    eyebrow: "MODERAÇÃO",
                    title: hiding ? "Ocultar avaliação?" : "Restaurar avaliação?",
                    message: hiding
                        ? `Ocultar a avaliação de <strong>${escapeHtml(readerName)}</strong>?`
                        : `Tornar a avaliação de <strong>${escapeHtml(readerName)}</strong> visível novamente?`,
                    details: hiding
                        ? "A avaliação continuará no painel de moderação, mas deixará de aparecer publicamente."
                        : "A avaliação voltará a aparecer publicamente na obra ou no episódio correspondente.",
                    confirmLabel: hiding ? "Ocultar avaliação" : "Restaurar avaliação",
                    danger: false,
                    onConfirm: async () => {
                        await moderateReview(reviewId, nextStatus);
                        await loadReviews(normalizedStoryId);
                    },
                });
            });
        });

        reviewList.querySelectorAll(".delete-review-button").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();

                const card = event.currentTarget.closest("[data-review-id]");
                const reviewId = Number(card?.dataset.reviewId);
                const readerName = card?.querySelector(".review-meta strong")?.textContent?.trim() || "este leitor";
                const reviewText = card?.querySelector(".review-card-content p")?.textContent?.trim() || "";
                if (!Number.isSafeInteger(reviewId) || reviewId <= 0) return;

                openConfirmModal({
                    eyebrow: "MODERAÇÃO",
                    title: "Excluir avaliação?",
                    message: `Excluir permanentemente a avaliação de <strong>${escapeHtml(readerName)}</strong>?`,
                    details: `
                        <div class="review-delete-preview">
                            “${escapeHtml(reviewText.slice(0, 240))}${reviewText.length > 240 ? "…" : ""}”
                        </div>
                        <span>Use esta opção para remover avaliações ofensivas, ataques ou spam da obra.</span>
                    `,
                    confirmLabel: "Excluir avaliação",
                    onConfirm: async () => {
                        await deleteReview(reviewId);
                        await loadReviews(normalizedStoryId);
                    },
                });
            });
        });
    } catch (error) {
        console.error("[Writer Dashboard] Falha ao carregar/moderar avaliações:", error);
        reviewList.innerHTML = `
            <article class="error-card">
                Não foi possível carregar as avaliações desta obra. Verifique a conexão ou as permissões do Supabase e tente novamente.
            </article>
        `;
    }
}

function setDiscordLinkFeedback(message, kind = "") {
    if (!discordLinkFeedback) return;
    discordLinkFeedback.textContent = message;
    discordLinkFeedback.classList.toggle("error", kind === "error");
    discordLinkFeedback.classList.toggle("success", kind === "success");
    discordLinkFeedback.hidden = !message;
}

function setDiscordButtonState(linked) {
    if (!linkDiscordButton) return;

    linkDiscordButton.disabled = linked;
    linkDiscordButton.dataset.discordLinked = String(linked);
    linkDiscordButton.textContent = linked ? "Discord vinculado ✓" : "Vincular Discord";

    const tooltip = linked
        ? "Conta conectada ao Discord"
        : "Vincule uma vez para entrar pelo Discord nas próximas visitas.";
    if (discordLinkControl) discordLinkControl.title = tooltip;
    linkDiscordButton.setAttribute(
        "aria-label",
        linked
            ? "Discord vinculado. Conta conectada ao Discord."
            : "Vincular Discord à conta atual.",
    );
}

async function refreshDiscordLinkStatus() {
    if (!linkDiscordButton) return false;

    try {
        const identities = await getCurrentUserIdentities();
        const linked = identities.some((identity) => identity.provider === "discord");
        const user = await getCurrentUser();
        if (user) rememberWriterLoginState(user, { isWriter: true, identities });
        setDiscordButtonState(linked);
        return linked;
    } catch (error) {
        console.warn("[Writer Dashboard] Não foi possível consultar o vínculo do Discord:", error);
        const message = "Não foi possível consultar o vínculo do Discord.";
        if (discordLinkControl) discordLinkControl.title = message;
        linkDiscordButton.setAttribute("aria-label", message);
        linkDiscordButton.disabled = false;
        return false;
    }
}

function discordLinkResultMessage(reason) {
    const messages = {
        identity_already_exists: "Esta conta do Discord já está vinculada a outra conta do Universo dos Crias. O Supabase não permite associar a mesma identidade Discord a duas contas. Entre na conta correspondente ou procure o administrador para regularizar a associação.",
        manual_linking_disabled: "A vinculação manual está desativada na configuração de autenticação do Supabase. Procure o administrador do projeto.",
        authorization_denied: "A autorização do Discord foi cancelada ou negada. Nenhum vínculo foi criado.",
        pkce_failed: "O navegador não conseguiu concluir a verificação segura do retorno OAuth (PKCE). Abra o site no navegador normal, sem modo anônimo, e tente novamente na mesma aba.",
        session_missing: "O retorno do Discord chegou, mas a sessão do escritor não foi recuperada. Entre novamente com as credenciais atuais e tente vincular de novo.",
        session_changed: "A conta autenticada mudou durante a autorização. Por segurança, o vínculo foi interrompido. Entre na conta de escritor correta e tente novamente.",
        pending_missing: "Não encontramos a solicitação de vínculo iniciada neste navegador. Volte ao portal, entre na conta de escritor e inicie a vinculação novamente.",
        not_confirmed: "O Discord retornou ao site, mas o Supabase não confirmou o vínculo. A identidade pode já estar associada a outra conta ou o navegador não preservou o estado da autorização. Tente pelo Chrome/Safari normal, na mesma aba; se persistir, envie esta mensagem para investigarmos.",
        oauth_error: "O Discord ou o Supabase retornou um erro durante a vinculação. Tente novamente; se persistir, envie uma captura da mensagem para investigarmos."
    };
    return messages[reason] || messages.oauth_error;
}

async function handleDiscordLinkResult() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("discord-link-result");
    if (!result) return;

    // Atualiza o botão somente depois que a página de retorno terminou de validar a identidade.
    const linked = await refreshDiscordLinkStatus();

    if (result === "success" && linked) {
        setDiscordLinkFeedback(
            "Discord vinculado com sucesso! Nas próximas visitas, você poderá entrar com esse Discord.",
            "success",
        );
    } else {
        setDiscordLinkFeedback(
            discordLinkResultMessage(result === "success" ? "not_confirmed" : params.get("reason")),
            "error",
        );
    }

    // Remove os indicadores da URL sem mexer na sessão salva pelo Supabase.
    params.delete("discord-link-result");
    params.delete("reason");
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    history.replaceState({}, "", cleanUrl);
}

if (linkDiscordButton) {
    linkDiscordButton.addEventListener("click", async () => {
        // Uma conta já vinculada usa o botão apenas como indicador de estado.
        if (linkDiscordButton.dataset.discordLinked === "true") return;

        linkDiscordButton.disabled = true;
        setDiscordLinkFeedback("Abrindo o Discord para confirmar o vínculo…");
        if (discordLinkControl) {
            discordLinkControl.title = "Abrindo o Discord para vincular…";
        }

        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error("Sua sessão expirou. Entre novamente antes de vincular o Discord.");
            }

            // Não é segredo: guarda apenas a identidade que iniciou o vínculo e o horário.
            // O callback compara o usuário retornado para impedir confirmação na conta errada.
            localStorage.setItem(
                DISCORD_LINK_PENDING_KEY,
                JSON.stringify({ userId: user.id, startedAt: Date.now() }),
            );

            const redirectTo = new URL("./discord-callback.html", window.location.href).href;
            await linkDiscordIdentity(redirectTo);
        } catch (error) {
            console.error("[Writer Dashboard] Falha ao vincular Discord:", error);
            localStorage.removeItem(DISCORD_LINK_PENDING_KEY);
            setDiscordLinkFeedback(
                error?.message || "Não foi possível iniciar o vínculo com o Discord. Tente novamente.",
                "error",
            );
            if (discordLinkControl) {
                discordLinkControl.title = "Não foi possível iniciar o vínculo.";
            }
            linkDiscordButton.disabled = false;
        }
    });
}

async function loadStories() {
    try {
        const writer =
            await getMyWriterAccount();

        writerName.textContent =
            writer?.auth_user?.email ||
            "Escritor";

        stories =
            await getMyStories();

        if (!stories.length) {
            grid.innerHTML = `
                <article class="empty-card">
                    Você ainda não possui histórias ou obras compartilhadas.
                </article>
            `;
            const selectionHint = document.querySelector("#review-selection-hint");
            if (selectionHint) selectionHint.textContent = "Nenhuma obra disponível para acompanhar.";
            reviewList.innerHTML = `
                <article class="empty-card">
                    Crie uma história ou peça para ser adicionado como coautor para acompanhar as avaliações.
                </article>
            `;
            return;
        }

        const cards =
            await Promise.all(
                stories.map(
                    async (story) => {
                        let summary = {
                            average: 0,
                            count: 0,
                        };

                        try {
                            summary =
                                await getStoryReviewSummary(
                                    story.id
                                );
                        } catch (
                            summaryError
                        ) {
                            console.warn(
                                summaryError
                            );
                        }

                        return await storyCard(
                            story,
                            summary
                        );
                    }
                )
            );

        grid.innerHTML =
            cards.join("");

        document.querySelectorAll(".writer-story-card").forEach((card) => {
            const id = Number(card.dataset.storyId);
            card.addEventListener("click", (event) => {
                if (event.target.closest("a, button")) return;
                loadReviews(id);
            });
        });

        document.querySelectorAll("[data-manage-story-reviews]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const storyId = Number(button.dataset.manageStoryReviews);
                if (!Number.isSafeInteger(storyId) || storyId <= 0) return;
                loadReviews(storyId);
                reviewList.closest(".panel-section")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            });
        });

        // Carrega uma história inicial (própria ou em coautoria), mas o usuário
        // também pode trocar explicitamente pelo botão de cada card.
        await loadReviews(stories[0].id);
    } catch (error) {
        console.error(error);

        grid.innerHTML = `
            <article class="error-card">
                Não foi possível carregar suas histórias.
            </article>
        `;
    }
}

form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        showMessage(
            createMessage,
            "Criando história..."
        );

        try {
            const title =
                dialog.querySelector(
                    "#new-story-title"
                ).value.trim();

            const description =
                dialog.querySelector(
                    "#new-story-description"
                ).value.trim();
            const genres = readSelectedStoryGenres(form);

            const story =
                await createStory({
                    title,
                    description,
                    genres,
                    coverType: "none",
                    coverUrl: null,
                    coverPath: null,
                });

            // A capa e demais detalhes serão ajustados
            // já no editor da nova obra.
            dialog.close();

            location.href =
                `./story-editor.html?id=${story.id}`;
        } catch (error) {
            console.error(error);

            showMessage(
                createMessage,
                error.message ||
                    "Não foi possível criar a história.",
                "error",
            );
        }
    }
);

async function validatePendingDiscordLogin() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("discord-login") !== "1") {
        // Remove tentativas expiradas que tenham ficado no navegador.
        clearPendingDiscordLoginIfExpired();
        return true;
    }

    const pending = readPendingDiscordLogin();
    clearPendingDiscordLogin();
    const user = await getCurrentUser();

    // O login por Discord só deve abrir o portal se retornar exatamente para a
    // conta de escritor que foi verificada antes de iniciar o OAuth.
    if (!pending || !user || user.id !== pending.authUserId) {
        if (pending) invalidateRememberedDiscordLink(pending.email, pending.authUserId);
        try { await signOut(); } catch (error) {
            console.warn("[Writer Dashboard] Não foi possível encerrar a sessão Discord inesperada:", error);
        }
        location.replace("./login.html?error=discord-account-mismatch");
        return false;
    }

    params.delete("discord-login");
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    history.replaceState({}, "", cleanUrl);
    return true;
}

async function init() {
    // Valida a identidade retornada pelo OAuth antes de carregar dados do portal.
    if (!(await validatePendingDiscordLogin())) return;

    const writer = await getMyWriterAccount();
    if (!writer) {
        location.href = "./login.html?error=not-writer";
        return;
    }

    await refreshDiscordLinkStatus();
    await handleDiscordLinkResult();
    await loadStories();
}

init();
