import { supabase } from "../core/supabase.js";
import { getCurrentUser } from "./auth.service.js";
import { slugify } from "../core/utils.js";
import { normalizeStoryGenres } from "../core/story-genres.js?v=20261028-story-genres-1";

export async function getMyWriterAccount() {
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    const { data, error } = await supabase
        .from("writer_accounts")
        .select("writer_id, auth_user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) return null;

    return {
        ...data,
        auth_user: user,
    };
}

export async function getMyStories() {
    const writer = await getMyWriterAccount();

    if (!writer) {
        return [];
    }

    const storyFields = `
        id,
        writer_id,
        title,
        slug,
        description,
        cover_type,
        cover_url,
        cover_path,
        status,
        published_at,
        created_at,
        updated_at
    `;

    const [ownedResult, collaborationsResult] = await Promise.all([
        supabase
            .from("stories")
            .select(storyFields)
            .eq("writer_id", writer.writer_id)
            .order("title"),
        supabase
            .from("story_collaborators")
            .select("story_id")
            .eq("writer_id", writer.writer_id),
    ]);

    if (ownedResult.error) throw ownedResult.error;
    if (collaborationsResult.error) throw collaborationsResult.error;

    const ownedStories = (ownedResult.data ?? []).map((story) => ({
        ...story,
        collaboration_role: "owner",
    }));

    const ownedIds = new Set(ownedStories.map((story) => String(story.id)));
    const collaboratedIds = [...new Set(
        (collaborationsResult.data ?? [])
            .map((row) => Number(row.story_id))
            .filter((id) => Number.isSafeInteger(id) && id > 0)
            .filter((id) => !ownedIds.has(String(id))),
    )];

    if (!collaboratedIds.length) {
        return ownedStories;
    }

    const { data: collaboratedStories, error: collaboratedError } = await supabase
        .from("stories")
        .select(storyFields)
        .in("id", collaboratedIds)
        .order("title");

    if (collaboratedError) throw collaboratedError;

    return [
        ...ownedStories,
        ...(collaboratedStories ?? []).map((story) => ({
            ...story,
            collaboration_role: "coauthor",
        })),
    ].sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "pt-BR", { sensitivity: "base" }));
}

export async function createStory({
    title,
    description = null,
    coverType = "none",
    coverUrl = null,
    coverPath = null,
    genres = [],
}) {
    const writer = await getMyWriterAccount();

    if (!writer) {
        throw new Error(
            "Conta de escritor não encontrada."
        );
    }

    const cleanTitle =
        String(title ?? "").trim();

    if (!cleanTitle) {
        throw new Error(
            "O título da história é obrigatório."
        );
    }

    const slug = slugify(cleanTitle);

    if (!slug) {
        throw new Error(
            "Não foi possível gerar um endereço para essa história. Use letras ou números no título."
        );
    }

    const { data, error } = await supabase
        .from("stories")
        .insert({
            writer_id: writer.writer_id,
            title: cleanTitle,
            slug,
            description:
                description
                    ? String(description).trim()
                    : null,
            status: "draft",
            published_at: null,
            cover_type: coverType,
            cover_url:
                coverType === "url"
                    ? coverUrl
                    : null,
            cover_path:
                coverType === "upload"
                    ? coverPath
                    : null,
            genres: normalizeStoryGenres(genres),
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}
