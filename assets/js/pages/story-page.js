import { setupTheme } from "../core/theme.js?v=20261028-crias-presence-images-2";
import { setupProfanityFilter, filterProfanity } from "../core/profanity-filter.js?v=20261028-spoiler-news-images-1";
import { renderDynamicContent, bindDynamicText } from "../core/dynamic-text.js?v=20261028-spoiler-news-images-1";
import {
    escapeHtml,
    ratingStars,
    storyCoverSource,
    showMessage,
} from "../core/utils.js";
import { normalizeStoryGenres } from "../core/story-genres.js?v=20261028-story-genres-2";

import {
    getPublishedStoryBySlug,
} from "../services/story.service.js?v=20261028-story-genres-2";
import {
    getStoryAuthors,
    renderStoryAuthorNames,
} from "../core/story-authors.js?v=20261027-coauthor-2";

import {
    getStoryCoverUrl,
} from "../services/storage.service.js?v=20261028-spoiler-news-images-1";

import {
    getCurrentUser,
} from "../services/auth.service.js";

import {
    getMyWriterAccount,
} from "../services/writer.service.js";

import {
    getPublishedStoryReviews,
    getPublishedChapterRatingSummaries,
    submitReview,
} from "../services/review.service.js";

import {
    getPublishedStoryNews,
} from "../services/news.service.js";

import {
    initCriasPresence,
} from "../services/crias-presence.service.js?v=20261028-crias-presence-images-2";

import {
    CRIAS_PRESENCE_LOGO_URL,
    getPresenceStoryCoverUrl,
} from "../services/crias-presence-images.service.js?v=20261028-crias-presence-images-2";

import {
    getReadingBookmark,
    removeReadingBookmark,
} from "../services/reading-bookmark.service.js";

setupTheme();
setupProfanityFilter();

const criasPresence = initCriasPresence({
    details: "Lendo uma história",
    state: "Universo dos Crias",
});

const page =
    document.querySelector("#story-page");

const slug =
    new URLSearchParams(location.search)
        .get("slug");

let storyPresenceData = null;
const STORY_SECTION_BUTTONS = Object.freeze({
    chapters: "Ver episódios",
    news: "Ler notícias",
    reviews: "Ver avaliações",
});

function normalizeStorySection(value) {
    return ["chapters", "news", "reviews"].includes(value) ? value : "chapters";
}

function updateStorySectionPresence(section) {
    if (!storyPresenceData) return;
    const targetSection = normalizeStorySection(section);
    const pageUrl = new URL(window.location.href);
    if (targetSection === "chapters") pageUrl.searchParams.delete("tab");
    else pageUrl.searchParams.set("tab", targetSection);
    window.history.replaceState(window.history.state, "", pageUrl);

    criasPresence.update({
        details: "Lendo uma história",
        state: storyPresenceData.story.title || "Universo dos Crias",
        storyTitle: storyPresenceData.story.title || "",
        pageContext: "story",
        storySection: targetSection,
        currentPageUrl: pageUrl.href,
        currentPageButtonLabel: STORY_SECTION_BUTTONS[targetSection],
        largeImageUrl: storyPresenceData.coverUrl || CRIAS_PRESENCE_LOGO_URL,
        largeImageText: storyPresenceData.story.title || "Universo dos Crias",
        smallImageUrl: CRIAS_PRESENCE_LOGO_URL,
        smallImageText: "Universo dos Crias",
    });
}

function renderStoryGenres(genres) {
    const normalized = normalizeStoryGenres(genres);
    if (!normalized.length) return "";
    return `
        <section class="story-genres-public" aria-label="Gêneros da história">
            <span class="story-genres-public-label">Gêneros</span>
            <div class="story-genre-tags">
                ${normalized.map((genre) => `<span class="story-genre-tag">${escapeHtml(genre)}</span>`).join("")}
            </div>
        </section>
    `;
}

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

                <span class="review-rating-display" title="${review.rating}/10">
                    ${ratingStars(review.rating)}
                    <strong>${Number(review.rating)}/10</strong>
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
    const hasPublishedEpisode = (story.seasons ?? []).some(
        (season) =>
            season.status === "published" &&
            (season.chapters ?? []).some(
                (chapter) => chapter.status === "published",
            ),
    );

    if (!hasPublishedEpisode) {
        return `
            <article class="empty-card">
                <span class="eyebrow">AVALIAÇÕES</span>
                <h3>A obra já está publicada!</h3>
                <p class="muted">
                    As avaliações serão liberadas quando o escritor publicar
                    o primeiro episódio. Por enquanto, você já pode conhecer
                    a história e voltar mais tarde para acompanhar as novidades.
                </p>
            </article>
        `;
    }

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

            const writerId = Number(writer?.writer_id);
            isOwnStory = Boolean(
                writerId && (
                    writerId === Number(story.writer_id) ||
                    getStoryAuthors(story).some(
                        (author) => Number(author.id) === writerId
                    )
                )
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
                            aria-label="Escolha uma nota de 1 a 10 estrelas"
                        >
                            ${Array.from({ length: 10 }, (_, index) => 10 - index)
                                .map(
                                    (value) => `
                                        <input
                                            type="radio"
                                            id="story-rating-${value}"
                                            name="story-rating"
                                            value="${value}"
                                            required
                                        >

                                        <label
                                            for="story-rating-${value}"
                                            title="${value}/10"
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
                            ? `${summaryAverage.toFixed(1)}/10`
                            : "—/10"
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

async function renderNews(news) {
    const safeContent = await renderDynamicContent(
        filterProfanity(String(news.content ?? "")),
        String(news.content ?? ""),
    );

    return `
        <article class="news-card">
            <div class="news-card-meta">
                <span class="eyebrow">NOTÍCIA DA OBRA</span>
                <time datetime="${escapeHtml(news.created_at || "")}">
                    ${escapeHtml(formatNewsDate(news.created_at))}
                </time>
            </div>
            <h3>${escapeHtml(news.title)}</h3>
            <div class="news-card-content dynamic-content-root">${safeContent}</div>
        </article>
    `;
}

async function renderNewsPanel(news) {
    const renderedNews = news.length
        ? (await Promise.all(news.map(renderNews))).join("")
        : `
            <article class="empty-card">
                <span class="eyebrow">NOTÍCIAS</span>
                <h3>Nenhuma novidade publicada ainda.</h3>
                <p class="muted">
                    Quando o escritor publicar uma novidade sobre esta obra, ela aparecerá aqui.
                </p>
            </article>
        `;

    return `
        <section class="story-tab-panel" data-story-tab-panel="news" hidden>
            <div class="section-heading">
                <div>
                    <span class="eyebrow">NOVIDADES</span>
                    <h2>Notícias da história</h2>
                </div>
                <span class="muted">
                    ${news.length} ${news.length === 1 ? "publicação" : "publicações"}
                </span>
            </div>
            ${news.length ? `<div class="news-list">${renderedNews}</div>` : renderedNews}
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
        target = normalizeStorySection(target);
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
        updateStorySectionPresence(target);
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

    const initialTab = normalizeStorySection(new URLSearchParams(location.search).get("tab"));
    activate(initialTab);
}

function renderReadingBookmarkResume(story) {
    const container = document.querySelector("#reading-bookmark-resume");
    if (!container) return;

    container.replaceChildren();
    const bookmark = getReadingBookmark(story.id);

    if (!bookmark) {
        container.hidden = true;
        return;
    }

    container.hidden = false;
    const publishedChapters = (story.seasons ?? []).flatMap((season) =>
        (season.chapters ?? [])
            .filter((chapter) => chapter.status === "published")
            .map((chapter) => ({ ...chapter, season_number: season.number })),
    );
    const savedChapter = publishedChapters.find(
        (chapter) => String(chapter.id) === String(bookmark.chapterId),
    );

    const heading = document.createElement("strong");
    heading.className = "reading-bookmark-resume-title";
    heading.textContent = "📍 Continuar leitura";
    container.append(heading);

    const description = document.createElement("p");
    description.className = "reading-bookmark-resume-description";

    if (savedChapter) {
        const chapterLabel = Number(savedChapter.number) === 0
            ? "Piloto"
            : `Episódio ${savedChapter.number}`;
        description.textContent = `Você parou em ${chapterLabel}: ${savedChapter.title || "Sem título"} · Temporada ${savedChapter.season_number}.`;
        container.append(description);

        const actions = document.createElement("div");
        actions.className = "reading-bookmark-resume-actions";
        const continueLink = document.createElement("a");
        continueLink.className = "primary-button";
        continueLink.href = `./episodio.html?slug=${encodeURIComponent(story.slug)}&season=${savedChapter.season_number}&episode=${savedChapter.number}#ponto-de-leitura`;
        continueLink.textContent = "Continuar leitura";
        actions.append(continueLink);
        container.append(actions);
    } else {
        container.classList.add("is-warning");
        description.textContent = "O episódio onde você parou não está mais disponível na versão publicada desta história. Você pode remover este marcador ou definir outro ponto ao abrir um episódio.";
        container.append(description);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button reading-bookmark-resume-remove";
    removeButton.textContent = "Limpar marcador";
    removeButton.addEventListener("click", () => {
        if (removeReadingBookmark(story.id)) {
            container.classList.remove("is-warning");
            renderReadingBookmarkResume(story);
        } else {
            description.textContent = "Não foi possível limpar o marcador neste navegador.";
        }
    });

    // Mantém os dois botões no mesmo grupo para garantir um espaço visual claro.
    if (savedChapter) {
        container.querySelector(".reading-bookmark-resume-actions")?.append(removeButton);
    } else {
        container.append(removeButton);
    }
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
            await storyCoverSource(
                story,
                getStoryCoverUrl,
            );
        const presenceCover = await getPresenceStoryCoverUrl(story);
        storyPresenceData = { story, coverUrl: presenceCover };
        updateStorySectionPresence(normalizeStorySection(new URLSearchParams(location.search).get("tab")));

        let chapterRatingSummaries = {};
        const publishedChapterIds = (story.seasons ?? [])
            .flatMap((season) => season.chapters ?? [])
            .filter((chapter) => chapter.status === "published")
            .map((chapter) => chapter.id);

        try {
            chapterRatingSummaries =
                await getPublishedChapterRatingSummaries(
                    publishedChapterIds,
                );
        } catch (ratingError) {
            console.warn("Não foi possível carregar as notas dos episódios.", ratingError);
        }

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
                                (chapter) => {
                                    const chapterSummary =
                                        chapterRatingSummaries[String(chapter.id)] || {
                                            average: 0,
                                            count: 0,
                                        };

                                    return `
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

                                            <span class="chapter-main">
                                                <span class="chapter-title">
                                                    ${escapeHtml(chapter.title)}
                                                </span>
                                                <span class="chapter-rating" title="${chapterSummary.count} avaliações">
                                                    ${ratingStars(chapterSummary.average)}
                                                    <strong class="rating-score">
                                                        ${chapterSummary.count ? `${chapterSummary.average.toFixed(1)}/10` : "Sem notas"}
                                                    </strong>
                                                </span>
                                            </span>
                                        </a>
                                    `;
                                }
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
                    src="${escapeHtml(cover)}"
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

                    ${renderStoryGenres(story.genres)}

                    <p class="story-author-credits">
                        <strong>${getStoryAuthors(story).length > 1 ? "Autores:" : "Autor:"}</strong>
                        ${renderStoryAuthorNames(story)}
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

                <div id="reading-bookmark-resume" class="reading-bookmark-resume" hidden></div>

                <div class="season-stack">
                    ${
                        seasons ||
                        `<article class="empty-card">
                            <span class="eyebrow">EM BREVE</span>
                            <h3>Esta história já está publicada!</h3>
                            <p class="muted">
                                O escritor ainda não disponibilizou temporadas ou episódios.
                                Volte mais tarde para acompanhar a leitura.
                            </p>
                        </article>`
                    }
                </div>
            </section>

            ${await renderNewsPanel(news)}

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
        bindDynamicText(page);
        renderReadingBookmarkResume(story);

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
                        ? `${average.toFixed(1)}/10 · ${reviews.length} avaliações`
                        : "Ainda sem avaliações"
                }
            </span>
        `;

        // Delegation keeps the form working after its HTML is refreshed.
        reviewsRoot.addEventListener(
            "submit",
            async (event) => {
                const form = event.target.closest("#story-review-form");
                if (!form) return;

                event.preventDefault();
                const message = form.querySelector("#story-review-message");
                showMessage(message, "Enviando avaliação...");

                try {
                    const rating = Number(
                        form.querySelector('input[name="story-rating"]:checked')?.value,
                    );

                    await submitReview({
                        storyId: story.id,
                        chapterId: null,
                        readerName: form.querySelector("#story-reader-name").value,
                        rating,
                        content: form.querySelector("#story-review-content").value,
                    });

                    const updatedReviews =
                        await getPublishedStoryReviews(story.id);

                    reviewsRoot.innerHTML =
                        await renderStoryReviewForm(story, updatedReviews);

                    const updatedAverage = calculateAverage(updatedReviews);
                    document.querySelector("#story-rating-summary").innerHTML = `
                        <span>${ratingStars(updatedAverage)}</span>
                        <span class="muted">${updatedReviews.length ? `${updatedAverage.toFixed(1)}/10 · ${updatedReviews.length} avaliações` : "Ainda sem avaliações"}</span>
                    `;
                } catch (error) {
                    console.error(error);
                    showMessage(
                        message,
                        error.message || "Não foi possível enviar a avaliação.",
                        "error",
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
