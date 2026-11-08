import { supabase } from "../core/supabase.js";
import { slugify } from "../core/utils.js";

const UNIVERSE_COVER_BUCKET = "story-universe-covers";
const UNIVERSE_COVER_MAX_BYTES = 5 * 1024 * 1024;
const UNIVERSE_COVER_ALLOWED_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/avif", "avif"],
]);
const universeCoverUrlCache = new Map();
const UNIVERSE_COVER_PATH_RE = /^[a-f0-9-]{36}\/\d+\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif|avif)$/i;

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

export async function getMyStoryUniverses(writerId = null) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) return [];

    const normalizedWriterId = Number(writerId);
    const hasWriterId = Number.isSafeInteger(normalizedWriterId) && normalizedWriterId > 0;
    const [ownedResult, collaboratorResult] = await Promise.all([
        supabase
            .from("story_universes")
            .select("id")
            .eq("created_by", authData.user.id),
        hasWriterId
            ? supabase
                .from("story_universe_collaborators")
                .select("universe_id")
                .eq("writer_id", normalizedWriterId)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (ownedResult.error) throw ownedResult.error;
    if (collaboratorResult.error) throw collaboratorResult.error;

    const universeIds = [...new Set([
        ...(ownedResult.data ?? []).map((row) => Number(row.id)),
        ...(collaboratorResult.data ?? []).map((row) => Number(row.universe_id)),
    ])].filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!universeIds.length) return [];

    // This query now contains only universes owned by or shared with this writer.
    const { data, error } = await supabase
        .from("story_universes")
        .select(`
            id,
            created_by,
            name,
            slug,
            description,
            cover_url,
            cover_path,
            created_at,
            updated_at,
            story_universe_collaborators (
                writer_id,
                writers!story_universe_collaborators_writer_id_fkey (
                    name,
                    username
                )
            ),
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
        .in("id", universeIds)
        .order("updated_at", { ascending: false });

    if (error) throw error;

    return Promise.all((data ?? []).map(async (universe) => {
        const isOwner = String(universe.created_by) === String(authData.user.id);
        const collaborators = (universe.story_universe_collaborators ?? [])
            .map((row) => ({
                writer_id: Number(row.writer_id),
                name: row.writers?.name || row.writers?.username || "Escritor",
                username: row.writers?.username || "",
            }));
        return {
            ...universe,
            management_role: isOwner ? "owner" : "collaborator",
            collaborators,
            cover_display_url: await getStoryUniverseCoverDisplayUrl(universe.cover_path)
                || (isHttpsCoverUrl(universe.cover_url) ? universe.cover_url : null),
            story_universe_stories: [...(universe.story_universe_stories ?? [])]
                .sort((a, b) => Number(a.reading_order) - Number(b.reading_order)),
        };
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

function isHttpsCoverUrl(value) {
    return typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value.trim());
}

export function isStoryUniverseCoverPath(value) {
    return typeof value === "string" && UNIVERSE_COVER_PATH_RE.test(value.trim());
}

/** Retorna uma URL assinada do bucket privado ou preserva links HTTPS antigos. */
export async function getStoryUniverseCoverDisplayUrl(value) {
    const cover = String(value ?? "").trim();
    if (!cover) return null;
    if (isHttpsCoverUrl(cover)) return cover;
    if (!isStoryUniverseCoverPath(cover)) return null;

    const cached = universeCoverUrlCache.get(cover);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const { data, error } = await supabase.storage
        .from(UNIVERSE_COVER_BUCKET)
        .createSignedUrl(cover, 60 * 60);
    if (error) {
        console.warn("[Universos] Não foi possível gerar a URL da capa:", error);
        return null;
    }

    const url = data?.signedUrl || null;
    if (url) {
        universeCoverUrlCache.set(cover, {
            url,
            expiresAt: Date.now() + 55 * 60 * 1000,
        });
    }
    return url;
}

function validateUniverseCoverFile(file) {
    if (!(file instanceof File)) throw new Error("Selecione um arquivo de imagem.");
    const mime = String(file.type || "").toLowerCase();
    if (!UNIVERSE_COVER_ALLOWED_TYPES.has(mime)) {
        throw new Error("Use uma imagem JPG, PNG, WEBP, GIF ou AVIF. SVG não é aceito.");
    }
    if (file.size <= 0 || file.size > UNIVERSE_COVER_MAX_BYTES) {
        throw new Error("A capa do universo precisa ter até 5 MB.");
    }
    return UNIVERSE_COVER_ALLOWED_TYPES.get(mime);
}

/** Envia a capa para o bucket privado sob o diretório do proprietário original do universo. */
export async function uploadStoryUniverseCover(universeId, file) {
    const id = positiveId(universeId, "Universo");
    const extension = validateUniverseCoverFile(file);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) throw new Error("Entre na sua conta de escritor para enviar uma capa.");

    // Coauthors store replacement covers under the universe owner's folder.
    // This preserves the path contract used by the private bucket and Presence Edge Function.
    const { data: universe, error: universeError } = await supabase
        .from("story_universes")
        .select("id, created_by")
        .eq("id", id)
        .maybeSingle();
    if (universeError) throw universeError;
    if (!universe?.created_by) throw new Error("Universo não encontrado ou sem permissão para gerenciar a capa.");

    const ownerId = String(universe.created_by).toLowerCase();
    const path = `${ownerId}/${id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
        .from(UNIVERSE_COVER_BUCKET)
        .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
        });
    if (error) throw error;
    universeCoverUrlCache.delete(path);
    return path;
}

/** Atualiza o caminho no banco; o RPC confirma se o usuário é proprietário ou coautor autorizado. */
export async function setStoryUniverseCoverPath(universeId, coverPath = null) {
    const id = positiveId(universeId, "Universo");
    const path = coverPath == null ? null : String(coverPath).trim();
    if (path && !isStoryUniverseCoverPath(path)) {
        throw new Error("Caminho da capa do universo inválido.");
    }
    const { error } = await supabase.rpc("set_story_universe_cover_path", {
        p_universe_id: id,
        p_cover_path: path,
    });
    if (error) throw error;
}

/** Remove apenas objetos com o formato de caminho esperado; o Storage valida a propriedade. */
export async function removeStoryUniverseCover(coverPath) {
    const path = String(coverPath ?? "").trim();
    if (!isStoryUniverseCoverPath(path)) return;
    const { error } = await supabase.storage
        .from(UNIVERSE_COVER_BUCKET)
        .remove([path]);
    if (error) throw error;
    universeCoverUrlCache.delete(path);
}

/** Lista e mantém a permissão de gerenciar coautores exclusiva ao proprietário. */
export async function addStoryUniverseCollaborator(universeId, writerUsername) {
    const id = positiveId(universeId, "Universo");
    const username = String(writerUsername ?? "").trim().replace(/^@+/, "");
    if (!username || username.length > 80) throw new Error("Informe um @username válido.");
    const { data, error } = await supabase.rpc("add_story_universe_collaborator", {
        p_universe_id: id,
        p_writer_username: username,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] ?? null : data;
}

export async function removeStoryUniverseCollaborator(universeId, writerId) {
    const id = positiveId(universeId, "Universo");
    const targetWriterId = positiveId(writerId, "Coautor");
    const { error } = await supabase.rpc("remove_story_universe_collaborator", {
        p_universe_id: id,
        p_writer_id: targetWriterId,
    });
    if (error) throw error;
    return true;
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


/** Universos visíveis ao público, contendo somente vínculos aprovados e obras publicadas. */
export async function getPublicStoryUniverses() {
    const { data, error } = await supabase
        .from("story_universes")
        .select(`
            id, name, slug, description, cover_url, cover_path, created_at, updated_at,
            story_universe_stories (
                universe_id, story_id, relationship_type, reading_order, status,
                stories!story_universe_stories_story_id_fkey (
                    id, title, slug, description, genres, writer_id, status, cover_type, cover_url, cover_path,
                    writers!stories_writer_id_fkey (id, name, username),
                    story_collaborators (writer_id, writers!story_collaborators_writer_id_fkey (id, name, username))
                )
            )
        `)
        .order("name", { ascending: true });
    if (error) throw error;

    const visible = [];
    for (const universe of data ?? []) {
        const entries = (universe.story_universe_stories ?? [])
            .filter((entry) => entry.status === "approved" && entry.stories?.status === "published")
            .sort((a, b) => Number(a.reading_order) - Number(b.reading_order) || Number(a.story_id) - Number(b.story_id));
        if (!entries.length) continue;
        visible.push({
            ...universe,
            stories: entries,
            main_story: entries.find((entry) => entry.relationship_type === "main")?.stories ?? entries[0].stories,
            cover_display_url: await getStoryUniverseCoverDisplayUrl(universe.cover_path)
                || (isHttpsCoverUrl(universe.cover_url) ? universe.cover_url : null),
        });
    }
    return visible;
}

/** Busca um universo público pelo slug e remove qualquer obra não publicada. */
export async function getPublicStoryUniverseBySlug(slug) {
    const normalizedSlug = String(slug ?? "").trim().toLowerCase();
    if (!normalizedSlug) return null;
    const { data, error } = await supabase
        .from("story_universes")
        .select(`
            id, name, slug, description, cover_url, cover_path, created_at, updated_at,
            story_universe_stories (
                universe_id, story_id, relationship_type, reading_order, status,
                stories!story_universe_stories_story_id_fkey (
                    id, title, slug, description, genres, writer_id, status, cover_type, cover_url, cover_path,
                    writers!stories_writer_id_fkey (id, name, username),
                    story_collaborators (writer_id, writers!story_collaborators_writer_id_fkey (id, name, username))
                )
            )
        `)
        .eq("slug", normalizedSlug)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const entries = (data.story_universe_stories ?? [])
        .filter((entry) => entry.status === "approved" && entry.stories?.status === "published")
        .sort((a, b) => Number(a.reading_order) - Number(b.reading_order) || Number(a.story_id) - Number(b.story_id));
    if (!entries.length) return null;
    return {
        ...data,
        stories: entries,
        main_story: entries.find((entry) => entry.relationship_type === "main")?.stories ?? entries[0].stories,
        cover_display_url: await getStoryUniverseCoverDisplayUrl(data.cover_path)
            || (isHttpsCoverUrl(data.cover_url) ? data.cover_url : null),
    };
}
