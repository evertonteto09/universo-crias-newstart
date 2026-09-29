const DEFAULT_COVER = "./assets/img/default-story-cover.svg";

export function setupTheme() {
    const saved = localStorage.getItem("hdc-theme") || "neblina";
    document.documentElement.dataset.theme = saved;

    const button = document.querySelector("#theme-toggle");
    if (!button) return;

    const themes = ["neblina", "preto", "branco"];
    button.addEventListener("click", () => {
        const current = document.documentElement.dataset.theme || "neblina";
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        document.documentElement.dataset.theme = next;
        localStorage.setItem("hdc-theme", next);
        button.textContent = `Tema: ${next}`;
    });

    button.textContent = `Tema: ${saved}`;
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
