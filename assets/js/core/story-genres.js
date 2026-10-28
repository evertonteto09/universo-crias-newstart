/**
 * Catálogo de gêneros disponível para as histórias do Universo dos Crias.
 * Os valores são persistidos como text[] em public.stories.genres.
 */
export const STORY_GENRES = Object.freeze([
    "Ação",
    "Aventura",
    "Comédia",
    "Drama",
    "Fantasia",
    "Fantasia sombria",
    "Ficção científica",
    "Mistério",
    "Romance",
    "Terror",
    "Suspense",
    "Sobrenatural",
    "Psicológico",
    "Policial",
    "Histórico",
    "Distopia",
    "Slice of life",
    "Escolar",
    "Mitologia",
    "LGBTQIA+",
    "Musical",
    "Tragédia",
    "Guerra",
    "Esportes",
    "Infantil",
    "Juvenil",
    "Realismo mágico",
]);

function normalizeGenreKey(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

const CANONICAL_GENRES = new Map(
    STORY_GENRES.map((genre) => [normalizeGenreKey(genre), genre]),
);

/** Retorna apenas gêneros reconhecidos, preservando a ordem do catálogo. */
export function normalizeStoryGenres(value) {
    const incoming = Array.isArray(value)
        ? value
        : (typeof value === "string" ? value.split(",") : []);
    const selected = new Set();

    for (const item of incoming) {
        const canonical = CANONICAL_GENRES.get(normalizeGenreKey(item));
        if (canonical) selected.add(canonical);
    }

    return STORY_GENRES.filter((genre) => selected.has(genre));
}

/** HTML seguro porque todas as opções vêm do catálogo estático acima. */
export function renderStoryGenreChoices(value = []) {
    const selected = new Set(normalizeStoryGenres(value));
    return `
        <div class="story-genre-options" role="group" aria-label="Gêneros da história">
            ${STORY_GENRES.map((genre) => `
                <label class="story-genre-option">
                    <input
                        type="checkbox"
                        name="story-genres"
                        value="${genre}"
                        ${selected.has(genre) ? "checked" : ""}
                    >
                    <span>${genre}</span>
                </label>
            `).join("")}
        </div>
    `;
}

export function readSelectedStoryGenres(container) {
    if (!container?.querySelectorAll) return [];
    return normalizeStoryGenres(
        [...container.querySelectorAll('input[name="story-genres"]:checked')]
            .map((input) => input.value),
    );
}
