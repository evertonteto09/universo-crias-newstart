import { setupTheme } from "../core/theme.js";
import { setupProfanityFilter } from "../core/profanity-filter.js";
import {
    escapeHtml,
    ratingStars,
    storyCoverSource,
    showMessage,
} from "../core/utils.js";

import {
    getPublishedStoryBySlug,
} from "../services/story.service.js";

import {
    getStoryCoverUrl,
} from "../services/storage.service.js";

import {
    getCurrentUser,
} from "../services/auth.service.js";

import {
    getMyWriterAccount,
} from "../services/writer.service.js";

import {
    getPublishedStoryReviews,
    submitReview,
} from "../services/review.service.js";

import {
    getPublishedStoryNews,
} from "../services/news.service.js";

setupTheme();
setupProfanityFilter();

const page =
    document.querySelector("#story-page");

const slug =
    new URLSearchParams(location.search)
        .get("slug");

function notFound() {
    page.innerHTML = `
        <section class="empty-state">
            <span class="eyebrow">404</span>
            <h1>História não encontrada</h1>
            <a class="primary-button" href="./index.html">
                Voltar
            </a>
        </section>
    `;
}

function renderReview(review) {
    return `
        <article class="review-card">
            <div class="review-meta">
                <strong>
                    ${escapeHtml(review.reader_name)}
                </strong>

                <span title="${review.rating}/5">
                    ${ratingStars(review.rating)}
                </span>
            </div>

            <p class="review-text">${escapeHtml(review.content)}</p>
        </article>
    `;
}

function calculateAverage(reviews) {
    if (!reviews.length) {
        return 0;
    }

    return (
        reviews.reduce(
            (sum, review) =>
                sum + Number(review.rating || 0),
            0,
        ) / reviews.length
    );
}

async function renderStoryReviewForm(
    story,
    reviews,
) {
    const summaryAverage =
        calculateAverage(reviews);

    let isOwnStory =
        false;

    // Se estiver logado como escritor dono da obra,
    // não mostramos o formulário de avaliação.
    try {
        const user =
            await getCurrentUser();

        if (user) {
            const writer =
                await getMyWriterAccount();

            isOwnStory =
                Boolean(
                    writer &&
                    writer.writer_id ===
                        story.writer_id
                );
        }
    } catch (error) {
        // Leitor anônimo não precisa de conta.
        console.debug(
            "[Own story check]",
            error,
        );
    }

    const formArea =
        isOwnStory
            ? `
                <div class="owner-review-notice">
                    <strong>
                        Você é o escritor desta obra.
                    </strong>

                    <p>
                        A avaliação da própria obra não está
                        disponível no Portal do Escritor.
                    </p>
                </div>
              `
            : `
                <form
                    id="story-review-form"
                    class="review-form"
                >
                    <div class="review-rating-picker">
                        <span class="eyebrow">
                            SUA NOTA
                        </span>

                        <div
                            class="star-picker"
                            role="radiogroup"
                            aria-label="Escolha uma nota de 1 a 5 estrelas"
                        >
                            ${[5, 4, 3, 2, 1]
                                .map(
                                    (value) => `
                                        <input
                                            type="radio"
                                            id="story-rating-${value}"
                                            name="story-rating"
                                            value="${value}"
                                            ${value === 5 ? "checked" : ""}
                                        >

                                        <label
                                            for="story-rating-${value}"
                                            title="${value} estrelas"
                                        >
                                            ★
                                        </label>
                                    `
                                )
                                .join("")}
                        </div>
                    </div>

                    <label>
                        Seu nome
                        <input
                            id="story-reader-name"
                            maxlength="80"
                            required
                        >
                    </label>

                    <label>
                        Sua avaliação
                        <textarea
                            id="story-review-content"
                            maxlength="3000"
                            rows="6"
                            required
                            placeholder="Conte o que achou da obra..."
                        ></textarea>
                    </label>

                    <button
                        class="primary-button"
                        type="submit"
                    >
                        Publicar avaliação
                    </button>

                    <p
                        id="story-review-message"
                        class="form-message"
                        role="alert"
                        aria-live="polite"
                    ></p>
                </form>
              `;

    const reviewsHtml =
        reviews.length
            ? reviews.map(renderReview).join("")
            : `
                <article class="empty-card">
                    Ainda não há avaliações desta obra.
                </article>
              `;

    return `
        <div class="review-summary-large">
            <div>
                <strong>
                    ${
                        reviews.length
                            ? summaryAverage.toFixed(1)
                            : "—"
                    }
                </strong>

                <span>
                    ${
                        reviews.length
                            ? ratingStars(summaryAverage)
                            : "☆☆☆☆☆"
                    }
                </span>
            </div>

            <p class="muted">
                ${
                    reviews.length
                        ? `${reviews.length} ${
                            reviews.length === 1
                                ? "avaliação"
                                : "avaliações"
                          }`
                        : "Nenhuma avaliação ainda"
                }
            </p>
        </div>

        ${formArea}

        <div
            id="story-review-list"
            class="review-list"
        >
            ${reviewsHtml}
        </div>
    `;
}


function formatNewsDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "medium",
            timeStyle: "short",
        },
    ).format(date);
}

function renderNews(news) {
    return `
        <article class="news-card">
            <div class="news-card-meta">
                <span class="eyebrow">
                    NOTÍCIA DA OBRA
                </span>

                <time datetime="${escapeHtml(news.created_at || "")}">
                    ${escapeHtml(
                        formatNewsDate(news.created_at)
                    )}
                </time>
            </div>

            <h3>
                ${escapeHtml(news.title)}
            </h3>

            <div class="news-card-content">${escapeHtml(
                String(news.content ?? "").trim()
            )}</div>
        </article>
    `;
}

function renderNewsPanel(news) {
    const content =
        news.length
            ? `
                <div class="news-list">
                    ${news.map(renderNews).join("")}
                </div>
              `
            : `
                <article class="empty-card">
                    <span class="eyebrow">
                        NOTÍCIAS
                    </span>

                    <h3>
                        Nenhuma novidade publicada ainda.
                    </h3>

                    <p class="muted">
                        Quando o escritor publicar uma novidade
                        sobre esta obra, ela aparecerá aqui.
                    </p>
                </article>
              `;

    return `
        <section class="story-tab-panel" data-story-tab-panel="news" hidden>
            <div class="section-heading">
                <div>
                    <span class="eyebrow">
                        NOVIDADES
                    </span>

                    <h2>
                        Notícias da história
                    </h2>
                </div>

                <span class="muted">
                    ${news.length}
                    ${news.length === 1 ? "publicação" : "publicações"}
                </span>
            </div>

            ${content}
        </section>
    `;
}

function setupStoryTabs() {
    const tabs =
        [...document.querySelectorAll(
            "[data-story-tab]"
        )];

    const panels =
        [...document.querySelectorAll(
            "[data-story-tab-panel]"
        )];

    if (!tabs.length || !panels.length) {
        return;
    }

    const activate = (target) => {
        for (const tab of tabs) {
            const active =
                tab.dataset.storyTab === target;

            tab.classList.toggle(
                "active",
                active,
            );

            tab.setAttribute(
                "aria-selected",
                String(active),
            );
        }

        for (const panel of panels) {
            panel.hidden =
                panel.dataset.storyTabPanel !== target;
        }
    };

    for (const tab of tabs) {
        tab.addEventListener(
            "click",
            () => {
                activate(
                    tab.dataset.storyTab
                );
            },
        );
    }

    activate("chapters");
}

async function load() {
    if (!slug) {
        notFound();
        return;
    }

    try {
        const story =
            await getPublishedStoryBySlug(
                slug,
            );

        const cover =
            storyCoverSource(
                story,
                getStoryCoverUrl,
            );

        const seasons =
            (story.seasons ?? [])
                .map((season) => {
                    const chapters =
                        (season.chapters ?? [])
                            .sort(
                                (a, b) =>
                                    a.number -
                                    b.number,
                            )
                            .map(
                                (chapter) => `
                                    <a
                                        class="chapter-row"
                                        href="./episodio.html?slug=${encodeURIComponent(
                                            story.slug
                                        )}&season=${season.number}&episode=${chapter.number}"
                                    >
                                        <span class="chapter-number">
                                            ${
                                                chapter.number === 0
                                                    ? "Piloto"
                                                    : `Ep. ${chapter.number}`
                                            }
                                        </span>

                                        <span>
                                            ${escapeHtml(
                                                chapter.title
                                            )}
                                        </span>
                                    </a>
                                `
                            )
                            .join("");

                    return `
                        <section class="season-card">
                            <div class="season-heading">
                                <span class="eyebrow">
                                    TEMPORADA ${season.number}
                                </span>

                                <h2>
                                    ${escapeHtml(
                                        season.title
                                    )}
                                </h2>
                            </div>

                            <div class="chapter-list">
                                ${
                                    chapters ||
                                    `<p class="muted">
                                        Nenhum episódio publicado.
                                    </p>`
                                }
                            </div>
                        </section>
                    `;
                })
                .join("");

        let reviews = [];

        try {
            reviews =
                await getPublishedStoryReviews(
                    story.id,
                );
        } catch (reviewError) {
            console.warn(
                "[Reviews]",
                reviewError,
            );
        }

        let news = [];

        try {
            news =
                await getPublishedStoryNews(
                    story.id,
                );
        } catch (newsError) {
            console.warn(
                "[News]",
                newsError,
            );
        }

        page.innerHTML = `
            <section class="story-hero">
                <img
                    class="story-hero-cover"
                    src="${cover}"
                    alt="Capa de ${escapeHtml(story.title)}"
                >

                <div>
                    <span class="eyebrow">HISTÓRIA</span>

                    <h1>
                        ${escapeHtml(story.title)}
                    </h1>

                    <p>
                        ${escapeHtml(
                            story.description ||
                            "Sem descrição disponível."
                        )}
                    </p>

                    <div
                        id="story-rating-summary"
                        class="rating-summary"
                    ></div>
                </div>
            </section>

            <nav
                class="story-tabs"
                role="tablist"
                aria-label="Conteúdo da história"
            >
                <button
                    type="button"
                    class="story-tab active"
                    data-story-tab="chapters"
                    role="tab"
                    aria-selected="true"
                >
                    📖 Episódios
                </button>

                <button
                    type="button"
                    class="story-tab"
                    data-story-tab="news"
                    role="tab"
                    aria-selected="false"
                >
                    📰 Notícias
                </button>

                <button
                    type="button"
                    class="story-tab"
                    data-story-tab="reviews"
                    role="tab"
                    aria-selected="false"
                >
                    ⭐ Avaliações
                </button>
            </nav>

            <section
                class="story-tab-panel"
                data-story-tab-panel="chapters"
            >
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            EPISÓDIOS
                        </span>

                        <h2>
                            Temporadas
                        </h2>
                    </div>
                </div>

                <div class="season-stack">
                    ${
                        seasons ||
                        `<article class="empty-card">
                            Nenhum episódio publicado.
                        </article>`
                    }
                </div>
            </section>

            ${renderNewsPanel(news)}

            <section
                class="review-section story-tab-panel"
                data-story-tab-panel="reviews"
                hidden
            >
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            FEEDBACK DA OBRA
                        </span>

                        <h2>
                            Avaliações da história
                        </h2>
                    </div>
                </div>

                <div id="story-reviews"></div>
            </section>
        `;

        setupStoryTabs();

        const reviewsRoot =
            document.querySelector(
                "#story-reviews"
            );

        reviewsRoot.innerHTML =
            await renderStoryReviewForm(
                story,
                reviews,
            );

        const average =
            calculateAverage(reviews);

        document.querySelector(
            "#story-rating-summary"
        ).innerHTML = `
            <span>
                ${
                    reviews.length
                        ? ratingStars(average)
                        : "☆☆☆☆☆"
                }
            </span>

            <span class="muted">
                ${
                    reviews.length
                        ? `${average.toFixed(1)} · ${reviews.length} avaliações`
                        : "Ainda sem avaliações"
                }
            </span>
        `;

        const form =
            document.querySelector(
                "#story-review-form"
            );

        if (!form) {
            return;
        }

        const message =
            document.querySelector(
                "#story-review-message"
            );

        form.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();

                showMessage(
                    message,
                    "Enviando avaliação..."
                );

                try {
                    const rating =
                        Number(
                            form.querySelector(
                                'input[name="story-rating"]:checked'
                            )?.value
                        );

                    await submitReview({
                        storyId: story.id,
                        chapterId: null,
                        readerName:
                            document.querySelector(
                                "#story-reader-name"
                            ).value,
                        rating,
                        content:
                            document.querySelector(
                                "#story-review-content"
                            ).value,
                    });

                    showMessage(
                        message,
                        "Avaliação publicada!",
                        "success",
                    );

                    form.reset();

                    const updatedReviews =
                        await getPublishedStoryReviews(
                            story.id,
                        );

                    reviewsRoot.innerHTML =
                        await renderStoryReviewForm(
                            story,
                            updatedReviews,
                        );

                    const updatedAverage =
                        calculateAverage(
                            updatedReviews
                        );

                    document.querySelector(
                        "#story-rating-summary"
                    ).innerHTML = `
                        <span>
                            ${ratingStars(updatedAverage)}
                        </span>

                        <span class="muted">
                            ${updatedAverage.toFixed(1)} · ${updatedReviews.length} avaliações
                        </span>
                    `;
                } catch (error) {
                    console.error(error);

                    showMessage(
                        message,
                        error.message ||
                            "Não foi possível enviar a avaliação.",
                        "error",
                    );
                }
            }
        );
    } catch (error) {
        console.error(error);
        notFound();
    }
}

load();
