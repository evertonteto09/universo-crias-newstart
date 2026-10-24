import { getStoryCoverUrl } from "./services/storage.service.js";
import { saveUserPreferencePatch, syncUserPreferences } from "./services/user-preferences.service.js";

const DEFAULT_COVER = "./assets/img/default-story-cover.svg";

const THEMES = ["neblina", "preto", "branco", "vermelho", "amarelo", "roxo"];
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
    const stored = localStorage.getItem("hdc-theme");
    const saved = THEMES.includes(stored) ? stored : "neblina";
    document.documentElement.dataset.theme = saved;
    const button = document.querySelector("#theme-toggle");
    const updateLabel = () => {
        if (button) button.textContent = `Tema: ${themeLabel(document.documentElement.dataset.theme || "neblina")}`;
    };

    if (button && button.dataset.themeHandlerAttached !== "true") {
        button.dataset.themeHandlerAttached = "true";
        button.addEventListener("click", () => {
            const current = document.documentElement.dataset.theme || "neblina";
            const index = THEMES.indexOf(current);
            const next = THEMES[(index + 1) % THEMES.length];
            document.documentElement.dataset.theme = next;
            localStorage.setItem("hdc-theme", next);
            updateLabel();
            saveUserPreferencePatch({ theme: next }).catch((error) => console.warn("Não foi possível sincronizar o tema:", error));
        });
    }

    window.addEventListener("hdc-user-preferences-applied", (event) => {
        const remoteTheme = event.detail?.preferences?.theme;
        if (!THEMES.includes(remoteTheme)) return;
        document.documentElement.dataset.theme = remoteTheme;
        updateLabel();
    });
    updateLabel();
    syncUserPreferences().catch((error) => console.warn("Não foi possível carregar as preferências da conta:", error));
}

export async function coverForStory(story) {
    if (story?.cover_type === "url" && story.cover_url) {
        return story.cover_url;
    }

    if (story?.cover_type === "upload" && story.cover_path) {
        try {
            const signedUrl = await getStoryCoverUrl(story.cover_path);
            if (signedUrl) return signedUrl;
        } catch (error) {
            console.warn("Não foi possível carregar a capa enviada ao Storage.", error);
        }
    }

    return DEFAULT_COVER;
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function ratingStars(rating) {
    const score = Math.max(0, Math.min(10, Number(rating) || 0));
    const visualScore = score / 2;
    const stars = Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, visualScore - index)) * 100;
        return `<span class="rating-star" aria-hidden="true"><span class="rating-star-empty">☆</span><span class="rating-star-fill" style="width:${fill}%">★</span></span>`;
    }).join("");
    return `<span class="rating-stars" role="img" aria-label="${score > 0 ? `Nota ${score.toFixed(1)} de 10` : "Sem avaliações"}">${stars}</span>`;
}
