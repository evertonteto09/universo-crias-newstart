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
    const safe = Math.max(
        0,
        Math.min(5, Math.round(Number(rating) || 0)),
    );

    return "★".repeat(safe) + "☆".repeat(5 - safe);
}

export function storyCoverSource(story, getUploadUrl) {
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
        const publicUrl = getUploadUrl(story.cover_path);

        if (publicUrl) {
            return publicUrl;
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
