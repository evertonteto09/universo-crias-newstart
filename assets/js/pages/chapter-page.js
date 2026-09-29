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
    getPublishedChapter,
} from "../services/chapter.service.js";

import {
    getPublishedChapterReviews,
    submitReview,
} from "../services/review.service.js";

setupTheme();
setupProfanityFilter();

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

function renderContent(content) {
    return filterProfanity(
        String(content ?? "")
    )
        .split(/\n{2,}/)
        .map(
            (paragraph) =>
                `<p>${escapeHtml(
                    paragraph
                ).replaceAll(
                    "\n",
                    "<br>"
                )}</p>`
        )
        .join("");
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

                                <span
                                    title="${review.rating}/5"
                                >
                                    ${ratingStars(
                                        review.rating
                                    )}
                                </span>
                            </div>

                            <p class="review-text">
                                ${escapeHtml(
                                    review.content
                                )}
                            </p>
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
                        document.querySelector(
                            "#reader-rating"
                        ).value,
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
            </div>

            <section class="reader-content">
                <div id="chapter-content-rendered">
                    ${renderContent(
                        currentChapter.content
                    )}
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

                    <label>
                        Nota
                        <select
                            id="reader-rating"
                            required
                        >
                            <option value="5">
                                5 estrelas
                            </option>

                            <option value="4">
                                4 estrelas
                            </option>

                            <option value="3">
                                3 estrelas
                            </option>

                            <option value="2">
                                2 estrelas
                            </option>

                            <option value="1">
                                1 estrela
                            </option>
                        </select>
                    </label>

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

        window.addEventListener(
            "hdc-profanity-filter-changed",
            () => {
                const contentRoot =
                    document.querySelector(
                        "#chapter-content-rendered"
                    );

                if (contentRoot) {
                    contentRoot.innerHTML =
                        renderContent(
                            currentChapter.content
                        );
                }
            },
        );
    } catch (error) {
        console.error(error);
        notFound();
    }
}

load();
