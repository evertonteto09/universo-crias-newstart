import { setupTheme } from "../core/theme.js?v=20261107-tab-icons-1";
import { setupProfanityFilter } from "../core/profanity-filter.js?v=20261107-tab-icons-1";
import { normalizeStoryGenres } from "../core/story-genres.js?v=20261028-story-genres-home-1";
import {
    escapeHtml,
    ratingStars,
    storyCoverSource,
} from "../core/utils.js";
import { getPublishedStories } from "../services/story.service.js?v=20261107-tab-icons-1";
import { getStoryAuthors } from "../core/story-authors.js?v=20261027-coauthor-2";
import { getStoryCoverUrl } from "../services/storage.service.js";
import { getPublishedStoryRatingSummaries } from "../services/review.service.js";
import { initCriasPresence } from "../services/crias-presence.service.js?v=20261107-tab-icons-1";
import { getPublicStoryUniverses } from "../services/story-universe.service.js?v=20261107-reader-universes-2";

setupTheme();
setupProfanityFilter();

const criasPresence = initCriasPresence({
    details: "Navegando pelas histórias",
    state: "Universo dos Crias",
});

const grid =
    document.querySelector("#story-grid");

const count =
    document.querySelector("#story-count");

const searchInput =
    document.querySelector("#story-search");

const searchStatus =
    document.querySelector("#story-search-status");
const universeGrid = document.querySelector("#universe-grid");
const universeCount = document.querySelector("#universe-count");
const storiesSection = document.querySelector("#stories-library-section");
const universesSection = document.querySelector("#universes-library-section");
const storiesFilters = document.querySelector("#story-library-filters");
const mainNav = document.querySelector(".main-nav");
const themeToggle = document.querySelector("#theme-toggle");
const mobileWriterFilterMedia = window.matchMedia("(max-width: 680px)");
const storiesModeButton = document.querySelector("#library-mode-stories");
const universesModeButton = document.querySelector("#library-mode-universes");

const writerFilter =
    document.querySelector("[data-writer-filter]");

const writerFilterToggle =
    document.querySelector("#writer-filter-toggle");

const writerFilterMenu =
    document.querySelector("#writer-filter-menu");

let allStories = [];
let allUniverses = [];
let currentLibraryMode = "stories";
let storyRatingSummaries = {};
let selectedWriter = "all";
let renderSequence = 0;

function placeWriterFilterForViewport() {
    if (!writerFilter || !storiesFilters || !mainNav) {
        return;
    }

    const isMobile = mobileWriterFilterMedia.matches;

    if (isMobile) {
        if (writerFilter.parentElement !== mainNav || writerFilter.nextElementSibling !== themeToggle) {
            closeWriterMenu();
            mainNav.insertBefore(writerFilter, themeToggle);
        }
    } else if (writerFilter.parentElement !== storiesFilters) {
        closeWriterMenu();
        storiesFilters.appendChild(writerFilter);
    }

    writerFilter.hidden = currentLibraryMode !== "stories";
    storiesFilters.hidden = isMobile || currentLibraryMode !== "stories";
}

function normalizeSearchText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function getAuthorEntries(story) {
    return getStoryAuthors(story);
}

function getAuthorLabel(story) {
    return getAuthorEntries(story)
        .map((author) => author.name)
        .join(", ") || "Autor não informado";
}

function renderStoryGenresLine(story) {
    const genres = normalizeStoryGenres(story?.genres);
    if (!genres.length) return "";

    return `
        <p class="story-card-genres">
            <strong>Gêneros:</strong> ${escapeHtml(genres.join(", "))}
        </p>
    `;
}

function renderStoryUniverseTags(story) {
    const memberships = allUniverses.filter((universe) =>
        (universe.stories ?? []).some((entry) => String(entry.story_id) === String(story.id))
    );
    if (!memberships.length) return "";
    return `
        <div class="story-card-universe-tags" aria-label="Universos relacionados">
            ${memberships.slice(0, 2).map((universe) => `<span class="story-card-universe-tag">🌌 ${escapeHtml(universe.name)}</span>`).join("")}
            ${memberships.length > 2 ? `<span class="story-card-universe-tag story-card-universe-more">+${memberships.length - 2}</span>` : ""}
        </div>
    `;
}

async function storyCard(story) {
    const cover =
        await storyCoverSource(
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

    const authorLabel =
        getAuthorLabel(story);

    const ratingSummary =
        storyRatingSummaries[String(story.id)] || {
            average: 0,
            count: 0,
        };

    return `
        <a
            class="story-card"
            href="./historia/?slug=${encodeURIComponent(story.slug)}"
        >
            <img
                class="story-cover"
                src="${escapeHtml(cover)}"
                alt="Capa de ${escapeHtml(story.title)}"
            >

            <div class="story-card-body">
                <span class="eyebrow">OBRA</span>
                <h3>${escapeHtml(story.title)}</h3>

                <p class="story-author">
                    ${getAuthorEntries(story).length > 1 ? "Autores:" : "por"}
                    ${escapeHtml(authorLabel)}
                </p>

                <p>
                    ${escapeHtml(
                        story.description ||
                        "Sem descrição disponível."
                    )}
                </p>

                ${renderStoryGenresLine(story)}
                ${renderStoryUniverseTags(story)}

                <div class="rating-line">
                    <span title="${ratingSummary.count} avaliações">
                        ${ratingStars(ratingSummary.average)}
                    </span>
                    <strong class="rating-score">
                        ${ratingSummary.count ? `${ratingSummary.average.toFixed(1)}/10` : "Sem notas"}
                    </strong>
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

function storyCardFallback(story) {
    const publishedCount = (story.seasons ?? []).reduce(
        (sum, season) => sum + (season.chapters ?? []).length,
        0,
    );
    const authorLabel = getAuthorLabel(story);
    const authorCount = getAuthorEntries(story).length;
    const summary = storyRatingSummaries[String(story.id)] || { average: 0, count: 0 };
    const defaultCover = "./assets/img/default-story-cover.svg";
    return `
        <a class="story-card" href="./historia/?slug=${encodeURIComponent(story.slug)}">
            <img class="story-cover" src="${defaultCover}" alt="Capa de ${escapeHtml(story.title)}">
            <div class="story-card-body">
                <span class="eyebrow">OBRA</span>
                <h3>${escapeHtml(story.title)}</h3>
                <p class="story-author">${authorCount > 1 ? "Autores:" : "por"} ${escapeHtml(authorLabel)}</p>
                <p>${escapeHtml(story.description || "Sem descrição disponível.")}</p>
                ${renderStoryGenresLine(story)}
                ${renderStoryUniverseTags(story)}
                <div class="rating-line">
                    <span title="${summary.count} avaliações">${ratingStars(summary.average)}</span>
                    <strong class="rating-score">${summary.count ? `${summary.average.toFixed(1)}/10` : "Sem notas"}</strong>
                    <span class="muted">${publishedCount} ${publishedCount === 1 ? "episódio publicado" : "episódios publicados"}</span>
                </div>
            </div>
        </a>
    `;
}

function updateCount(stories) {
    count.textContent =
        `${stories.length} ${
            stories.length === 1
                ? "obra"
                : "obras"
        }`;
}

async function renderStories(stories, context = {}) {
    const renderId = ++renderSequence;
    updateCount(stories);

    if (!stories.length) {
        const cleanSearch =
            String(context.searchTerm ?? "").trim();
        const hasWriterFilter =
            selectedWriter !== "all";

        let message = "Ainda não existem histórias.";

        if (cleanSearch && hasWriterFilter) {
            message = "Nenhuma história encontrada com esses filtros.";
        } else if (cleanSearch) {
            message = "Nenhuma história encontrada.";
        } else if (hasWriterFilter) {
            message = "Esse escritor ainda não possui histórias publicadas.";
        }

        grid.innerHTML = `
            <article class="empty-card search-empty-card">
                <span class="eyebrow">${
                    cleanSearch || hasWriterFilter
                        ? "FILTRO"
                        : "BIBLIOTECA"
                }</span>
                <h3>${escapeHtml(message)}</h3>
                <p class="muted">
                    ${
                        cleanSearch
                            ? `Busca: <strong>${escapeHtml(cleanSearch)}</strong>.`
                            : "Tente selecionar outro escritor ou limpar o filtro."
                    }
                </p>
            </article>
        `;
        return;
    }

    try {
        const cards = await Promise.all(stories.map(storyCard));
        if (renderId !== renderSequence) return;
        grid.innerHTML = cards.join("");
    } catch (error) {
        console.error("Não foi possível preparar as capas das histórias.", error);
        if (renderId !== renderSequence) return;
        grid.innerHTML = stories.map((story) => storyCardFallback(story)).join("");
    }
}

async function renderUniverseCards(universes) {
    if (!universeGrid) return;
    universeCount.textContent = `${universes.length} ${universes.length === 1 ? "universo" : "universos"}`;
    if (!universes.length) {
        universeGrid.innerHTML = `<article class="empty-card"><span class="eyebrow">UNIVERSOS</span><h3>Nenhum universo encontrado.</h3><p class="muted">Tente outra pesquisa ou volte à biblioteca de histórias.</p></article>`;
        return;
    }
    const cards = await Promise.all(universes.map(async (universe) => {
        const mainStory = universe.main_story;
        let cover = universe.cover_display_url || "./assets/img/default-story-cover.svg";
        if (!universe.cover_display_url && mainStory) {
            try { cover = await storyCoverSource(mainStory, getStoryCoverUrl); } catch { /* capa padrão */ }
        }
        const total = universe.stories.length;
        return `<a class="universe-card" href="./universo/?slug=${encodeURIComponent(universe.slug)}">
            <img class="universe-card-cover" src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(universe.name)}" loading="lazy">
            <div class="universe-card-body"><span class="eyebrow">UNIVERSO</span><h3>${escapeHtml(universe.name)}</h3>
            <p>${escapeHtml(universe.description || "Um conjunto de histórias que compartilham o mesmo universo.")}</p>
            <div class="universe-card-meta"><span>${total} ${total === 1 ? "história publicada" : "histórias publicadas"}</span>${mainStory ? `<span>Obra principal: ${escapeHtml(mainStory.title)}</span>` : ""}</div>
            <strong class="universe-card-link">Explorar universo →</strong></div></a>`;
    }));
    universeGrid.innerHTML = cards.join("");
}

function applyUniverseSearch() {
    const term = normalizeSearchText(searchInput?.value);
    const filtered = allUniverses.filter((universe) => {
        const mainTitle = universe.main_story?.title || "";
        return !term || normalizeSearchText(universe.name).includes(term) || normalizeSearchText(universe.description).includes(term) || normalizeSearchText(mainTitle).includes(term);
    });
    if (searchStatus) searchStatus.textContent = term ? `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}` : "";
    renderUniverseCards(filtered).catch((error) => { console.error(error); universeGrid.innerHTML = `<article class="error-card">Não foi possível carregar os universos.</article>`; });
}

function setLibraryMode(mode, { syncUrl = false } = {}) {
    currentLibraryMode = mode === "universes" ? "universes" : "stories";
    const isStories = currentLibraryMode === "stories";
    storiesModeButton?.classList.toggle("active", isStories);
    universesModeButton?.classList.toggle("active", !isStories);
    storiesModeButton?.setAttribute("aria-pressed", String(isStories));
    universesModeButton?.setAttribute("aria-pressed", String(!isStories));
    storiesSection.hidden = !isStories;
    universesSection.hidden = isStories;
    if (writerFilter) writerFilter.hidden = !isStories;
    if (storiesFilters) {
        storiesFilters.hidden = mobileWriterFilterMedia.matches || !isStories;
    }
    if (searchInput) searchInput.placeholder = isStories ? "Pesquisar por história ou autor..." : "Pesquisar por universo...";
    if (syncUrl) {
        const url = new URL(window.location.href);
        if (isStories) {
            url.searchParams.delete("view");
            if (url.hash === "#universes-library-section") url.hash = "";
        } else {
            url.searchParams.set("view", "universes");
        }
        window.history.replaceState(window.history.state, "", url);
    }

    if (isStories) applyFilters(); else applyUniverseSearch();
}

function getWriterOptions() {
    const writers = new Map();

    allStories.forEach((story) => {
        getAuthorEntries(story).forEach((author) => {
            const key = String(author.id ?? author.username ?? "");
            if (!key || writers.has(key)) {
                return;
            }

            writers.set(key, {
                key,
                name: author.name,
                username: author.username || "",
            });
        });
    });

    return Array.from(writers.values())
        .sort((a, b) =>
            a.name.localeCompare(
                b.name,
                "pt-BR",
                { sensitivity: "base" },
            )
        );
}

function renderWriterFilterMenu() {
    if (!writerFilterMenu) {
        return;
    }

    const writers = getWriterOptions();

    writerFilterMenu.innerHTML = `
        <button
            class="writer-filter-option ${
                selectedWriter === "all" ? "active" : ""
            }"
            type="button"
            role="menuitem"
            data-writer-value="all"
        >
            <span>Todos os escritores</span>
            <span class="writer-filter-count">${allStories.length}</span>
        </button>

        ${writers.map((writer) => {
            const storyCount = allStories.filter(
                (story) => getAuthorEntries(story).some(
                    (author) => String(author.id ?? author.username ?? "") === writer.key
                )
            ).length;

            return `
                <button
                    class="writer-filter-option ${
                        selectedWriter === writer.key ? "active" : ""
                    }"
                    type="button"
                    role="menuitem"
                    data-writer-value="${escapeHtml(writer.key)}"
                >
                    <span>
                        ${escapeHtml(writer.name)}
                        ${
                            writer.username
                                ? `<small>@${escapeHtml(writer.username)}</small>`
                                : ""
                        }
                    </span>
                    <span class="writer-filter-count">${storyCount}</span>
                </button>
            `;
        }).join("")}
    `;

    writerFilterMenu
        .querySelectorAll("[data-writer-value]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                selectedWriter =
                    button.dataset.writerValue || "all";

                updateWriterFilterLabel(writers);
                closeWriterMenu();
                applyFilters();
            });
        });
}

function updateWriterFilterLabel(writers = getWriterOptions()) {
    if (!writerFilterToggle) {
        return;
    }

    if (selectedWriter === "all") {
        writerFilterToggle.textContent =
            "Escritor: todos";
        return;
    }

    const selected = writers.find(
        (writer) => writer.key === selectedWriter
    );

    writerFilterToggle.textContent =
        selected
            ? `Escritor: ${selected.name}`
            : "Escritor: todos";
}

function openWriterMenu() {
    if (!writerFilterMenu || !writerFilterToggle) {
        return;
    }

    writerFilterMenu.hidden = false;
    writerFilterToggle.setAttribute(
        "aria-expanded",
        "true",
    );
}

function closeWriterMenu() {
    if (!writerFilterMenu || !writerFilterToggle) {
        return;
    }

    writerFilterMenu.hidden = true;
    writerFilterToggle.setAttribute(
        "aria-expanded",
        "false",
    );
}

function applyFilters() {
    const searchTerm =
        normalizeSearchText(
            searchInput?.value,
        );

    const filteredStories =
        allStories.filter((story) => {
            const title =
                normalizeSearchText(
                    story.title,
                );

            const authors = getAuthorEntries(story);
            const matchesAuthorSearch = authors.some((author) =>
                normalizeSearchText(author.name).includes(searchTerm) ||
                normalizeSearchText(author.username).includes(searchTerm)
            );

            const matchesSearch =
                !searchTerm ||
                title.includes(searchTerm) ||
                matchesAuthorSearch;

            const matchesWriter =
                selectedWriter === "all" ||
                authors.some((author) =>
                    String(author.id ?? author.username ?? "") === selectedWriter
                );

            return (
                matchesSearch &&
                matchesWriter
            );
        });

    if (searchStatus) {
        const filtersApplied =
            Boolean(searchTerm) ||
            selectedWriter !== "all";

        searchStatus.textContent =
            filtersApplied
                ? `${filteredStories.length} ${
                    filteredStories.length === 1
                        ? "resultado"
                        : "resultados"
                }`
                : "";
    }

    renderStories(
        filteredStories,
        { searchTerm },
    );
}

async function load() {
    try {
        allStories = await getPublishedStories();
    } catch (error) {
        console.error("Não foi possível carregar as histórias.", error);
        count.textContent = "—";
        grid.innerHTML = `
            <article class="error-card">
                Não foi possível carregar as histórias.
            </article>
        `;
        allStories = [];
    }

    try {
        allUniverses = await getPublicStoryUniverses();
    } catch (error) {
        console.warn("Não foi possível carregar os universos. A biblioteca de histórias continuará disponível.", error);
        allUniverses = [];
        if (universeGrid) {
            universeGrid.innerHTML = `<article class="error-card">Não foi possível carregar os universos no momento.</article>`;
        }
    }

    try {
        storyRatingSummaries = await getPublishedStoryRatingSummaries(
            allStories.map((story) => story.id),
        );
    } catch (ratingError) {
        console.warn("Não foi possível carregar as médias das obras.", ratingError);
        storyRatingSummaries = {};
    }

    renderWriterFilterMenu();
    updateWriterFilterLabel();
    renderStories(allStories);
    if (allUniverses.length || universeGrid?.querySelector(".error-card") === null) {
        renderUniverseCards(allUniverses);
    }

    const requestedView = new URLSearchParams(window.location.search).get("view");
    setLibraryMode(requestedView === "universes" ? "universes" : "stories");
    if (requestedView === "universes" && window.location.hash === "#universes-library-section") {
        window.setTimeout(() => universesSection?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
}

placeWriterFilterForViewport();
if (typeof mobileWriterFilterMedia.addEventListener === "function") {
    mobileWriterFilterMedia.addEventListener("change", placeWriterFilterForViewport);
} else {
    mobileWriterFilterMedia.addListener(placeWriterFilterForViewport);
}

writerFilterToggle?.addEventListener(
    "click",
    () => {
        const shouldOpen =
            writerFilterMenu?.hidden ?? true;

        if (shouldOpen) {
            openWriterMenu();
        } else {
            closeWriterMenu();
        }
    },
);

document.addEventListener(
    "click",
    (event) => {
        if (
            writerFilter &&
            !writerFilter.contains(event.target)
        ) {
            closeWriterMenu();
        }
    },
);

document.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Escape") {
            closeWriterMenu();
        }
    },
);

searchInput?.addEventListener("input", () => {
    if (currentLibraryMode === "stories") applyFilters();
    else applyUniverseSearch();
});

storiesModeButton?.addEventListener("click", () => setLibraryMode("stories", { syncUrl: true }));
universesModeButton?.addEventListener("click", () => setLibraryMode("universes", { syncUrl: true }));

load();