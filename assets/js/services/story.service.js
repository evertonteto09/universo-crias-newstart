import { supabase } from "../core/supabase.js";

export async function getPublishedStories() {
    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            title,
            slug,
            description,
            cover_type,
            cover_url,
            cover_path,
            seasons (
                id,
                number,
                title,
                chapters (
                    id,
                    number,
                    title,
                    status
                )
            )
        `)
        .order("title");

    if (error) {
        throw error;
    }

    return (data ?? []).map((story) => ({
        ...story,
        seasons: (story.seasons ?? [])
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
            title,
            slug,
            description,
            cover_type,
            cover_url,
            cover_path,
            seasons (
                id,
                number,
                title,
                chapters (
                    id,
                    number,
                    title,
                    status
                )
            )
        `)
        .eq("slug", slug)
        .single();

    if (error) {
        throw error;
    }

    return {
        ...data,
        seasons: (data.seasons ?? [])
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
            cover_type,
            cover_url,
            cover_path,
            created_at,
            updated_at,
            seasons (
                id,
                story_id,
                number,
                title,
                chapters (
                    id,
                    season_id,
                    number,
                    title,
                    status,
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
