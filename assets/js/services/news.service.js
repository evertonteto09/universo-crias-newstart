import { supabase } from "../core/supabase.js";


function normalizeId(value) {
    const numericId =
        Number(value);

    if (
        !Number.isInteger(numericId) ||
        numericId <= 0
    ) {
        throw new Error(
            "ID da notícia inválido."
        );
    }

    return numericId;
}


function normalizeTitle(value) {
    const title =
        String(value ?? "").trim();

    if (!title) {
        throw new Error(
            "O título da notícia é obrigatório."
        );
    }

    if (title.length > 200) {
        throw new Error(
            "O título da notícia deve ter no máximo 200 caracteres."
        );
    }

    return title;
}


function normalizeContent(value) {
    const content =
        String(value ?? "").trim();

    if (!content) {
        throw new Error(
            "O conteúdo da notícia é obrigatório."
        );
    }

    if (content.length > 10000) {
        throw new Error(
            "O conteúdo da notícia deve ter no máximo 10.000 caracteres."
        );
    }

    return content;
}


export async function getWriterStoryNews(storyId) {
    const numericStoryId =
        normalizeId(storyId);

    const { data, error } =
        await supabase
            .from("story_news")
            .select(
                "id, story_id, title, content, created_at, updated_at"
            )
            .eq(
                "story_id",
                numericStoryId
            )
            .order("created_at", {
                ascending: false,
            });

    if (error) {
        throw error;
    }

    return data ?? [];
}


export async function createStoryNews({
    storyId,
    title,
    content,
}) {
    const numericStoryId =
        normalizeId(storyId);

    const cleanTitle =
        normalizeTitle(title);

    const cleanContent =
        normalizeContent(content);

    const { data, error } =
        await supabase
            .from("story_news")
            .insert({
                story_id:
                    numericStoryId,
                title: cleanTitle,
                content: cleanContent,
            })
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}


export async function updateStoryNews(
    newsId,
    {
        title,
        content,
    }
) {
    const numericNewsId =
        normalizeId(newsId);

    const cleanTitle =
        normalizeTitle(title);

    const cleanContent =
        normalizeContent(content);

    const { data, error } =
        await supabase
            .from("story_news")
            .update({
                title: cleanTitle,
                content: cleanContent,
            })
            .eq(
                "id",
                numericNewsId
            )
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}


export async function deleteStoryNews(
    newsId
) {
    const numericNewsId =
        normalizeId(newsId);

    const { error } =
        await supabase
            .from("story_news")
            .delete()
            .eq(
                "id",
                numericNewsId
            );

    if (error) {
        throw error;
    }
}


export async function getPublishedStoryNews(storyId) {
    const numericStoryId =
        normalizeId(storyId);

    const { data, error } =
        await supabase
            .from("story_news")
            .select(
                "id, story_id, title, content, created_at, updated_at"
            )
            .eq(
                "story_id",
                numericStoryId
            )
            .order("created_at", {
                ascending: false,
            });

    if (error) {
        throw error;
    }

    return data ?? [];
}