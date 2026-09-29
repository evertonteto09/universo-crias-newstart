const THEMES = ["neblina", "preto", "branco"];
const STORAGE_KEY = "hdc-theme";

export function setupTheme() {
    const saved =
        localStorage.getItem(STORAGE_KEY) || "neblina";

    document.documentElement.dataset.theme = saved;

    const button = document.querySelector("#theme-toggle");

    if (!button) {
        return;
    }

    const updateLabel = () => {
        const current =
            document.documentElement.dataset.theme || "neblina";

        button.textContent = `Tema: ${current}`;
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
