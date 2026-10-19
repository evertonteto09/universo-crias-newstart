import { setupTheme } from "../core/theme.js";
import {
    setupProfanityFilter,
    filterProfanity,
} from "../core/profanity-filter.js";

import {
    escapeHtml,
    showMessage,
    ratingStars,
} from "../core/utils.js";

import {
    renderDynamicContent,
    bindDynamicText,
} from "../core/dynamic-text.js";

import {
    getPublishedChapter,
} from "../services/chapter.service.js";

import {
    getPublishedChapterReviews,
    submitReview,
} from "../services/review.service.js";

import {
    initCriasPresence,
} from "../services/crias-presence.service.js";

import {
    setupReadingBookmarkUI,
} from "../services/reading-bookmark.service.js";

setupTheme();
setupProfanityFilter();

const criasPresence = initCriasPresence({
    details: "Lendo um episódio",
    state: "Universo dos Crias",
});

const page =
    document.querySelector("#chapter-page");

const params =
    new URLSearchParams(location.search);

const slug =
    params.get("slug");

const seasonNumber =
    Number(params.get("season"));

const episodeNumber =
    Number(params.get("episode"));

let currentStory = null;
let currentSeason = null;
let currentChapter = null;
let publishedChapters = [];
let refreshReadingBookmarkUI = () => {};

async function renderContent(content) {
    const source = String(content ?? "");
    return renderDynamicContent(
        filterProfanity(source),
        source,
    );
}

function notFound() {
    page.innerHTML = `
        <section class="empty-state">
            <span class="eyebrow">
                LEITURA
            </span>

            <h1>
                Episódio não encontrado
            </h1>

            <a
                class="primary-button"
                href="./index.html"
            >
                Voltar
            </a>
        </section>
    `;
}

function chapterHref(item) {
    return `
        ./episodio.html?slug=${encodeURIComponent(
            currentStory.slug
        )}&season=${item.season_number}&episode=${item.number}
    `;
}

function renderNavigation() {
    const index =
        publishedChapters.findIndex(
            (item) =>
                item.id ===
                currentChapter.id
        );

    const previous =
        index > 0
            ? publishedChapters[index - 1]
            : null;

    const next =
        index >= 0 &&
        index <
            publishedChapters.length - 1
            ? publishedChapters[index + 1]
            : null;

    return `
        <nav
            class="chapter-navigation"
            aria-label="Navegação entre episódios"
        >
            ${
                previous
                    ? `
                        <a
                            class="chapter-nav-button"
                            href="${chapterHref(previous)}"
                        >
                            <span>← Anterior</span>
                            <strong>
                                ${
                                    previous.number === 0
                                        ? "Piloto"
                                        : `Episódio ${previous.number}`
                                }
                            </strong>
                            <small>
                                ${escapeHtml(
                                    previous.title
                                )}
                            </small>
                        </a>
                      `
                    : `
                        <span
                            class="chapter-nav-button disabled"
                            aria-disabled="true"
                        >
                            <span>← Anterior</span>
                            <strong>Início</strong>
                            <small>Este é o primeiro episódio publicado.</small>
                        </span>
                      `
            }

            <a
                class="chapter-nav-center"
                href="./historia.html?slug=${encodeURIComponent(
                    currentStory.slug
                )}"
            >
                Episódios
            </a>

            ${
                next
                    ? `
                        <a
                            class="chapter-nav-button align-right"
                            href="${chapterHref(next)}"
                        >
                            <span>Próximo →</span>
                            <strong>
                                ${
                                    next.number === 0
                                        ? "Piloto"
                                        : `Episódio ${next.number}`
                                }
                            </strong>
                            <small>
                                ${escapeHtml(
                                    next.title
                                )}
                            </small>
                        </a>
                      `
                    : `
                        <span
                            class="chapter-nav-button align-right disabled"
                            aria-disabled="true"
                        >
                            <span>Próximo →</span>
                            <strong>Fim</strong>
                            <small>Você chegou ao último episódio publicado.</small>
                        </span>
                      `
            }
        </nav>
    `;
}

async function loadReviews() {
    const reviewList =
        document.querySelector(
            "#review-list"
        );

    if (!reviewList) return;

    const reviews =
        await getPublishedChapterReviews(
            currentChapter.id,
        );

    const ratingSummary = document.querySelector("#chapter-rating-summary");
    if (ratingSummary) {
        const average = reviews.length
            ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
            : 0;
        ratingSummary.innerHTML = `
            <span>${ratingStars(average)}</span>
            <span class="muted">${reviews.length ? `${average.toFixed(1)}/10 · ${reviews.length} avaliações` : "Ainda sem avaliações"}</span>
        `;
    }

    reviewList.innerHTML =
        reviews.length
            ? reviews
                .map(
                    (review) => `
                        <article
                            class="review-card"
                        >
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

                            <p class="review-text">${escapeHtml(
                                review.content
                            )}</p>
                        </article>
                    `
                )
                .join("")
            : `
                <article class="empty-card">
                    Ainda não há avaliações neste episódio.
                </article>
              `;
}

function bindReviewForm() {
    const reviewForm =
        document.querySelector(
            "#review-form"
        );

    if (!reviewForm) return;

    const message =
        document.querySelector(
            "#review-message"
        );

    reviewForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            showMessage(
                message,
                "Enviando avaliação..."
            );

            try {
                await submitReview({
                    storyId:
                        currentStory.id,
                    chapterId:
                        currentChapter.id,
                    readerName:
                        document.querySelector(
                            "#reader-name"
                        ).value,
                    rating:
                        Number(
                            reviewForm.querySelector(
                                'input[name="chapter-rating"]:checked'
                            )?.value,
                        ),
                    content:
                        document.querySelector(
                            "#reader-content"
                        ).value,
                });

                reviewForm.reset();

                showMessage(
                    message,
                    "Avaliação publicada!",
                    "success",
                );

                await loadReviews();
            } catch (error) {
                console.error(error);

                showMessage(
                    message,
                    error.message ||
                        "Não foi possível enviar a avaliação.",
                    "error",
                );
            }
        },
    );
}

async function renderPage() {
    const renderedContent =
        await renderContent(
            currentChapter.content,
        );

    page.innerHTML = `
        <article class="reader-page">

            <div class="reader-header">
                <a
                    class="text-link"
                    href="./historia.html?slug=${encodeURIComponent(
                        currentStory.slug
                    )}"
                >
                    ← ${escapeHtml(
                        currentStory.title
                    )}
                </a>

                <span class="eyebrow">
                    ${escapeHtml(
                        currentSeason.title
                    )}
                </span>

                <h1>
                    ${escapeHtml(
                        currentChapter.title
                    )}
                </h1>

                <p class="muted">
                    ${
                        currentChapter.number === 0
                            ? "Piloto"
                            : `Episódio ${currentChapter.number}`
                    }
                </p>

                <div id="chapter-rating-summary" class="rating-summary"></div>
            </div>

            <section class="reader-content">
                <div
                    id="reading-bookmark-toolbar"
                    class="reading-bookmark-toolbar"
                    aria-live="polite"
                ></div>
                <div id="chapter-content-rendered">
                    ${renderedContent}
                </div>
            </section>

            ${renderNavigation()}

            <section class="review-section">
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            FEEDBACK
                        </span>

                        <h2>
                            Avaliações deste episódio
                        </h2>
                    </div>
                </div>

                <form
                    id="review-form"
                    class="review-form"
                >
                    <label>
                        Seu nome
                        <input
                            id="reader-name"
                            maxlength="80"
                            required
                        >
                    </label>

                    <div class="review-rating-picker">
                        <span class="eyebrow">SUA NOTA</span>
                        <div
                            class="star-picker"
                            role="radiogroup"
                            aria-label="Escolha uma nota de 1 a 10 estrelas"
                        >
                            ${Array.from({ length: 10 }, (_, index) => 10 - index).map((value) => `
                                <input
                                    type="radio"
                                    id="chapter-rating-${value}"
                                    name="chapter-rating"
                                    value="${value}"
                                    required
                                >
                                <label for="chapter-rating-${value}" title="${value}/10">★</label>
                            `).join("")}
                        </div>
                    </div>

                    <label>
                        Sua avaliação
                        <textarea
                            id="reader-content"
                            maxlength="3000"
                            rows="6"
                            required
                        ></textarea>
                    </label>

                    <button
                        class="primary-button"
                        type="submit"
                    >
                        Publicar avaliação
                    </button>

                    <p
                        id="review-message"
                        class="form-message"
                        role="alert"
                        aria-live="polite"
                    ></p>
                </form>

                <div
                    id="review-list"
                    class="review-list"
                >
                    <article class="loading-card">
                        Carregando avaliações...
                    </article>
                </div>
            </section>
        </article>
    `;
}

async function load() {
    if (
        !slug ||
        Number.isNaN(seasonNumber) ||
        Number.isNaN(episodeNumber)
    ) {
        notFound();
        return;
    }

    try {
        const result =
            await getPublishedChapter(
                slug,
                seasonNumber,
                episodeNumber,
            );

        if (!result) {
            notFound();
            return;
        }

        currentStory =
            result.story;

        currentSeason =
            result.season;

        currentChapter =
            result.chapter;

        const episodeLabel =
            currentChapter.number === 0
                ? "Piloto"
                : `Episódio ${currentChapter.number}`;
        
        criasPresence.update({
            details: `Lendo: ${currentStory.title || "uma história"}`,
            state: `${episodeLabel}: ${currentChapter.title || "Sem título"}`,
        });

        publishedChapters =
            (currentStory.seasons ?? [])
                .flatMap(
                    (season) =>
                        (season.chapters ?? [])
                            .filter(
                                (chapter) =>
                                    chapter.status ===
                                    "published"
                            )
                            .map(
                                (chapter) => ({
                                    ...chapter,
                                    season_number:
                                        season.number,
                                    season_title:
                                        season.title,
                                })
                            )
                )
                .sort((a, b) => {
                    if (
                        a.season_number !==
                        b.season_number
                    ) {
                        return (
                            a.season_number -
                            b.season_number
                        );
                    }

                    return a.number - b.number;
                });

        await renderPage();

        bindReviewForm();
        await loadReviews();

        const contentRoot = document.querySelector(
            "#chapter-content-rendered"
        );

        refreshReadingBookmarkUI = setupReadingBookmarkUI({
            root: contentRoot,
            toolbar: document.querySelector("#reading-bookmark-toolbar"),
            story: currentStory,
            season: currentSeason,
            chapter: currentChapter,
        });

        const initialBookmarkState = refreshReadingBookmarkUI();
        if (location.hash === "#ponto-de-leitura" && initialBookmarkState?.match?.element) {
            window.requestAnimationFrame(() => {
                initialBookmarkState.match.element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            });
        }

        bindDynamicText(contentRoot);

        window.addEventListener(
            "hdc-profanity-filter-changed",
            async () => {
                const refreshedContentRoot =
                    document.querySelector(
                        "#chapter-content-rendered"
                    );

                if (refreshedContentRoot) {
                    refreshedContentRoot.innerHTML =
                        await renderContent(
                            currentChapter.content
                        );
                    refreshReadingBookmarkUI();
                    bindDynamicText(refreshedContentRoot);
                }
            },
        );
    } catch (error) {
        console.error(error);
        notFound();
    }
}

load();
