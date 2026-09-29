import { setupTheme } from "../core/theme.js";
import {
    escapeHtml,
    showMessage,
    ratingStars,
} from "../core/utils.js";
import { getPublishedChapter } from "../services/chapter.service.js";
import {
    getPublishedChapterReviews,
    submitReview,
} from "../services/review.service.js";

setupTheme();

const page =
    document.querySelector("#chapter-page");

const params =
    new URLSearchParams(location.search);

const slug = params.get("slug");
const seasonNumber =
    Number(params.get("season"));

const episodeNumber =
    Number(params.get("episode"));

function renderContent(content) {
    return escapeHtml(content ?? "")
        .split(/\n{2,}/)
        .map(
            (paragraph) =>
                `<p>${paragraph.replaceAll(
                    "\n",
                    "<br>"
                )}</p>`
        )
        .join("");
}

function notFound() {
    page.innerHTML = `
        <section class="empty-state">
            <span class="eyebrow">LEITURA</span>
            <h1>Episódio não encontrado</h1>
            <a class="primary-button" href="./index.html">
                Voltar
            </a>
        </section>
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

        const {
            story,
            season,
            chapter,
        } = result;

        page.innerHTML = `
            <article class="reader-page">

                <div class="reader-header">
                    <a
                        class="text-link"
                        href="./historia.html?slug=${encodeURIComponent(story.slug)}"
                    >
                        ← ${escapeHtml(story.title)}
                    </a>

                    <span class="eyebrow">
                        ${escapeHtml(season.title)}
                    </span>

                    <h1>
                        ${escapeHtml(chapter.title)}
                    </h1>

                    <p class="muted">
                        ${
                            chapter.number === 0
                                ? "Piloto"
                                : `Episódio ${chapter.number}`
                        }
                    </p>
                </div>

                <section class="reader-content">
                    ${renderContent(chapter.content)}
                </section>

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

        const reviewList =
            document.querySelector(
                "#review-list"
            );

        const reviewForm =
            document.querySelector(
                "#review-form"
            );

        const message =
            document.querySelector(
                "#review-message"
            );

        async function refreshReviews() {
            const reviews =
                await getPublishedChapterReviews(
                    chapter.id,
                );

            reviewList.innerHTML =
                reviews.length
                    ? reviews
                        .map(
                            (review) => `
                                <article class="review-card">
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
                                </article>
                            `
                        )
                        .join("")
                    : `<article class="empty-card">
                            Ainda não há avaliações neste episódio.
                       </article>`;
        }

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
                        storyId: story.id,
                        chapterId: chapter.id,
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

                    await refreshReviews();
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

        await refreshReviews();
    } catch (error) {
        console.error(error);
        notFound();
    }
}

load();
