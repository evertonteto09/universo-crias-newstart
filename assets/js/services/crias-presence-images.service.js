import { SUPABASE_URL } from "../config.js";

// A logo fica no próprio site e não passa pelo Storage privado.
export const CRIAS_PRESENCE_LOGO_URL = new URL("../../img/logo-universo-crias.webp", import.meta.url).href;

// A biblioteca RPC do Discord limita large_image/small_image a 300 caracteres.
// URLs assinadas do Supabase podem ultrapassar esse limite; para objetos privados
// publicados, usamos uma URL curta de uma Edge Function que valida o estado da obra
// e transmite apenas imagens de conteúdo publicado. O programa desktop nunca acessa
// o Supabase nem recebe credenciais.
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
    // As imagens de episódios são salvas como UUID-nome-original.ext.
    // A versão é o UUID inicial, não o nome inteiro antes da extensão.
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

/** Retorna a capa de uma história publicada via URL curta, ou uma URL externa curta. */
export async function getPresenceStoryCoverUrl(story) {
    if (story?.cover_type === "url") {
        return normalizeDirectDiscordImageUrl(story.cover_url, "história");
    }

    if (story?.cover_type === "upload" && story.cover_path) {
        // Não disponibiliza imagens de rascunhos por um endpoint público sem autenticação.
        if (story.status !== "published") return null;
        const proxyUrl = createStorageProxyUrl("story", story.id, story.cover_path);
        if (proxyUrl) return proxyUrl;
        console.warn("[Crias Presence] Não foi possível criar uma URL curta para a capa da história.");
    }

    return null;
}

/**
 * Usa a primeira linha não vazia do conteúdo quando ela é uma imagem.
 * Imagens externas usam sua URL original se ela couber no limite do Discord.
 * Imagens do bucket privado usam a Edge Function curta, somente para episódios
 * publicados. O texto/conteúdo completo nunca é enviado ao aplicativo desktop.
 */
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
