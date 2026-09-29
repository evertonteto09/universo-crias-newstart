import { supabase } from "../core/supabase.js";

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
                seasons (
                    id,
                    number,
                    title,
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
            .single();

    if (storyError) {
        throw storyError;
    }

    const season =
        (story.seasons ?? []).find(
            (item) =>
                item.number ===
                Number(seasonNumber),
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

    return data;
}

export async function updateChapter(
    chapterId,
    {
        title,
        content,
        status,
    },
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

    if (
        status === "published" &&
        !cleanContent.trim()
    ) {
        throw new Error(
            "Um episódio precisa ter conteúdo antes de ser publicado."
        );
    }

    const updates = {
        title: cleanTitle,
        content: cleanContent,
        status:
            status === "published"
                ? "published"
                : "draft",
        content_format: "plain_text",
    };

    const { data, error } =
        await supabase
            .from("chapters")
            .update(updates)
            .eq("id", chapterId)
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}


export async function deleteChapter(chapterId) {
    const { data, error } = await supabase
        .from("chapters")
        .delete()
        .eq("id", chapterId)
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    return data;
}
