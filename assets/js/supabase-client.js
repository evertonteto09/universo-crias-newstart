import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (
    !SUPABASE_URL ||
    SUPABASE_URL === "COLOQUE_AQUI" ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY === "COLOQUE_AQUI"
) {
    console.warn("Supabase ainda não foi configurado em assets/js/config.js");
}

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
);
