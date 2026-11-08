import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const LEGACY_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SECRET_KEYS_RAW = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}";

let defaultSecretKey = "";
try {
    const secretKeys = JSON.parse(SECRET_KEYS_RAW);
    defaultSecretKey = typeof secretKeys?.default === "string"
        ? secretKeys.default
        : "";
} catch {
    defaultSecretKey = "";
}

const SERVICE_ROLE_KEY = LEGACY_SERVICE_ROLE_KEY || defaultSecretKey;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase Edge Function environment variables.");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
};

const ALLOWED_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "avif",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function response(
    status: number,
    body = "Not found",
    headers: Record<string, string> = {},
) {
    return new Response(body, {
        status,
        headers: {
            ...CORS_HEADERS,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": "text/plain; charset=utf-8",
            ...headers,
        },
    });
}

function validId(value: string | null): number | null {
    if (!value || !/^\d{1,15}$/.test(value)) {
        return null;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getVersionToken(path: string): string | null {
    const filename = path.split("/").pop() ?? "";
    // Story/universe covers use UUID.ext; chapter images use UUID-name.ext.
    const match = filename.match(/^([a-f0-9-]{36})(?:-.+)?\.[a-z0-9]+$/i);
    return match?.[1] ?? null;
}

function getExtension(path: string): string {
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? "";
}

function mimeTypeFor(ext: string, blobType: string): string | null {
    const known: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        avif: "image/avif",
    };

    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return null;
    }

    const type = blobType.toLowerCase();
    if (type.startsWith("image/") && type !== "image/svg+xml") {
        // The extension allowlist determines the response MIME type.
        return known[ext] ?? null;
    }

    return known[ext] ?? null;
}

function firstImagePath(content: string): string | null {
    const firstLine = String(content ?? "")
        .replaceAll("\r\n", "\n")
        .split("\n")
        .find((line) => line.trim().length > 0)
        ?.trim() ?? "";

    const match = firstLine.match(
        /^\[\[image:([^\]\n|]+)(?:\|[^\]\n]*)?\]\]$/i,
    );
    const source = String(match?.[1] ?? "").trim();

    return source.startsWith("chapters/") ? source : null;
}

async function universeHasPublicStory(universeId: number): Promise<boolean> {
    // Mirror the public universe page rule: at least one approved story
    // association must point to a published story.
    const { data: approvedLinks, error: linksError } = await admin
        .from("story_universe_stories")
        .select("story_id")
        .eq("universe_id", universeId)
        .eq("status", "approved")
        .limit(500);

    if (linksError) {
        throw linksError;
    }

    const storyIds = [
        ...new Set(
            (approvedLinks ?? [])
                .map((link) => Number(link.story_id))
                .filter((storyId) => Number.isSafeInteger(storyId) && storyId > 0),
        ),
    ];

    if (storyIds.length === 0) {
        return false;
    }

    const { data: publishedStory, error: publishedStoryError } = await admin
        .from("stories")
        .select("id")
        .in("id", storyIds)
        .eq("status", "published")
        .limit(1)
        .maybeSingle();

    if (publishedStoryError) {
        throw publishedStoryError;
    }

    return Boolean(publishedStory);
}

async function resolvePublishedStorageImage(
    kind: string,
    id: number,
    version: string,
): Promise<{ blob: Blob; contentType: string } | null> {
    if (!/^[a-f0-9-]{36}$/i.test(version)) {
        return null;
    }

    let bucket: string;
    let path: string | null = null;

    if (kind === "story") {
        const { data: story, error } = await admin
            .from("stories")
            .select("id, status, cover_type, cover_path")
            .eq("id", id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (
            !story ||
            story.status !== "published" ||
            story.cover_type !== "upload" ||
            !story.cover_path
        ) {
            return null;
        }

        path = String(story.cover_path);
        const validStoryPath = new RegExp(
            `^stories/${id}/[a-f0-9-]{36}\\.(?:jpg|jpeg|png|webp|gif|avif)$`,
            "i",
        );

        if (!validStoryPath.test(path)) {
            return null;
        }

        bucket = "story-covers";
    } else if (kind === "chapter") {
        const { data: chapter, error: chapterError } = await admin
            .from("chapters")
            .select("id, season_id, status, content")
            .eq("id", id)
            .maybeSingle();

        if (chapterError) {
            throw chapterError;
        }

        if (!chapter || chapter.status !== "published") {
            return null;
        }

        const { data: season, error: seasonError } = await admin
            .from("seasons")
            .select("id, story_id, status")
            .eq("id", chapter.season_id)
            .maybeSingle();

        if (seasonError) {
            throw seasonError;
        }

        if (!season || season.status !== "published") {
            return null;
        }

        const { data: story, error: storyError } = await admin
            .from("stories")
            .select("id, status")
            .eq("id", season.story_id)
            .maybeSingle();

        if (storyError) {
            throw storyError;
        }

        if (!story || story.status !== "published") {
            return null;
        }

        path = firstImagePath(String(chapter.content ?? ""));

        // Chapter image objects use UUID-originalFilename.ext.
        const validChapterPath = new RegExp(
            `^chapters/${id}/[a-f0-9-]{36}(?:-[a-zA-Z0-9._() -]{1,150})?\\.(?:jpg|jpeg|png|webp|gif|avif)$`,
            "i",
        );

        if (!path || !validChapterPath.test(path)) {
            return null;
        }

        bucket = "chapter-images";
    } else if (kind === "universe") {
        const { data: universe, error: universeError } = await admin
            .from("story_universes")
            .select("id, created_by, cover_path")
            .eq("id", id)
            .maybeSingle();

        if (universeError) {
            throw universeError;
        }

        if (!universe?.cover_path || !universe?.created_by) {
            return null;
        }

        path = String(universe.cover_path);

        // Private bucket path format: <owner UUID>/<universe ID>/<file UUID>.<ext>.
        const ownerId = String(universe.created_by).toLowerCase();
        const expectedPrefix = `${ownerId}/${id}/`;

        if (!path.toLowerCase().startsWith(expectedPrefix)) {
            return null;
        }

        const filename = path.slice(expectedPrefix.length);
        if (!/^[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(filename)) {
            return null;
        }

        if (!(await universeHasPublicStory(id))) {
            return null;
        }

        bucket = "story-universe-covers";
    } else {
        return null;
    }

    const extension = getExtension(path);
    if (
        !ALLOWED_EXTENSIONS.has(extension) ||
        getVersionToken(path) !== version
    ) {
        return null;
    }

    const { data: blob, error: downloadError } = await admin.storage
        .from(bucket)
        .download(path);

    if (downloadError || !blob || blob.size > MAX_IMAGE_BYTES) {
        return null;
    }

    const contentType = mimeTypeFor(extension, blob.type || "");
    if (!contentType) {
        return null;
    }

    return { blob, contentType };
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: CORS_HEADERS,
        });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        return response(405, "Method not allowed", {
            Allow: "GET, HEAD, OPTIONS",
        });
    }

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "";
    const id = validId(url.searchParams.get("id"));
    const version = url.searchParams.get("v") ?? "";

    if (!id || !["story", "chapter", "universe"].includes(kind)) {
        return response(404);
    }

    try {
        const resolved = await resolvePublishedStorageImage(kind, id, version);
        if (!resolved) {
            return response(404);
        }

        const headers = {
            ...CORS_HEADERS,
            "Content-Type": resolved.contentType,
            "Content-Disposition": "inline",
            "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "cross-origin",
        };

        return new Response(
            request.method === "HEAD" ? null : await resolved.blob.arrayBuffer(),
            {
                status: 200,
                headers,
            },
        );
    } catch (error) {
        console.error("crias-presence-image error:", error);
        return response(500, "Image temporarily unavailable");
    }
});
