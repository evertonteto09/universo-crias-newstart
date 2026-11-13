import { escapeHtml } from "./utils.js";

export function getStoryAuthors(story) {
    if (!story || typeof story !== "object") {
        return [];
    }

    const candidates = [
        {
            id: story.writer_id ?? story.writers?.id,
            name: story.writers?.name,
            username: story.writers?.username,
            role: "owner",
        },
        ...(Array.isArray(story.story_collaborators)
            ? story.story_collaborators.map((entry) => ({
                id: entry?.writer_id ?? entry?.writers?.id,
                name: entry?.writers?.name,
                username: entry?.writers?.username,
                role: "coauthor",
            }))
            : []),
    ];

    const seen = new Set();
    const authors = [];

    for (const candidate of candidates) {
        const id = candidate.id == null ? null : String(candidate.id);
        const username = String(candidate.username ?? "").trim();
        const name = String(candidate.name ?? username ?? "").trim();
        const key = id || (username ? `username:${username.toLowerCase()}` : null);

        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        authors.push({
            id: candidate.id ?? null,
            name: name || "Autor não informado",
            username,
            role: candidate.role,
        });
    }

    return authors;
}

export function renderStoryAuthorNames(story) {
    const authors = getStoryAuthors(story);
    if (!authors.length) {
        return "Autor não informado";
    }

    return authors
        .map((author) => escapeHtml(author.name))
        .join(", ");
}