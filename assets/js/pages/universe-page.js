import { setupTheme } from "../core/theme.js?v=20261107-tab-icons-1";
import { setupProfanityFilter } from "../core/profanity-filter.js?v=20261107-tab-icons-1";
import { escapeHtml, storyCoverSource, ratingStars } from "../core/utils.js";
import { getStoryAuthors } from "../core/story-authors.js?v=20261027-coauthor-2";
import { normalizeStoryGenres } from "../core/story-genres.js?v=20261028-story-genres-2";
import { getStoryCoverUrl } from "../services/storage.service.js?v=20261028-spoiler-news-images-1";
import { getPublicStoryUniverseBySlug } from "../services/story-universe.service.js?v=20261107-reader-universes-2";
import { getPublishedStoryRatingSummaries } from "../services/review.service.js";
import { initCriasPresence } from "../services/crias-presence.service.js?v=20261107-universe-presence-1";
import { CRIAS_PRESENCE_LOGO_URL, getPresenceUniverseCoverUrl } from "../services/crias-presence-images.service.js?v=20261107-universe-presence-1";

setupTheme();
setupProfanityFilter();

const page = document.querySelector("#universe-page");
const slug = new URLSearchParams(window.location.search).get("slug");
const criasPresence = initCriasPresence({
    details: "Explorando um universo",
    state: "Universo dos Crias",
    pageContext: "universe",
});

function relationshipLabel(type) {
    if (type === "main") return "OBRA PRINCIPAL";
    if (type === "spin_off") return "SPIN-OFF";
    return "HISTÓRIA COMPLEMENTAR";
}

function getAuthorLabel(story) {
    const authors = getStoryAuthors(story);
    return authors.map((author) => author.name).filter(Boolean).join(", ") || "Autor não informado";
}

function renderGenres(story) {
    const genres = normalizeStoryGenres(story?.genres);
    if (!genres.length) return "";
    return `<p class="universe-story-genres"><strong>Gêneros:</strong> ${escapeHtml(genres.join(", "))}</p>`;
}

function renderNotFound() {
    page.innerHTML = `
        <section class="empty-state universe-not-found">
            <span class="eyebrow">UNIVERSO NÃO ENCONTRADO</span>
            <h1>Este universo não está disponível.</h1>
            <p class="muted">Ele pode ter sido removido ou ainda não possuir histórias publicadas.</p>
            <a class="primary-button" href="../?view=universes#universes-library-section">Voltar para universos</a>
        </section>
    `;
}

async function renderStoryCard(entry, index, summaries) {
    const story = entry.stories;
    const cover = await storyCoverSource(story, getStoryCoverUrl);
    const summary = summaries[String(story.id)] || { average: 0, count: 0 };
    return `
        <a class="universe-story-card" href="../historia/?slug=${encodeURIComponent(story.slug)}">
            <div class="universe-story-card-cover-wrap">
                <img class="universe-story-card-cover" src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(story.title)}" loading="lazy">
                <span class="universe-story-order">${String(index + 1).padStart(2, "0")}</span>
            </div>
            <div class="universe-story-card-body">
                <span class="universe-relationship-badge ${entry.relationship_type === "main" ? "is-main" : ""}">${relationshipLabel(entry.relationship_type)}</span>
                <h3>${escapeHtml(story.title)}</h3>
                <p class="universe-story-author">${getStoryAuthors(story).length > 1 ? "Autores:" : "por"} ${escapeHtml(getAuthorLabel(story))}</p>
                <p class="universe-story-description">${escapeHtml(story.description || "Sem descrição disponível.")}</p>
                ${renderGenres(story)}
                <div class="universe-story-rating">
                    ${ratingStars(summary.average)}
                    <strong>${summary.count ? `${summary.average.toFixed(1)}/10` : "Sem notas"}</strong>
                </div>
                <strong class="universe-story-open">Ler história →</strong>
            </div>
        </a>
    `;
}

async function load() {
    if (!slug) {
        renderNotFound();
        return;
    }

    try {
        const universe = await getPublicStoryUniverseBySlug(slug);
        if (!universe) {
            renderNotFound();
            return;
        }

        document.title = `${universe.name} | Histórias dos Crias`;

        let presenceCoverUrl = null;
        try {
            presenceCoverUrl = await getPresenceUniverseCoverUrl(universe);
        } catch (presenceImageError) {
            console.warn("Não foi possível preparar a capa do universo para o Crias Presence.", presenceImageError);
        }

        const publicUniverseUrl = new URL(`./?slug=${encodeURIComponent(universe.slug)}`, window.location.href);
        criasPresence.update({
            details: "Explorando um universo",
            state: universe.name || "Universo dos Crias",
            universeTitle: universe.name || "",
            pageContext: "universe",
            largeImageUrl: presenceCoverUrl || undefined,
            largeImageText: presenceCoverUrl ? `Capa do universo: ${universe.name}` : "Universo dos Crias",
            smallImageUrl: CRIAS_PRESENCE_LOGO_URL,
            smallImageText: "Universo dos Crias",
            currentPageUrl: publicUniverseUrl.href,
            currentPageButtonLabel: "Ver universo",
        });

        const mainStory = universe.main_story;
        let cover = universe.cover_display_url;
        if (!cover && mainStory) cover = await storyCoverSource(mainStory, getStoryCoverUrl);
        cover ||= "../assets/img/default-story-cover.svg";

        let summaries = {};
        try {
            summaries = await getPublishedStoryRatingSummaries(universe.stories.map((entry) => entry.story_id));
        } catch (error) {
            console.warn("Não foi possível carregar as avaliações do universo.", error);
        }

        const cards = await Promise.all(universe.stories.map((entry, index) => renderStoryCard(entry, index, summaries)));
        page.innerHTML = `
            <nav class="universe-breadcrumb" aria-label="Você está em">
                <a href="../?view=universes#universes-library-section">Universos</a>
                <span aria-hidden="true">/</span>
                <span>${escapeHtml(universe.name)}</span>
            </nav>

            <section class="universe-public-hero">
                <div class="universe-public-cover-wrap">
                    <img class="universe-public-cover" src="${escapeHtml(cover)}" alt="Capa do universo ${escapeHtml(universe.name)}">
                </div>
                <div class="universe-public-copy">
                    <span class="eyebrow">UNIVERSO COMPARTILHADO</span>
                    <h1>${escapeHtml(universe.name)}</h1>
                    <p>${escapeHtml(universe.description || "Histórias que compartilham o mesmo mundo.")}</p>
                    <div class="universe-public-meta">
                        <span>${universe.stories.length} ${universe.stories.length === 1 ? "história publicada" : "histórias publicadas"}</span>
                        ${mainStory ? `<span>Obra principal: <strong>${escapeHtml(mainStory.title)}</strong></span>` : ""}
                    </div>
                </div>
            </section>

            <section class="universe-public-stories" aria-labelledby="universe-stories-title">
                <div class="section-heading">
                    <div><span class="eyebrow">ORDEM DE LEITURA</span><h2 id="universe-stories-title">Histórias deste universo</h2></div>
                    <span class="muted">${universe.stories.length} ${universe.stories.length === 1 ? "obra" : "obras"}</span>
                </div>
                <p class="universe-reading-hint">As histórias estão organizadas na ordem recomendada pelo escritor.</p>
                <div class="universe-public-story-grid">${cards.join("")}</div>
            </section>
        `;
    } catch (error) {
        console.error("Não foi possível carregar este universo.", error);
        page.innerHTML = `
            <article class="error-card">
                <h1>Não foi possível carregar o universo.</h1>
                <p class="muted">Verifique sua conexão e tente novamente.</p>
                <a href="../?view=universes#universes-library-section">Voltar para universos</a>
            </article>
        `;
    }
}

load();