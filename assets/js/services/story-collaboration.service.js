import { supabase } from "../core/supabase.js";

/**
 * Lists every collaborator for a story. The database RLS decides whether the
 * active account is the principal author, an assigned coauthor, or a public
 * reader of a published story.
 */
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


/** Checks authorization through the server-side helper, not just the public credits list. */
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

/** Adds a writer by exact username. Authorization is enforced in the RPC. */
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

/** Removes a collaborator. Only the principal author can pass the RPC check. */
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
