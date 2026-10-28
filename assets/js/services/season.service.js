import { supabase } from "../core/supabase.js";

export async function getWriterSeasons(
    storyId,
) {
    const { data, error } = await supabase
        .from("seasons")
        .select(`
            id,
            story_id,
            number,
            title,
            status,
            published_at,
            chapters (
                id,
                number,
                title,
                status,
                scheduled_publish_at,
                content_format
            )
        `)
        .eq("story_id", storyId)
        .order("number");

    if (error) {
        throw error;
    }

    return (data ?? []).map((season) => ({
        ...season,
        chapters: (season.chapters ?? [])
            .sort(
                (a, b) =>
                    a.number - b.number
            ),
    }));
}

export async function createSeason(
    storyId,
    number,
    title,
) {
    const cleanTitle =
        String(title ?? "").trim();

    if (!cleanTitle) {
        throw new Error(
            "O nome da temporada é obrigatório."
        );
    }

    if (
        !Number.isInteger(Number(number)) ||
        Number(number) < 1
    ) {
        throw new Error(
            "O número da temporada precisa ser 1 ou maior."
        );
    }

    const { data, error } =
        await supabase
            .from("seasons")
            .insert({
                story_id: storyId,
                number: Number(number),
                title: cleanTitle,
            })
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function updateSeason(
    seasonId,
    title,
) {
    const cleanTitle =
        String(title ?? "").trim();

    if (!cleanTitle) {
        throw new Error(
            "O nome da temporada é obrigatório."
        );
    }

    const { data, error } =
        await supabase
            .from("seasons")
            .update({
                title: cleanTitle,
            })
            .eq("id", seasonId)
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}


export async function deleteSeason(seasonId) {
    const { data, error } = await supabase
        .from("seasons")
        .delete()
        .eq("id", seasonId)
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Lê o estado persistido pela sincronização no banco.
 * O estado da temporada é mantido por trigger no Supabase, não pelo cliente.
 */
export async function getSeasonPublicationStatus(seasonId) {
    const { data, error } = await supabase
        .from("seasons")
        .select("id, status")
        .eq("id", seasonId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data?.status ?? null;
}
