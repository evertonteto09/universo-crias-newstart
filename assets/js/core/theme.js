const THEMES = ["neblina", "preto", "branco", "vermelho", "amarelo", "roxo"];
const STORAGE_KEY = "hdc-theme";
const THEME_LABELS = {
    neblina: "Neblina",
    preto: "Preto",
    branco: "Branco",
    vermelho: "Vermelho",
    amarelo: "Amarelo",
    roxo: "Roxo"
};

function themeLabel(theme) {
    return THEME_LABELS[theme] || theme;
}

export function setupTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    const saved = THEMES.includes(stored) ? stored : "neblina";

    document.documentElement.dataset.theme = saved;

    const button = document.querySelector("#theme-toggle");

    if (!button) {
        return;
    }

    const updateLabel = () => {
        const current =
            document.documentElement.dataset.theme || "neblina";

        button.textContent = `Tema: ${themeLabel(current)}`;
    };

    updateLabel();

    button.addEventListener("click", () => {
        const current =
            document.documentElement.dataset.theme || "neblina";

        const index = THEMES.indexOf(current);

        const next =
            THEMES[(index + 1) % THEMES.length];

        document.documentElement.dataset.theme = next;
        localStorage.setItem(STORAGE_KEY, next);

        updateLabel();
    });
}
