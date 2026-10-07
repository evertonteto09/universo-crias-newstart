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
    if (!button) return;
    button.addEventListener("click", () => {
        const current = document.documentElement.dataset.theme || "neblina";
        const index = THEMES.indexOf(current);
        const next = THEMES[(index + 1) % THEMES.length];
        document.documentElement.dataset.theme = next;
        localStorage.setItem("hdc-theme", next);
        button.textContent = `Tema: ${themeLabel(next)}`;
    });

    button.textContent = `Tema: ${themeLabel(saved)}`;
}

export function coverForStory(story) {
    if (story?.cover_type === "url" && story.cover_url) {
        return story.cover_url;
    }

    if (story?.cover_type === "upload" && story.cover_path) {
        // O SDK pode gerar a URL pública. O front pode substituir essa função
        // depois por uma chamada a getPublicUrl() quando o Storage estiver ativo.
        const { data } = window.__supabase.storage
            .from("story-covers")
            .getPublicUrl(story.cover_path);
        if (data?.publicUrl) return data.publicUrl;
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
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return "★".repeat(n) + "☆".repeat(5 - n);
}
