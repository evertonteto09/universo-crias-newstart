import { supabase } from "../core/supabase.js";
import { STORAGE_BUCKETS } from "../config.js";

const COVER_BUCKET =
    STORAGE_BUCKETS.STORY_COVERS;

const CHAPTER_IMAGE_BUCKET =
    "chapter-images";
const STORY_NEWS_IMAGE_BUCKET = "story-news-images";

const COVER_SIGNED_URL_TTL_SECONDS = 15 * 60;
const coverUrlCache = new Map();

// URLs específicas para Rich Presence vivem por mais tempo, pois o Discord
// precisa buscá-las fora do navegador. O site só as envia ao aplicativo quando
// o usuário opta por compartilhar imagens; isso não altera as políticas dos buckets.
const PRESENCE_IMAGE_URL_TTL_SECONDS = 24 * 60 * 60;
const PRESENCE_IMAGE_URL_CACHE_TTL_MS = 23 * 60 * 60 * 1000;
const presenceCoverUrlCache = new Map();
const presenceChapterImageUrlCache = new Map();

async function getPresenceSignedImageUrl(bucket, path, cache) {
    if (!path) return null;

    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, PRESENCE_IMAGE_URL_TTL_SECONDS);

    if (error) throw error;

    const url = data?.signedUrl || null;
    if (url) {
        // Renova uma hora antes do vencimento e não reutiliza URLs expiradas.
        cache.set(path, {
            url,
            expiresAt: Date.now() + PRESENCE_IMAGE_URL_CACHE_TTL_MS,
        });
    }
    return url;
}

export function getStoryCoverUrlForPresence(path) {
    return getPresenceSignedImageUrl(COVER_BUCKET, path, presenceCoverUrlCache);
}

export function getChapterImageUrlForPresence(path) {
    return getPresenceSignedImageUrl(CHAPTER_IMAGE_BUCKET, path, presenceChapterImageUrlCache);
}

export async function getStoryCoverUrl(path) {
    if (!path) return null;

    const cached = coverUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    const { data, error } = await supabase.storage
        .from(COVER_BUCKET)
        .createSignedUrl(path, COVER_SIGNED_URL_TTL_SECONDS);

    if (error) throw error;

    const url = data?.signedUrl || null;
    if (url) {
        // Renova antes do vencimento para evitar reutilizar uma URL expirada.
        coverUrlCache.set(path, {
            url,
            expiresAt: Date.now() + 13 * 60 * 1000,
        });
    }
    return url;
}

const chapterImageUrlCache = new Map();
const storyNewsImageUrlCache = new Map();

function validStoryNewsImagePath(path) {
    return /^stories\/\d+\/news\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(
        String(path ?? "").trim(),
    );
}

/**
 * Gera uma URL temporária para imagens privadas anexadas às notícias de uma história.
 * O bucket continua privado; as políticas de Storage controlam quais imagens podem
 * receber URL assinada para autores/coautores e leitores de histórias publicadas.
 */
export async function getStoryNewsImageUrl(path) {
    const value = String(path ?? "").trim();
    if (!validStoryNewsImagePath(value)) {
        throw new Error("Caminho de imagem de notícia inválido.");
    }

    const cached = storyNewsImageUrlCache.get(value);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const { data, error } = await supabase.storage
        .from(STORY_NEWS_IMAGE_BUCKET)
        .createSignedUrl(value, 60 * 60);

    if (error) throw error;

    const url = data?.signedUrl || null;
    if (url) {
        storyNewsImageUrlCache.set(value, {
            url,
            expiresAt: Date.now() + 55 * 60 * 1000,
        });
    }
    return url;
}

/** Envia uma imagem raster para o bucket privado de imagens de notícias. */
export async function uploadStoryNewsImage(storyId, file) {
    const numericStoryId = Number(storyId);
    if (!Number.isSafeInteger(numericStoryId) || numericStoryId <= 0) {
        throw new Error("História inválida para a imagem da notícia.");
    }
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
        throw new Error("Selecione um arquivo de imagem válido.");
    }

    const allowedTypes = new Set([
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
    ]);
    if (!allowedTypes.has(file.type.toLowerCase())) {
        throw new Error("Use uma imagem JPG, PNG, WEBP, GIF ou AVIF. SVG não é aceito.");
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new Error("A imagem não pode ultrapassar 5 MB.");
    }

    const extension = extensionFromFile(file);
    if (!["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(extension)) {
        throw new Error("Extensão de imagem não permitida.");
    }

    const path = `stories/${numericStoryId}/news/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
        .from(STORY_NEWS_IMAGE_BUCKET)
        .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
        });

    if (error) throw error;
    return { path };
}

export function extractStoryNewsImagePaths(content) {
    const paths = new Set();
    const source = String(content ?? "");
    const regex = /^[ \t]*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\][ \t]*(?:\r?\n|$)/gim;

    for (const match of source.matchAll(regex)) {
        const path = String(match[1] ?? "").trim();
        if (validStoryNewsImagePath(path)) paths.add(path);
    }
    return [...paths];
}

export async function removeStoryNewsImage(path) {
    const value = String(path ?? "").trim();
    if (!validStoryNewsImagePath(value)) {
        throw new Error("Caminho de imagem de notícia inválido.");
    }
    const { error } = await supabase.storage
        .from(STORY_NEWS_IMAGE_BUCKET)
        .remove([value]);
    if (error) throw error;
    storyNewsImageUrlCache.delete(value);
}

export async function getChapterImageUrl(path) {
    if (!path) return null;

    const cached = chapterImageUrlCache.get(path);
    if (
        cached &&
        cached.expiresAt > Date.now()
    ) {
        return cached.url;
    }

    const { data, error } =
        await supabase.storage
            .from(CHAPTER_IMAGE_BUCKET)
            .createSignedUrl(
                path,
                60 * 60,
            );

    if (error) {
        throw error;
    }

    const url =
        data?.signedUrl || null;

    if (url) {
        chapterImageUrlCache.set(path, {
            url,
            expiresAt:
                Date.now() +
                55 * 60 * 1000,
        });
    }

    return url;
}

function extensionFromFile(file) {
    const name = file?.name || "";
    const match =
        name.match(/\.([a-z0-9]+)$/i);

    if (match) {
        return match[1].toLowerCase();
    }

    const mime = file?.type || "";

    const known = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
    };

    return known[mime] || "webp";
}

export async function uploadStoryCover(
    storyId,
    file,
) {
    if (!file) {
        throw new Error(
            "Selecione uma imagem."
        );
    }

    if (!file.type.startsWith("image/")) {
        throw new Error(
            "O arquivo precisa ser uma imagem."
        );
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error(
            "A imagem não pode ultrapassar 5 MB."
        );
    }

    const extension =
        extensionFromFile(file);

    const objectPath =
        `stories/${storyId}/${crypto.randomUUID()}.${extension}`;

    const { error } =
        await supabase.storage
            .from(COVER_BUCKET)
            .upload(
                objectPath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type,
                },
            );

    if (error) {
        throw error;
    }

    return { path: objectPath };
}

export async function downloadStoryCover(path) {
    if (!path) return null;

    const { data, error } = await supabase.storage
        .from(COVER_BUCKET)
        .download(path);

    if (error) throw error;
    return data || null;
}

export async function restoreStoryCover(path, file) {
    if (!path || !file) return;

    const { error } = await supabase.storage
        .from(COVER_BUCKET)
        .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
        });

    if (error) throw error;
    coverUrlCache.delete(path);
}

export async function removeStoryCover(path) {
    if (!path) return;

    const { error } = await supabase.storage
        .from(COVER_BUCKET)
        .remove([path]);

    if (error) throw error;
    coverUrlCache.delete(path);
}

export async function uploadChapterImage(
    chapterId,
    file,
) {
    if (!Number.isInteger(Number(chapterId)) || Number(chapterId) <= 0) {
        throw new Error("Episódio inválido para a imagem.");
    }

    if (!file) {
        throw new Error("Selecione uma imagem.");
    }

    if (!file.type.startsWith("image/")) {
        throw new Error("O arquivo precisa ser uma imagem.");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("A imagem não pode ultrapassar 5 MB.");
    }

    const extension =
        extensionFromFile(file);

    const objectPath =
        `chapters/${Number(chapterId)}/${crypto.randomUUID()}.${extension}`;

    const { error } =
        await supabase.storage
            .from(CHAPTER_IMAGE_BUCKET)
            .upload(
                objectPath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type,
                },
            );

    if (error) {
        throw error;
    }

    return {
        path: objectPath,
        url: getChapterImageUrl(
            objectPath
        ),
    };
}

export function extractChapterImagePaths(content) {
    const paths = new Set();
    const source = String(content ?? "");

    const regex = /^\s*\[\[image:([^\]\n|]+)(?:\|[^\]\n]*)?\]\]\s*$/gim;

    for (const match of source.matchAll(regex)) {
        const value = String(match[1] ?? "").trim();

        if (!value || /^https?:\/\//i.test(value)) {
            continue;
        }

        if (value.startsWith("chapters/")) {
            paths.add(value);
        }
    }

    return Array.from(paths);
}

export async function removeChapterImagesFromContent(content) {
    const paths =
        extractChapterImagePaths(content);

    if (!paths.length) {
        return;
    }

    const { error } =
        await supabase.storage
            .from(CHAPTER_IMAGE_BUCKET)
            .remove(paths);

    if (error) {
        throw error;
    }
}


export async function removeChapterImage(
    path,
) {
    const value =
        String(path ?? "").trim();

    if (!value) {
        return;
    }

    if (
        !value.startsWith("chapters/") ||
        /^https?:\/\//i.test(value)
    ) {
        throw new Error(
            "Caminho de imagem inválido."
        );
    }

    const { error } =
        await supabase.storage
            .from(CHAPTER_IMAGE_BUCKET)
            .remove([value]);

    if (error) {
        throw error;
    }

    chapterImageUrlCache.delete(value);
}
