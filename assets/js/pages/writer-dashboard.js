import { setupTheme } from "../core/theme.js";
import { openConfirmModal } from "../core/modal.js";
import {
    escapeHtml,
    storyCoverSource,
    ratingStars,
    showMessage,
} from "../core/utils.js";

import { signOut, linkDiscordIdentity, getCurrentUserIdentities, getCurrentUser } from "../services/auth.service.js";
import { rememberWriterLoginState, readPendingDiscordLogin, clearPendingDiscordLogin, clearPendingDiscordLoginIfExpired, invalidateRememberedDiscordLink } from "../services/local-account-state.service.js?v=20261024-local-login-state-2";
import {
    getMyWriterAccount,
    getMyStories,
    createStory,
} from "../services/writer.service.js";

import {
    getStoryReviewSummary,
    getWriterStoryById,
} from "../services/story.service.js";

import {
    getWriterReviews,
    deleteReview,
} from "../services/review.service.js";

import {
    getStoryCoverUrl,
    uploadStoryCover,
} from "../services/storage.service.js";

import {
    initCriasPresence,
} from "../services/crias-presence.service.js";

setupTheme();

const criasPresence = initCriasPresence({
    details: "No portal do Escritor",
    state: "Universo dos Crias",
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

    return `
        <article
            class="writer-story-card"
            data-story-id="${story.id}"
        >
            <img
                class="story-cover"
                src="${escapeHtml(cover)}"
                alt=""
                loading="lazy"
            >

            <div>
                <div class="writer-story-meta">
                    <span class="eyebrow">MINHA OBRA</span>
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
                </div>
            </div>
        </article>
    `;
}

async function loadReviews(
    storyId,
) {
    reviewList.innerHTML = `
        <article class="loading-card">
            Carregando avaliações...
        </article>
    `;

    try {
        const reviews =
            await getWriterReviews(
                storyId
            );

        reviewList.innerHTML =
            reviews.length
                ? reviews
                    .map(
                        (review) => `
                            <article
                                class="review-card review-card-writer"
                                data-review-id="${review.id}"
                            >
                                <div class="review-card-content">
                                    <div class="review-meta">
                                        <strong>
                                            ${escapeHtml(
                                                review.reader_name
                                            )}
                                        </strong>

                                        <span class="review-rating-display" title="${review.rating}/10">
                                            ${ratingStars(review.rating)}
                                            <strong>${Number(review.rating)}/10</strong>
                                        </span>
                                    </div>

                                    <p>
                                        ${escapeHtml(
                                            review.content
                                        )}
                                    </p>

                                    <small class="muted">
                                        ${
                                            review.chapter_id
                                                ? "Episódio específico"
                                                : "Obra completa"
                                        }
                                        ·
                                        ${
                                            review.status ===
                                            "published"
                                                ? "Visível"
                                                : "Oculta"
                                        }
                                    </small>
                                </div>

                                <button
                                    type="button"
                                    class="danger-icon-button delete-review-button"
                                    aria-label="Excluir avaliação de ${escapeHtml(review.reader_name)}"
                                    title="Excluir avaliação"
                                >
                                    ×
                                </button>
                            </article>
                        `
                    )
                    .join("")
                : `
                    <article class="empty-card">
                        Essa história ainda não recebeu avaliações.
                    </article>
                `;

        document
            .querySelectorAll(
                ".delete-review-button"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        const card =
                            event.currentTarget.closest(
                                "[data-review-id]"
                            );

                        const reviewId =
                            Number(
                                card.dataset.reviewId
                            );

                        const readerName =
                            card.querySelector(
                                ".review-meta strong"
                            )?.textContent?.trim() ||
                            "este leitor";

                        const reviewText =
                            card.querySelector(
                                ".review-card-content p"
                            )?.textContent?.trim() ||
                            "";

                        openConfirmModal({
                            eyebrow: "MODERAÇÃO",
                            title: "Excluir avaliação?",
                            message: `Excluir permanentemente a avaliação de <strong>${escapeHtml(readerName)}</strong>?`,
                            details: `
                                <div class="review-delete-preview">
                                    “${escapeHtml(reviewText.slice(0, 240))}${reviewText.length > 240 ? "…" : ""}”
                                </div>
                                <span>
                                    Use esta opção para remover avaliações ofensivas,
                                    ataques ou spam da obra.
                                </span>
                            `,
                            confirmLabel: "Excluir avaliação",
                            onConfirm: async () => {
                                await deleteReview(
                                    reviewId
                                );

                                await loadReviews(
                                    storyId
                                );
                            },
                        });
                    },
                );
            });
    } catch (error) {
        console.error(error);

        reviewList.innerHTML = `
            <article class="error-card">
                Não foi possível carregar as avaliações.
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
                    Você ainda não possui histórias.
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

        document
            .querySelectorAll(
                ".writer-story-card"
            )
            .forEach((card) => {
                const id =
                    Number(
                        card.dataset.storyId
                    );

                card.addEventListener(
                    "click",
                    (event) => {
                        if (
                            event.target.closest(
                                "a"
                            )
                        ) {
                            return;
                        }

                        loadReviews(id);
                    }
                );
            });

        // Mostra feedback da primeira história
        // para não deixar a seção vazia no desktop.
        await loadReviews(
            stories[0].id
        );
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

            const story =
                await createStory({
                    title,
                    description,
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
