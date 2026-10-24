import { saveUserPreferencePatch, syncUserPreferences } from "../services/user-preferences.service.js";

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
    const updateLabel = () => {
        if (!button) return;
        const current = document.documentElement.dataset.theme || "neblina";
        button.textContent = `Tema: ${themeLabel(current)}`;
    };

    updateLabel();

    if (button && !button.dataset.themeHandlerAttached) {
        button.dataset.themeHandlerAttached = "true";
        button.addEventListener("click", () => {
            const current = document.documentElement.dataset.theme || "neblina";
            const index = THEMES.indexOf(current);
            const next = THEMES[(index + 1) % THEMES.length];
            document.documentElement.dataset.theme = next;
            localStorage.setItem(STORAGE_KEY, next);
            updateLabel();
            saveUserPreferencePatch({ theme: next }).catch((error) => {
                console.warn("Não foi possível sincronizar o tema com a conta:", error);
            });
        });
    }

    window.addEventListener("hdc-user-preferences-applied", (event) => {
        const remoteTheme = event.detail?.preferences?.theme;
        if (!THEMES.includes(remoteTheme)) return;
        document.documentElement.dataset.theme = remoteTheme;
        updateLabel();
    });

    // Visitantes continuam usando as preferências locais. Usuários autenticados
    // recuperam as preferências da conta e as aplicam também nesta página.
    syncUserPreferences().catch((error) => {
        console.warn("Não foi possível carregar as preferências da conta:", error);
    });
}
