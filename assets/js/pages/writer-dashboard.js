import { setupTheme } from "../core/theme.js";
import { openConfirmModal } from "../core/modal.js";
import {
    escapeHtml,
    storyCoverSource,
    ratingStars,
    showMessage,
} from "../core/utils.js";

import { signOut } from "../services/auth.service.js";
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

setupTheme();

const writerName =
    document.querySelector(
        "#writer-name"
    );

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

function storyCard(story, summary) {
    const cover =
        storyCoverSource(
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
                src="${cover}"
                alt=""
                loading="lazy"
            >

            <div>
                <span class="eyebrow">
                    MINHA OBRA
                </span>

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
                                ? `${summary.average.toFixed(1)} · ${summary.count} avaliações`
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

                                        <span>
                                            ${ratingStars(
                                                review.rating
                                            )}
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

                        return storyCard(
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

async function init() {
    const writer =
        await getMyWriterAccount();

    if (!writer) {
        location.href =
            "./login.html";
        return;
    }

    await loadStories();
}

init();
