import { SUPABASE_URL } from "../config.js";

export const CRIAS_PRESENCE_LOGO_URL = new URL("../../img/logo-universo-crias.webp", import.meta.url).href;

const RICH_PRESENCE_IMAGE_MAX_LENGTH = 300;
const PRESENCE_IMAGE_FUNCTION = `${String(SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/crias-presence-image`;

function normalizeHttpsUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" || url.username || url.password) return null;
        return url.href;
    } catch {
        return null;
    }
}

function versionTokenFromStoragePath(path) {
    const filename = String(path ?? "").split("/").pop() || "";
    const match = filename.match(/^([a-f0-9-]{36})(?:-.+)?\.[a-z0-9]+$/i);
    return match?.[1] ?? null;
}

function createStorageProxyUrl(kind, id, path) {
    const numericId = Number(id);
    const version = versionTokenFromStoragePath(path);
    if (!Number.isSafeInteger(numericId) || numericId <= 0 || !version) return null;

    const url = new URL(PRESENCE_IMAGE_FUNCTION);
    url.searchParams.set("kind", kind);
    url.searchParams.set("id", String(numericId));
    url.searchParams.set("v", version);
    const result = url.href;
    return result.length <= RICH_PRESENCE_IMAGE_MAX_LENGTH ? result : null;
}

function normalizeDirectDiscordImageUrl(value, context) {
    const url = normalizeHttpsUrl(value);
    if (!url) return null;
    if (url.length <= RICH_PRESENCE_IMAGE_MAX_LENGTH) return url;
    console.warn(`[Crias Presence] A URL externa da imagem de ${context} excede o limite de 300 caracteres. Será usada a imagem alternativa.`);
    return null;
}

export async function getPresenceUniverseCoverUrl(universe) {
    if (universe?.cover_path) {
        const proxyUrl = createStorageProxyUrl("universe", universe.id, universe.cover_path);
        if (proxyUrl) return proxyUrl;
        console.warn("[Crias Presence] Não foi possível criar uma URL curta para a capa do universo.");
    }

    if (universe?.cover_url) {
        return normalizeDirectDiscordImageUrl(universe.cover_url, "universo");
    }

    return null;
}

export async function getPresenceStoryCoverUrl(story) {
    if (story?.cover_type === "url") {
        return normalizeDirectDiscordImageUrl(story.cover_url, "história");
    }

    if (story?.cover_type === "upload" && story.cover_path) {
        if (story.status !== "published") return null;
        const proxyUrl = createStorageProxyUrl("story", story.id, story.cover_path);
        if (proxyUrl) return proxyUrl;
        console.warn("[Crias Presence] Não foi possível criar uma URL curta para a capa da história.");
    }

    return null;
}

export async function getPresenceChapterImageUrl(content, chapter = null) {
    const firstLine = String(content ?? "")
        .replaceAll("\r\n", "\n")
        .split("\n")
        .find((line) => line.trim().length > 0)?.trim() || "";

    const match = firstLine.match(/^\[\[image:([^\]\n|]+)(?:\|[^\]\n]*)?\]\]$/i);
    if (!match) return null;

    const source = String(match[1] ?? "").trim();
    const externalUrl = normalizeHttpsUrl(source);
    if (externalUrl) {
        if (externalUrl.length <= RICH_PRESENCE_IMAGE_MAX_LENGTH) return externalUrl;
        console.warn("[Crias Presence] A URL externa da imagem do episódio excede 300 caracteres; será usada a capa da história.");
        return null;
    }

    if (source.startsWith("chapters/")) {
        if (chapter && chapter.status !== "published") return null;
        const chapterIdFromPath = source.match(/^chapters\/(\d+)\//)?.[1];
        const chapterId = chapter?.id ?? chapterIdFromPath;
        if (!chapterId || (chapterIdFromPath && Number(chapterId) !== Number(chapterIdFromPath))) return null;
        const proxyUrl = createStorageProxyUrl("chapter", chapterId, source);
        if (proxyUrl) return proxyUrl;
        console.warn("[Crias Presence] Não foi possível criar uma URL curta para a imagem do episódio.");
    }

    return null;
}