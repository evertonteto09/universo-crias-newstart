import { supabase } from "../core/supabase.js";

export async function getPublishedStoryReviews(
    storyId,
) {
    const { data, error } = await supabase
        .from("reviews")
        .select(`
            id,
            reader_name,
            rating,
            content,
            chapter_id,
            status,
            created_at
        `)
        .eq("story_id", storyId)
        .is("chapter_id", null)
        .eq("status", "published")
        .order("created_at", {
            ascending: false,
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}

export async function getPublishedChapterReviews(
    chapterId,
) {
    const { data, error } = await supabase
        .from("reviews")
        .select(`
            id,
            reader_name,
            rating,
            content,
            chapter_id,
            status,
            created_at
        `)
        .eq("chapter_id", chapterId)
        .eq("status", "published")
        .order("created_at", {
            ascending: false,
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}

export async function submitReview({
    storyId,
    chapterId = null,
    readerName,
    rating,
    content,
}) {
    const cleanName =
        String(readerName ?? "").trim();

    const cleanContent =
        String(content ?? "").trim();

    if (!cleanName) {
        throw new Error("Informe seu nome.");
    }

    if (
        !Number.isInteger(Number(rating)) ||
        Number(rating) < 1 ||
        Number(rating) > 10
    ) {
        throw new Error("A nota deve estar entre 1 e 10.");
    }

    if (!cleanContent) {
        throw new Error("Escreva sua avaliação.");
    }

    const { data, error } = await supabase
        .from("reviews")
        .insert({
            story_id: storyId,
            chapter_id: chapterId,
            reader_name: cleanName,
            rating: Number(rating),
            content: cleanContent,
            status: "published",
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}


function summarizeRatingRows(rows, keyName) {
    const grouped = {};

    for (const row of rows ?? []) {
        const key = String(row[keyName]);
        if (!grouped[key]) {
            grouped[key] = { sum: 0, count: 0 };
        }

        grouped[key].sum += Number(row.rating || 0);
        grouped[key].count += 1;
    }

    return Object.fromEntries(
        Object.entries(grouped).map(([key, value]) => [
            key,
            {
                average: value.count ? value.sum / value.count : 0,
                count: value.count,
            },
        ]),
    );
}

export async function getPublishedStoryRatingSummaries(storyIds) {
    const ids = [...new Set((storyIds ?? []).filter((id) => id !== null && id !== undefined).map(String))];
    if (!ids.length) return {};

    const { data, error } = await supabase
        .from("reviews")
        .select("story_id, rating")
        .in("story_id", ids)
        .is("chapter_id", null)
        .eq("status", "published");

    if (error) throw error;
    return summarizeRatingRows(data, "story_id");
}

export async function getPublishedChapterRatingSummaries(chapterIds) {
    const ids = [...new Set((chapterIds ?? []).filter((id) => id !== null && id !== undefined).map(String))];
    if (!ids.length) return {};

    const { data, error } = await supabase
        .from("reviews")
        .select("chapter_id, rating")
        .in("chapter_id", ids)
        .eq("status", "published");

    if (error) throw error;
    return summarizeRatingRows(data, "chapter_id");
}

export async function getWriterReviews(
    storyId,
) {
    const { data, error } = await supabase
        .from("reviews")
        .select(`
            id,
            reader_name,
            rating,
            content,
            chapter_id,
            status,
            created_at
        `)
        .eq("story_id", storyId)
        .order("created_at", {
            ascending: false,
        });

    if (error) {
        throw error;
    }

    return data ?? [];
}

export async function moderateReview(
    reviewId,
    status,
) {
    if (!["published", "hidden"].includes(status)) {
        throw new Error("Status de avaliação inválido.");
    }

    const { data, error } = await supabase
        .from("reviews")
        .update({ status })
        .eq("id", reviewId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}


export async function deleteReview(reviewId) {
    const { data, error } = await supabase
        .from("reviews")
        .delete()
        .eq("id", reviewId)
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    return data;
}
