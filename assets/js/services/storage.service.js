import { supabase } from "../core/supabase.js";
import { STORAGE_BUCKETS } from "../config.js";

const BUCKET =
    STORAGE_BUCKETS.STORY_COVERS;

export function getStoryCoverUrl(path) {
    if (!path) return null;

    const { data } =
        supabase.storage
            .from(BUCKET)
            .getPublicUrl(path);

    return data?.publicUrl || null;
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
            .from(BUCKET)
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
            .from(BUCKET)
            .remove([path]);

    if (error) {
        throw error;
    }
}
