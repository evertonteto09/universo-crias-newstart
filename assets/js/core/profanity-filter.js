const STORAGE_KEY = "hdc-profanity-filter";

let enabled =
    localStorage.getItem(STORAGE_KEY) !== "off";

// As palavras são filtradas somente na camada de exibição.
// O conteúdo salvo no Supabase permanece intacto.
const PHRASES = [
    "filho da puta",
    "filho-da-puta",
    "vai se foder",
    "vai se fuder",
    "vai tomar no cu",
];

const WORDS = [
    "caralho",
    "porra",
    "merda",
    "puta",
    "puto",
    "foder",
    "fuder",
    "foderam",
    "fodase",
    "foda-se",
    "foda",
    "cacete",
    "buceta",
    "vadia",
    "piranha",
    "viado",
    "desgraçado",
    "desgracado",
];

function buildRegex(items) {
    const escaped =
        items
            .sort((a, b) => b.length - a.length)
            .map(
                (item) =>
                    item
                        .replace(
                            /[.*+?^${}()|[\]\\]/g,
                            "\\$&"
                        )
                        .replaceAll(" ", "\\s+")
            )
            .join("|");

    return new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${escaped})(?![\\p{L}\\p{N}])`,
        "giu",
    );
}

const phraseRegex = buildRegex(PHRASES);
const wordRegex = buildRegex(WORDS);

export function isProfanityFilterEnabled() {
    return enabled;
}

export function filterProfanity(text) {
    const value = String(text ?? "");

    if (!enabled || !value) {
        return value;
    }

    return value
        .replace(
            phraseRegex,
            (match) => "*".repeat(Math.max(3, match.length))
        )
        .replace(
            wordRegex,
            (match) => "*".repeat(Math.max(3, match.length))
        );
}

export function setProfanityFilter(nextValue) {
    enabled = Boolean(nextValue);

    localStorage.setItem(
        STORAGE_KEY,
        enabled ? "on" : "off",
    );

    window.dispatchEvent(
        new CustomEvent(
            "hdc-profanity-filter-changed",
            {
                detail: { enabled },
            },
        ),
    );

    updateFilterButtons();
}

export function toggleProfanityFilter() {
    setProfanityFilter(!enabled);
}

function updateFilterButtons() {
    document
        .querySelectorAll(
            "[data-profanity-toggle]"
        )
        .forEach((button) => {
            button.textContent =
                `Filtro: ${enabled ? "ON" : "OFF"}`;

            button.setAttribute(
                "aria-pressed",
                String(enabled),
            );

            button.title =
                enabled
                    ? "Palavrões serão ocultados durante a leitura"
                    : "Palavrões serão exibidos durante a leitura";
        });
}

export function setupProfanityFilter() {
    document
        .querySelectorAll(
            "[data-profanity-toggle]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                toggleProfanityFilter,
            );
        });

    updateFilterButtons();
}
