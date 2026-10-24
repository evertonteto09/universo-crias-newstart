import { supabase } from "../core/supabase.js";
import { removeChapterImagesFromContent } from "./storage.service.js";
import { getSeasonPublicationStatus } from "./season.service.js";

async function readSeasonStatusAfterChapterWrite(seasonId) {
    try {
        return await getSeasonPublicationStatus(seasonId);
    } catch (error) {
        // O trigger do banco já sincronizou o estado na mesma transação.
        // Falha nesta leitura auxiliar não deve transformar a gravação em erro.
        console.warn(
            "Não foi possível recarregar o estado da temporada após salvar o episódio:",
            error,
        );
        return null;
    }
}

export async function getPublishedChapter(
    storySlug,
    seasonNumber,
    episodeNumber,
) {
    const { data: story, error: storyError } =
        await supabase
            .from("stories")
            .select(`
                id,
                title,
                slug,
                status,
                seasons (
                    id,
                    number,
                    title,
                    status,
                    chapters (
                        id,
                        number,
                        title,
                        content,
                        status,
                        content_format
                    )
                )
            `)
            .eq("slug", storySlug)
            .eq("status", "published")
            .single();

    if (storyError) {
        throw storyError;
    }

    const season =
        (story.seasons ?? []).find(
            (item) =>
                item.number ===
                    Number(seasonNumber) &&
                item.status === "published",
        );

    const chapter =
        season?.chapters?.find(
            (item) =>
                item.number ===
                    Number(episodeNumber) &&
                item.status ===
                    "published",
        );

    if (!chapter) {
        return null;
    }

    return {
        story,
        season,
        chapter,
    };
}

export async function getWriterChapter(
    chapterId,
) {
    const { data, error } = await supabase
        .from("chapters")
        .select(`
            id,
            season_id,
            number,
            title,
            content,
            status,
            content_format,
            created_at,
            updated_at
        `)
        .eq("id", chapterId)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function createChapter({
    seasonId,
    number,
    title,
    content = "",
    status = "draft",
}) {
    const cleanTitle =
        String(title ?? "").trim();

    if (!cleanTitle) {
        throw new Error(
            "O título do episódio é obrigatório."
        );
    }

    if (
        !Number.isInteger(Number(number)) ||
        Number(number) < 0
    ) {
        throw new Error(
            "O número do episódio precisa ser 0 ou maior."
        );
    }

    const { data, error } =
        await supabase
            .from("chapters")
            .insert({
                season_id: seasonId,
                number: Number(number),
                title: cleanTitle,
                content:
                    String(content ?? ""),
                status:
                    status === "published"
                        ? "published"
                        : "draft",
                content_format:
                    "plain_text",
            })
            .select()
            .single();

    if (error) {
        throw error;
    }

    const seasonStatus = await readSeasonStatusAfterChapterWrite(seasonId);

    return { ...data, seasonStatus };
}

export async function updateChapter(
    chapterId,
    {
        title,
        content,
        status,
    },
    { fetchSeasonStatus = false } = {},
) {
    const cleanTitle =
        String(title ?? "").trim();

    if (!cleanTitle) {
        throw new Error(
            "O título do episódio é obrigatório."
        );
    }

    const cleanContent =
        String(content ?? "");

    const nextStatus =
        status === "published"
            ? "published"
            : "draft";

    if (
        nextStatus === "published" &&
        !cleanContent.trim()
    ) {
        throw new Error(
            "Um episódio precisa ter conteúdo antes de ser publicado."
        );
    }

    const { data, error } = await supabase
        .from("chapters")
        .update({
            title: cleanTitle,
            content: cleanContent,
            status: nextStatus,
            content_format: "plain_text",
        })
        .eq("id", chapterId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    // A mudança em chapters.status dispara a sincronização no banco.
    // Aqui apenas lemos o estado resultante para exibi-lo ao escritor.
    const seasonStatus = fetchSeasonStatus
        ? await readSeasonStatusAfterChapterWrite(data.season_id)
        : null;

    return { ...data, seasonStatus };
}

export async function deleteChapter(chapterId) {
    const { data: chapter, error: chapterError } =
        await supabase
            .from("chapters")
            .select("id, content, season_id, status")
            .eq("id", chapterId)
            .single();

    if (chapterError) {
        throw chapterError;
    }

    try {
        await removeChapterImagesFromContent(
            chapter.content,
        );
    } catch (error) {
        // A falha de limpeza do Storage não deve impedir
        // a exclusão do episódio no banco.
        console.warn(
            "Não foi possível limpar algumas imagens do episódio.",
            error,
        );
    }

    const { data, error } = await supabase
        .from("chapters")
        .delete()
        .eq("id", chapterId)
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    // O trigger do banco recalcula a temporada após a exclusão.
    const seasonStatus = await readSeasonStatusAfterChapterWrite(
        chapter.season_id,
    );
    return { ...data, seasonStatus };
}
