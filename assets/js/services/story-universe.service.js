import { supabase } from "../core/supabase.js";
import { slugify } from "../core/utils.js";

function positiveId(value, label) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`${label} inválido.`);
    }
    return id;
}

function cleanText(value, maxLength, label, required = false) {
    const text = String(value ?? "").trim();
    if (required && !text) throw new Error(`${label} é obrigatório.`);
    if (text.length > maxLength) throw new Error(`${label} excede o limite de ${maxLength} caracteres.`);
    return text || null;
}

function cleanCoverUrl(value) {
    const url = String(value ?? "").trim();
    if (!url) return null;
    if (url.length > 2048 || !/^https:\/\/[^\s]+$/i.test(url)) {
        throw new Error("A imagem do universo precisa ser um link HTTPS válido.");
    }
    return url;
}

function cleanRelationship(value) {
    const relationship = String(value ?? "spin_off");
    if (!["spin_off", "complementary"].includes(relationship)) {
        throw new Error("Tipo de relação inválido. Escolha spin-off ou complementar.");
    }
    return relationship;
}

export async function getMyStoryUniverses() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) return [];

    const { data, error } = await supabase
        .from("story_universes")
        .select(`
            id,
            name,
            slug,
            description,
            cover_url,
            created_at,
            updated_at,
            story_universe_stories (
                universe_id,
                story_id,
                relationship_type,
                reading_order,
                status,
                created_at,
                stories!story_universe_stories_story_id_fkey (
                    id,
                    title,
                    slug,
                    writer_id,
                    status,
                    writers!stories_writer_id_fkey (
                        name,
                        username
                    )
                )
            )
        `)
        .eq("created_by", authData.user.id)
        .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((universe) => ({
        ...universe,
        story_universe_stories: [...(universe.story_universe_stories ?? [])]
            .sort((a, b) => Number(a.reading_order) - Number(b.reading_order)),
    }));
}

export async function getIncomingStoryUniverseRequests() {
    const { data, error } = await supabase
        .from("story_universe_stories")
        .select(`
            universe_id,
            story_id,
            relationship_type,
            reading_order,
            created_at,
            story_universes!story_universe_stories_universe_id_fkey (
                id,
                name,
                slug
            ),
            stories!story_universe_stories_story_id_fkey (
                id,
                title,
                slug,
                writer_id,
                writers!stories_writer_id_fkey (
                    name,
                    username
                )
            )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function searchPublishedStoriesForUniverse(query, ownWriterId) {
    const term = String(query ?? "").trim().replace(/[\\%_]/g, "\\$&");
    if (term.length < 2) return [];

    const writerId = positiveId(ownWriterId, "Conta de escritor");
    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            title,
            slug,
            writer_id,
            writers!stories_writer_id_fkey (
                name,
                username
            )
        `)
        .eq("status", "published")
        .neq("writer_id", writerId)
        .ilike("title", `%${term}%`)
        .order("title")
        .limit(12);

    if (error) throw error;
    return data ?? [];
}

export async function createStoryUniverse({ storyId, name, description = null, coverUrl = null }) {
    const normalizedStoryId = positiveId(storyId, "História principal");
    const cleanName = cleanText(name, 100, "Nome do universo", true);
    const slug = slugify(cleanName);
    if (!slug) throw new Error("Não foi possível gerar um endereço para esse universo.");

    const { data, error } = await supabase.rpc("create_story_universe", {
        p_story_id: normalizedStoryId,
        p_name: cleanName,
        p_slug: slug,
        p_description: cleanText(description, 1200, "Descrição"),
        p_cover_url: cleanCoverUrl(coverUrl),
    });

    if (error) throw error;
    return Number(data);
}

export async function updateStoryUniverseDetails(universeId, { name, description = null, coverUrl = null }) {
    const id = positiveId(universeId, "Universo");
    const cleanName = cleanText(name, 100, "Nome do universo", true);
    const slug = slugify(cleanName);
    if (!slug) throw new Error("Não foi possível gerar um endereço para esse universo.");

    const { error } = await supabase.rpc("update_story_universe_details", {
        p_universe_id: id,
        p_name: cleanName,
        p_slug: slug,
        p_description: cleanText(description, 1200, "Descrição"),
        p_cover_url: cleanCoverUrl(coverUrl),
    });

    if (error) throw error;
}

export async function deleteStoryUniverse(universeId) {
    const id = positiveId(universeId, "Universo");
    const { error } = await supabase.rpc("delete_story_universe", { p_universe_id: id });
    if (error) throw error;
}

export async function addStoryToUniverse(universeId, storyId, relationshipType = "spin_off") {
    const id = positiveId(universeId, "Universo");
    const targetStoryId = positiveId(storyId, "História");
    const relationship = cleanRelationship(relationshipType);
    const { data, error } = await supabase.rpc("add_story_to_universe", {
        p_universe_id: id,
        p_story_id: targetStoryId,
        p_relationship_type: relationship,
    });

    if (error) throw error;
    return String(data || "pending");
}

export async function respondToStoryUniverseRequest(universeId, storyId, approve) {
    const id = positiveId(universeId, "Universo");
    const targetStoryId = positiveId(storyId, "História");
    const { error } = await supabase.rpc("respond_story_universe_request", {
        p_universe_id: id,
        p_story_id: targetStoryId,
        p_approve: approve === true,
    });
    if (error) throw error;
}

export async function removeStoryFromUniverse(universeId, storyId) {
    const id = positiveId(universeId, "Universo");
    const targetStoryId = positiveId(storyId, "História");
    const { error } = await supabase.rpc("remove_story_from_universe", {
        p_universe_id: id,
        p_story_id: targetStoryId,
    });
    if (error) throw error;
}

export async function setStoryUniverseMain(universeId, storyId) {
    const id = positiveId(universeId, "Universo");
    const targetStoryId = positiveId(storyId, "História");
    const { error } = await supabase.rpc("set_story_universe_main", {
        p_universe_id: id,
        p_story_id: targetStoryId,
    });
    if (error) throw error;
}

export async function moveStoryInUniverse(universeId, storyId, direction) {
    const id = positiveId(universeId, "Universo");
    const targetStoryId = positiveId(storyId, "História");
    if (!["up", "down"].includes(direction)) throw new Error("Direção de ordenação inválida.");
    const { error } = await supabase.rpc("move_story_in_universe", {
        p_universe_id: id,
        p_story_id: targetStoryId,
        p_direction: direction,
    });
    if (error) throw error;
}
