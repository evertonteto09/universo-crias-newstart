import { setupTheme } from "../core/theme.js";
import {
    escapeHtml,
    ratingStars,
    storyCoverSource,
} from "../core/utils.js";
import { getPublishedStoryBySlug } from "../services/story.service.js";
import { getStoryCoverUrl } from "../services/storage.service.js";
import {
    getPublishedStoryReviews,
} from "../services/review.service.js";

setupTheme();

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
                <span>
                    ${ratingStars(review.rating)}
                </span>
            </div>
            <p>
                ${escapeHtml(review.content)}
            </p>
        </article>
    `;
}

async function load() {
    if (!slug) {
        notFound();
        return;
    }

    try {
        const story =
            await getPublishedStoryBySlug(slug);

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
                                    ${escapeHtml(season.title)}
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

        const reviewCount =
            reviews.length;

        const average =
            reviewCount
                ? reviews.reduce(
                    (sum, item) =>
                        sum +
                        Number(item.rating),
                    0,
                ) / reviewCount
                : 0;

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

                    <div class="rating-summary">
                        <span>
                            ${ratingStars(average)}
                        </span>

                        <span class="muted">
                            ${
                                reviewCount
                                    ? `${average.toFixed(1)} · ${reviewCount} avaliações`
                                    : "Ainda sem avaliações"
                            }
                        </span>
                    </div>
                </div>
            </section>

            <section>
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            EPISÓDIOS
                        </span>
                        <h2>Temporadas</h2>
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

            <section class="review-section">
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">
                            FEEDBACK
                        </span>
                        <h2>
                            Avaliações da obra
                        </h2>
                    </div>
                </div>

                <div class="review-list">
                    ${
                        reviews.length
                            ? reviews
                                .map(renderReview)
                                .join("")
                            : `<article class="empty-card">
                                Ainda não há avaliações desta obra.
                               </article>`
                    }
                </div>
            </section>
        `;
    } catch (error) {
        console.error(error);
        notFound();
    }
}

load();
