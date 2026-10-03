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


/**
 * Retorna as notícias de uma história para o escritor autenticado.
 *
 * A RLS do Supabase continua sendo a autoridade final:
 * somente notícias de histórias próprias podem ser alcançadas.
 */
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


/**
 * Cria uma notícia dentro de uma história do escritor autenticado.
 */
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


/**
 * Edita uma notícia pertencente a uma história do escritor.
 */
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


/**
 * Exclui uma notícia.
 *
 * A RLS garante que o escritor não consiga apagar
 * uma notícia de outra história.
 */
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


/**
 * Retorna as notícias publicadas de uma história para leitores.
 * A RLS do Supabase controla quais registros podem ser vistos.
 */
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
