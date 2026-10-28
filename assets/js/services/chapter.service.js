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
                writer_id,
                title,
                slug,
                status,
                cover_type,
                cover_url,
                cover_path,
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
            scheduled_publish_at,
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
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) {
        throw new Error("O título do episódio é obrigatório.");
    }

    const cleanContent = String(content ?? "");
    if (status === "published" && !cleanContent.trim()) {
        throw new Error("Um episódio precisa ter conteúdo antes de ser publicado.");
    }

    const payload = {
        title: cleanTitle,
        content: cleanContent,
        content_format: "plain_text",
    };

    // Omite o status quando a operação é apenas salvar conteúdo. Isso evita
    // que um autosave com uma aba aberta reverta a publicação feita pelo Cron.
    if (status === "published" || status === "draft") {
        payload.status = status;
    }

    // Publicação manual imediata substitui qualquer agendamento anterior.
    if (status === "published") {
        payload.scheduled_publish_at = null;
    }

    const { data, error } = await supabase
        .from("chapters")
        .update(payload)
        .eq("id", chapterId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    const seasonStatus = fetchSeasonStatus
        ? await readSeasonStatusAfterChapterWrite(data.season_id)
        : null;

    return { ...data, seasonStatus };
}

/**
 * Agenda a estreia de um episódio já escrito. O update exige que o capítulo
 * continue em rascunho no banco, evitando alterar acidentalmente um episódio
 * que o Cron já publicou enquanto o editor estava aberto.
 */
export async function scheduleChapterPublication(
    chapterId,
    { title, content, scheduledPublishAt },
) {
    const cleanTitle = String(title ?? "").trim();
    const cleanContent = String(content ?? "");
    const scheduledDate = new Date(scheduledPublishAt);

    if (!cleanTitle) {
        throw new Error("O título do episódio é obrigatório.");
    }
    if (!cleanContent.trim()) {
        throw new Error("Escreva o conteúdo do episódio antes de agendar a estreia.");
    }
    if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        throw new Error("Escolha uma data e um horário futuros.");
    }

    const { data, error } = await supabase
        .from("chapters")
        .update({
            title: cleanTitle,
            content: cleanContent,
            content_format: "plain_text",
            scheduled_publish_at: scheduledDate.toISOString(),
        })
        .eq("id", chapterId)
        .eq("status", "draft")
        .select()
        .maybeSingle();

    if (error) {
        throw error;
    }
    if (!data) {
        throw new Error("Este episódio já foi publicado ou não está mais disponível como rascunho. Recarregue o editor e tente novamente.");
    }

    return { ...data, seasonStatus: null };
}

/** Cancela um agendamento sem publicar nem apagar o episódio. */
export async function cancelChapterPublicationSchedule(
    chapterId,
    { title, content },
) {
    const cleanTitle = String(title ?? "").trim();
    const cleanContent = String(content ?? "");
    if (!cleanTitle) {
        throw new Error("O título do episódio é obrigatório.");
    }

    const { data, error } = await supabase
        .from("chapters")
        .update({
            title: cleanTitle,
            content: cleanContent,
            content_format: "plain_text",
            scheduled_publish_at: null,
        })
        .eq("id", chapterId)
        .eq("status", "draft")
        .not("scheduled_publish_at", "is", null)
        .select()
        .maybeSingle();

    if (error) {
        throw error;
    }
    if (!data) {
        throw new Error("O agendamento não está mais ativo. A estreia pode já ter sido publicada; recarregue o editor.");
    }

    return { ...data, seasonStatus: null };
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
