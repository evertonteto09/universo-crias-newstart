import { supabase } from "../core/supabase.js";

const THEME_KEY = "hdc-theme";
const PROFANITY_KEY = "hdc-profanity-filter";
const PRESENCE_KEY = "criasPresenceSettings";
const VALID_THEMES = new Set(["neblina", "preto", "branco", "vermelho", "amarelo", "roxo"]);

const DEFAULT_PREFERENCES = Object.freeze({
    theme: "neblina",
    profanity_filter_enabled: true,
    presence_enabled: true,
    presence_show_story_title: false,
    presence_show_episode_details: false,
    presence_show_writer_activity: false,
});

let syncInFlight = null;

function readLocalPresence() {
    try {
        const value = JSON.parse(localStorage.getItem(PRESENCE_KEY) || "null");
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        return value;
    } catch {
        return {};
    }
}

function readLocalPreferences() {
    const presence = readLocalPresence();
    const localTheme = localStorage.getItem(THEME_KEY);
    return {
        theme: VALID_THEMES.has(localTheme) ? localTheme : DEFAULT_PREFERENCES.theme,
        profanity_filter_enabled: localStorage.getItem(PROFANITY_KEY) !== "off",
        presence_enabled: typeof presence.enabled === "boolean" ? presence.enabled : DEFAULT_PREFERENCES.presence_enabled,
        presence_show_story_title: typeof presence.showStoryTitle === "boolean" ? presence.showStoryTitle : DEFAULT_PREFERENCES.presence_show_story_title,
        presence_show_episode_details: typeof presence.showEpisodeDetails === "boolean" ? presence.showEpisodeDetails : DEFAULT_PREFERENCES.presence_show_episode_details,
        presence_show_writer_activity: typeof presence.showWriterActivity === "boolean" ? presence.showWriterActivity : DEFAULT_PREFERENCES.presence_show_writer_activity,
    };
}

function normalizePreferences(value = {}) {
    return {
        theme: VALID_THEMES.has(value.theme) ? value.theme : DEFAULT_PREFERENCES.theme,
        profanity_filter_enabled: typeof value.profanity_filter_enabled === "boolean" ? value.profanity_filter_enabled : DEFAULT_PREFERENCES.profanity_filter_enabled,
        presence_enabled: typeof value.presence_enabled === "boolean" ? value.presence_enabled : DEFAULT_PREFERENCES.presence_enabled,
        presence_show_story_title: typeof value.presence_show_story_title === "boolean" ? value.presence_show_story_title : DEFAULT_PREFERENCES.presence_show_story_title,
        presence_show_episode_details: typeof value.presence_show_episode_details === "boolean" ? value.presence_show_episode_details : DEFAULT_PREFERENCES.presence_show_episode_details,
        presence_show_writer_activity: typeof value.presence_show_writer_activity === "boolean" ? value.presence_show_writer_activity : DEFAULT_PREFERENCES.presence_show_writer_activity,
    };
}

function applyPreferencesToBrowser(value) {
    const preferences = normalizePreferences(value);
    try {
        localStorage.setItem(THEME_KEY, preferences.theme);
        localStorage.setItem(PROFANITY_KEY, preferences.profanity_filter_enabled ? "on" : "off");
        localStorage.setItem(PRESENCE_KEY, JSON.stringify({
            enabled: preferences.presence_enabled,
            showStoryTitle: preferences.presence_show_story_title,
            showEpisodeDetails: preferences.presence_show_episode_details,
            showWriterActivity: preferences.presence_show_writer_activity,
        }));
    } catch (error) {
        console.warn("Não foi possível aplicar as preferências localmente:", error);
    }

    window.dispatchEvent(new CustomEvent("hdc-user-preferences-applied", {
        detail: { preferences },
    }));
    return preferences;
}

async function getSignedInUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
}

async function loadOrCreatePreferences(user, seedFromLocal = true) {
    const { data, error } = await supabase
        .from("user_preferences")
        .select("user_id, theme, profanity_filter_enabled, presence_enabled, presence_show_story_title, presence_show_episode_details, presence_show_writer_activity")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) throw error;
    if (data) return normalizePreferences(data);

    // On the first login, preserve the user's current browser choices.
    const initial = seedFromLocal ? readLocalPreferences() : { ...DEFAULT_PREFERENCES };
    const { data: inserted, error: insertError } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, ...initial, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select("user_id, theme, profanity_filter_enabled, presence_enabled, presence_show_story_title, presence_show_episode_details, presence_show_writer_activity")
        .single();

    if (insertError) throw insertError;
    return normalizePreferences(inserted);
}

export async function syncUserPreferences() {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
        const user = await getSignedInUser();
        if (!user) return null;
        const preferences = await loadOrCreatePreferences(user, true);
        applyPreferencesToBrowser(preferences);
        return { user, preferences };
    })();

    try {
        return await syncInFlight;
    } finally {
        syncInFlight = null;
    }
}

export async function saveUserPreferencePatch(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
    if (syncInFlight) {
        try { await syncInFlight; } catch { /* The update below can retry independently. */ }
    }

    const user = await getSignedInUser();
    if (!user) return false;

    const allowed = {};
    if (Object.hasOwn(patch, "theme") && VALID_THEMES.has(patch.theme)) allowed.theme = patch.theme;
    for (const key of [
        "profanity_filter_enabled",
        "presence_enabled",
        "presence_show_story_title",
        "presence_show_episode_details",
        "presence_show_writer_activity",
    ]) {
        if (Object.hasOwn(patch, key) && typeof patch[key] === "boolean") allowed[key] = patch[key];
    }
    if (!Object.keys(allowed).length) return false;

    // Ensure the preferences row exists without replacing cloud settings with local defaults.
    await loadOrCreatePreferences(user, true);
    const { data, error } = await supabase
        .from("user_preferences")
        .update({ ...allowed, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("user_id, theme, profanity_filter_enabled, presence_enabled, presence_show_story_title, presence_show_episode_details, presence_show_writer_activity")
        .single();

    if (error) throw error;
    // Reconcile local UI with the latest stored row (including simultaneous changes).
    applyPreferencesToBrowser(data);
    return true;
}

export function preferenceDefaults() {
    return { ...DEFAULT_PREFERENCES };
}

export function applyPreferencesLocally(value) {
    return applyPreferencesToBrowser(value);
}
