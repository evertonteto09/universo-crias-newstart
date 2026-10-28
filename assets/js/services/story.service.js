import { normalizeStoryGenres } from "../core/story-genres.js?v=20261028-story-genres-1";

import { supabase } from "../core/supabase.js";

export async function getPublishedStories() {
    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            writer_id,
            title,
            slug,
            description,
            status,
            published_at,
            cover_type,
            cover_url,
            cover_path,
            writers!stories_writer_id_fkey (
                id,
                name,
                username
            ),
            story_collaborators (
                writer_id,
                writers!story_collaborators_writer_id_fkey (
                    id,
                    name,
                    username
                )
            ),
            seasons (
                id,
                number,
                title,
                status,
                published_at,
                chapters (
                    id,
                    number,
                    title,
                    status
                )
            )
        `)
        .eq("status", "published")
        .order("title");

    if (error) {
        throw error;
    }

    return (data ?? []).map((story) => ({
        ...story,
        seasons: (story.seasons ?? [])
            .filter((season) => season.status === "published")
            .map((season) => ({
                ...season,
                chapters: (season.chapters ?? [])
                    .filter(
                        (chapter) =>
                            chapter.status === "published"
                    )
                    .sort(
                        (a, b) =>
                            a.number - b.number
                    ),
            }))
            .sort(
                (a, b) => a.number - b.number
            ),
    }));
}

export async function getPublishedStoryBySlug(slug) {
    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            writer_id,
            title,
            slug,
            description,
            genres,
            status,
            published_at,
            cover_type,
            cover_url,
            cover_path,
            writers!stories_writer_id_fkey (
                id,
                name,
                username
            ),
            story_collaborators (
                writer_id,
                writers!story_collaborators_writer_id_fkey (
                    id,
                    name,
                    username
                )
            ),
            seasons (
                id,
                number,
                title,
                status,
                published_at,
                chapters (
                    id,
                    number,
                    title,
                    status
                )
            )
        `)
        .eq("slug", slug)
        .eq("status", "published")
        .single();

    if (error) {
        throw error;
    }

    return {
        ...data,
        seasons: (data.seasons ?? [])
            .filter((season) => season.status === "published")
            .map((season) => ({
                ...season,
                chapters: (season.chapters ?? [])
                    .filter(
                        (chapter) =>
                            chapter.status === "published"
                    )
                    .sort(
                        (a, b) =>
                            a.number - b.number
                    ),
            }))
            .sort(
                (a, b) => a.number - b.number
            ),
    };
}

export async function getWriterStoryById(storyId) {
    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            writer_id,
            title,
            slug,
            description,
            genres,
            cover_type,
            cover_url,
            cover_path,
            status,
            published_at,
            created_at,
            updated_at,
            writers!stories_writer_id_fkey (
                id,
                name,
                username
            ),
            story_collaborators (
                story_id,
                writer_id,
                created_at,
                writers!story_collaborators_writer_id_fkey (
                    id,
                    name,
                    username
                )
            ),
            seasons (
                id,
                story_id,
                number,
                title,
                status,
                published_at,
                chapters (
                    id,
                    season_id,
                    number,
                    title,
                    status,
                    scheduled_publish_at,
                    content_format
                )
            )
        `)
        .eq("id", storyId)
        .single();

    if (error) {
        throw error;
    }

    return {
        ...data,
        seasons: (data.seasons ?? [])
            .sort((a, b) => a.number - b.number)
            .map((season) => ({
                ...season,
                chapters: (season.chapters ?? [])
                    .sort(
                        (a, b) =>
                            a.number - b.number
                    ),
            })),
    };
}

export async function updateStory(
    storyId,
    {
        title,
        description,
        coverType,
        coverUrl,
        coverPath,
        genres,
    },
) {
    const cleanTitle =
        String(title ?? "").trim();

    if (!cleanTitle) {
        throw new Error(
            "O título da história é obrigatório."
        );
    }

    const payload = {
        title: cleanTitle,
        description:
            String(description ?? "").trim() ||
            null,
        cover_type: coverType,
        cover_url:
            coverType === "url"
                ? String(coverUrl ?? "").trim() || null
                : null,
        cover_path:
            coverType === "upload"
                ? String(coverPath ?? "").trim() || null
                : null,
    };

    // Permite que chamadas futuras que não conheçam gêneros não apaguem o campo.
    if (genres !== undefined) {
        payload.genres = normalizeStoryGenres(genres);
    }

    const { data, error } = await supabase
        .from("stories")
        .update(payload)
        .eq("id", storyId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function updateStoryStatus(storyId, status) {
    if (status !== "draft" && status !== "published") {
        throw new Error("Estado de publicação inválido.");
    }

    const payload = {
        status,
        published_at:
            status === "published"
                ? new Date().toISOString()
                : null,
    };

    const { data, error } = await supabase
        .from("stories")
        .update(payload)
        .eq("id", storyId)
        .select("id, status, published_at, updated_at")
        .single();

    if (error) {
        throw error;
    }

    return data;
}


export async function getStoryReviewSummary(storyId) {
    const { data, error } = await supabase
        .from("reviews")
        .select("rating")
        .eq("story_id", storyId)
        .is("chapter_id", null)
        .eq("status", "published");

    if (error) {
        throw error;
    }

    const ratings = data ?? [];

    if (!ratings.length) {
        return {
            average: 0,
            count: 0,
        };
    }

    const total = ratings.reduce(
        (sum, item) =>
            sum + Number(item.rating || 0),
        0,
    );

    return {
        average: total / ratings.length,
        count: ratings.length,
    };
}


export function getPublishedChaptersInOrder(story) {
    return (story?.seasons ?? [])
        .flatMap((season) =>
            (season.chapters ?? [])
                .filter(
                    (chapter) =>
                        chapter.status === "published"
                )
                .map((chapter) => ({
                    ...chapter,
                    season_number: season.number,
                    season_title: season.title,
                }))
        )
        .sort((a, b) => {
            if (a.season_number !== b.season_number) {
                return a.season_number - b.season_number;
            }

            return a.number - b.number;
        });
}


export async function deleteStory(storyId) {
    const { data, error } = await supabase
        .from("stories")
        .delete()
        .eq("id", storyId)
        .select("id, cover_path")
        .single();

    if (error) {
        throw error;
    }

    return data;
}
