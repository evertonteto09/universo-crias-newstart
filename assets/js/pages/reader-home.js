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

const searchInput =
    document.querySelector("#story-search");

const searchStatus =
    document.querySelector("#story-search-status");

const writerFilter =
    document.querySelector("[data-writer-filter]");

const writerFilterToggle =
    document.querySelector("#writer-filter-toggle");

const writerFilterMenu =
    document.querySelector("#writer-filter-menu");

let allStories = [];
let selectedWriter = "all";

function normalizeSearchText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function getAuthorName(story) {
    return (
        story.writers?.name ||
        story.writers?.username ||
        "Autor não informado"
    );
}

function getAuthorKey(story) {
    return String(
        story.writer_id ??
        story.writers?.id ??
        "unknown",
    );
}

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

    const authorName =
        getAuthorName(story);

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

                <p class="story-author">
                    por ${escapeHtml(authorName)}
                </p>

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

function updateCount(stories) {
    count.textContent =
        `${stories.length} ${
            stories.length === 1
                ? "obra"
                : "obras"
        }`;
}

function renderStories(stories, context = {}) {
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

    grid.innerHTML =
        stories.map(storyCard).join("");
}

function getWriterOptions() {
    const writers = new Map();

    allStories.forEach((story) => {
        const key = getAuthorKey(story);
        if (writers.has(key)) {
            return;
        }

        writers.set(key, {
            key,
            name: getAuthorName(story),
            username: story.writers?.username || "",
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
                (story) =>
                    getAuthorKey(story) === writer.key
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

            const authorName =
                normalizeSearchText(
                    story.writers?.name,
                );

            const authorUsername =
                normalizeSearchText(
                    story.writers?.username,
                );

            const matchesSearch =
                !searchTerm ||
                title.includes(searchTerm) ||
                authorName.includes(searchTerm) ||
                authorUsername.includes(searchTerm);

            const matchesWriter =
                selectedWriter === "all" ||
                getAuthorKey(story) === selectedWriter;

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
        allStories =
            await getPublishedStories();

        renderWriterFilterMenu();
        updateWriterFilterLabel();
        renderStories(allStories);
    } catch (error) {
        console.error(error);

        count.textContent = "—";
        grid.innerHTML = `
            <article class="error-card">
                Não foi possível carregar as histórias.
            </article>
        `;
    }
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

searchInput?.addEventListener(
    "input",
    applyFilters,
);

load();
