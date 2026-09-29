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
        Number(rating) > 5
    ) {
        throw new Error("A nota deve estar entre 1 e 5.");
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
