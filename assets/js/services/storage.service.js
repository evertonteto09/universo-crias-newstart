import { supabase } from "../core/supabase.js";
import { STORAGE_BUCKETS } from "../config.js";

const COVER_BUCKET =
    STORAGE_BUCKETS.STORY_COVERS;

const CHAPTER_IMAGE_BUCKET =
    "chapter-images";

export function getStoryCoverUrl(path) {
    if (!path) return null;

    const { data } =
        supabase.storage
            .from(COVER_BUCKET)
            .getPublicUrl(path);

    return data?.publicUrl || null;
}

const chapterImageUrlCache = new Map();

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

    return {
        path: objectPath,
        url: getStoryCoverUrl(
            objectPath
        ),
    };
}

export async function removeStoryCover(
    path,
) {
    if (!path) return;

    const { error } =
        await supabase.storage
            .from(COVER_BUCKET)
            .remove([path]);

    if (error) {
        throw error;
    }
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
