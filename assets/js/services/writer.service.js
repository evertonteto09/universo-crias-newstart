import { supabase } from "../core/supabase.js";
import { getCurrentUser } from "./auth.service.js";
import { slugify } from "../core/utils.js";

export async function getMyWriterAccount() {
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    const { data, error } = await supabase
        .from("writer_accounts")
        .select("writer_id, auth_user_id")
        .eq("auth_user_id", user.id)
        .single();

    if (error) {
        throw error;
    }

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

    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            writer_id,
            title,
            slug,
            description,
            cover_type,
            cover_url,
            cover_path,
            created_at,
            updated_at
        `)
        .eq("writer_id", writer.writer_id)
        .order("title");

    if (error) {
        throw error;
    }

    return data ?? [];
}

export async function createStory({
    title,
    description = null,
    coverType = "none",
    coverUrl = null,
    coverPath = null,
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
            cover_type: coverType,
            cover_url:
                coverType === "url"
                    ? coverUrl
                    : null,
            cover_path:
                coverType === "upload"
                    ? coverPath
                    : null,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}
