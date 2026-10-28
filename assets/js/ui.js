import { getStoryCoverUrl } from "./services/storage.service.js";
import { setupTheme as setupSharedTheme } from "./core/theme.js?v=20261028-crias-presence-images-1";

const DEFAULT_COVER = "./assets/img/default-story-cover.svg";

export function setupTheme() {
    setupSharedTheme();
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
