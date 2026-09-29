import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

const isConfigured =
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL !== "COLOQUE_AQUI" &&
    SUPABASE_ANON_KEY !== "COLOQUE_AQUI";

if (!isConfigured) {
    console.warn(
        "[Supabase] Configure assets/js/config.js antes de usar o site."
    );
}

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
);

export async function checkSupabaseConnection() {
    const { error } = await supabase
        .from("stories")
        .select("id")
        .limit(1);

    return {
        ok: !error,
        error,
    };
}
