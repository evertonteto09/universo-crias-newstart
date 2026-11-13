import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

const isConfigured =
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL !== "COLOQUE_AQUI" &&
    SUPABASE_ANON_KEY !== "COLOQUE_AQUI";

if (!isConfigured) {
    console.warn("[Supabase] Configure assets/js/config.js antes de usar o site.");
}

const AUTH_STORAGE_KEY = "historias-crias-auth-session";

const LEGACY_AUTH_STORAGE_KEY = SUPABASE_URL
    ? `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`
    : null;

if (
    typeof window !== "undefined" &&
    window.localStorage &&
    LEGACY_AUTH_STORAGE_KEY &&
    LEGACY_AUTH_STORAGE_KEY !== AUTH_STORAGE_KEY
) {
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
}

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: "pkce",
            storageKey: AUTH_STORAGE_KEY,
        },
    },
);