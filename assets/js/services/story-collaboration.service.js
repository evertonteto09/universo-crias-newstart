import { supabase } from "../core/supabase.js";

export async function getStoryCollaborators(storyId) {
    const numericStoryId = Number(storyId);
    if (!Number.isSafeInteger(numericStoryId) || numericStoryId <= 0) {
        throw new Error("História inválida para consultar a coautoria.");
    }

    const { data, error } = await supabase
        .from("story_collaborators")
        .select(`
            story_id,
            writer_id,
            created_at,
            writers!story_collaborators_writer_id_fkey (
                id,
                name,
                username
            )
        `)
        .eq("story_id", numericStoryId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}


export async function isCurrentUserStoryCollaborator(storyId) {
    const numericStoryId = Number(storyId);
    if (!Number.isSafeInteger(numericStoryId) || numericStoryId <= 0) {
        throw new Error("História inválida para verificar a coautoria.");
    }

    const { data, error } = await supabase.rpc("is_story_collaborator", {
        target_story_id: numericStoryId,
    });

    if (error) throw error;
    return data === true;
}

export async function addStoryCollaborator(storyId, username) {
    const numericStoryId = Number(storyId);
    const cleanUsername = String(username ?? "").trim().replace(/^@+/, "");

    if (!Number.isSafeInteger(numericStoryId) || numericStoryId <= 0) {
        throw new Error("História inválida para adicionar um coautor.");
    }
    if (!cleanUsername) {
        throw new Error("Informe o nome de usuário do escritor.");
    }
    if (cleanUsername.length > 80) {
        throw new Error("O nome de usuário informado é muito longo.");
    }

    const { data, error } = await supabase.rpc("add_story_collaborator", {
        target_story_id: numericStoryId,
        target_writer_username: cleanUsername,
    });

    if (error) throw error;
    return Array.isArray(data) ? data[0] ?? null : data;
}

export async function removeStoryCollaborator(storyId, writerId) {
    const numericStoryId = Number(storyId);
    const numericWriterId = Number(writerId);

    if (!Number.isSafeInteger(numericStoryId) || numericStoryId <= 0) {
        throw new Error("História inválida para remover um coautor.");
    }
    if (!Number.isSafeInteger(numericWriterId) || numericWriterId <= 0) {
        throw new Error("Escritor inválido para remover da coautoria.");
    }

    const { error } = await supabase.rpc("remove_story_collaborator", {
        target_story_id: numericStoryId,
        target_writer_id: numericWriterId,
    });

    if (error) throw error;
}