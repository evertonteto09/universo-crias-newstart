const DEFAULT_COVER =
    new URL("../../img/default-story-cover.svg", import.meta.url).href;

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function ratingStars(rating) {
    const score = Math.max(
        0,
        Math.min(10, Number(rating) || 0),
    );
    const visualScore = score / 2;
    const stars = Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(
            0,
            Math.min(1, visualScore - index),
        ) * 100;

        return `
            <span class="rating-star" aria-hidden="true">
                <span class="rating-star-empty">☆</span>
                <span class="rating-star-fill" style="width:${fill}%">★</span>
            </span>
        `;
    }).join("");

    return `
        <span class="rating-stars" role="img" aria-label="${score > 0 ? `Nota ${score.toFixed(1)} de 10` : "Sem avaliações"}">
            ${stars}
        </span>
    `;
}

export async function storyCoverSource(story, getUploadUrl) {
    if (
        story?.cover_type === "url" &&
        typeof story.cover_url === "string" &&
        story.cover_url.trim()
    ) {
        return story.cover_url.trim();
    }

    if (
        story?.cover_type === "upload" &&
        story.cover_path
    ) {
        try {
            const signedUrl = await getUploadUrl(story.cover_path);
            if (signedUrl) {
                return signedUrl;
            }
        } catch (error) {
            console.warn("Não foi possível gerar uma URL temporária para a capa.", error);
        }
    }

    return DEFAULT_COVER;
}

export function showMessage(
    element,
    message,
    type = "",
) {
    if (!element) return;

    element.textContent = message;
    element.className =
        `form-message${type ? ` ${type}` : ""}`;
}

export function slugify(text) {
    return String(text ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "medium",
            timeStyle: "short",
        },
    ).format(date);
}
