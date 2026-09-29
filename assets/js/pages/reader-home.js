import { setupTheme } from "../core/theme.js";
import { setupProfanityFilter } from "../core/profanity-filter.js";
import {
    escapeHtml,
    ratingStars,
    storyCoverSource,
} from "../core/utils.js";
import { getPublishedStories } from "../services/story.service.js";
import { getStoryCoverUrl } from "../services/storage.service.js";

setupTheme();
setupProfanityFilter();

const grid =
    document.querySelector("#story-grid");

const count =
    document.querySelector("#story-count");

function storyCard(story) {
    const cover =
        storyCoverSource(
            story,
            getStoryCoverUrl,
        );

    const publishedCount =
        (story.seasons ?? []).reduce(
            (sum, season) =>
                sum +
                (season.chapters ?? []).length,
            0,
        );

    return `
        <a
            class="story-card"
            href="./historia.html?slug=${encodeURIComponent(story.slug)}"
        >
            <img
                class="story-cover"
                src="${cover}"
                alt="Capa de ${escapeHtml(story.title)}"
            >

            <div class="story-card-body">
                <span class="eyebrow">OBRA</span>
                <h3>${escapeHtml(story.title)}</h3>

                <p>
                    ${escapeHtml(
                        story.description ||
                        "Sem descrição disponível."
                    )}
                </p>

                <div class="rating-line">
                    <span>${ratingStars(0)}</span>
                    <span class="muted">
                        ${publishedCount}
                        ${
                            publishedCount === 1
                                ? "episódio publicado"
                                : "episódios publicados"
                        }
                    </span>
                </div>
            </div>
        </a>
    `;
}

async function load() {
    try {
        const stories =
            await getPublishedStories();

        count.textContent =
            `${stories.length} ${
                stories.length === 1
                    ? "obra"
                    : "obras"
            }`;

        if (!stories.length) {
            grid.innerHTML = `
                <article class="empty-card">
                    Ainda não existem histórias.
                </article>
            `;
            return;
        }

        grid.innerHTML =
            stories.map(storyCard).join("");
    } catch (error) {
        console.error(error);

        grid.innerHTML = `
            <article class="error-card">
                Não foi possível carregar as histórias.
            </article>
        `;
    }
}

load();
