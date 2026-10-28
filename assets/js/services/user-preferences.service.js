import { supabase } from "../core/supabase.js";
import {
    DEFAULT_CUSTOM_THEME,
    THEME_BACKGROUND_BUCKET,
    THEME_BACKGROUND_MAX_BYTES,
    THEME_BACKGROUND_MIME_TYPES,
    applyCustomThemeSettings,
    getAnonymousCustomThemeBackgroundFile,
    normalizeBackgroundImageUrl,
    normalizeCustomThemeSettings,
    readAnonymousCustomThemeSettings,
    removeAnonymousCustomThemeBackgroundFile,
    resolveCustomThemeBackground,
    saveAnonymousCustomThemeSettings,
    validateThemeBackgroundFile,
} from "./custom-theme.service.js?v=20261028-theme-label-link-colors-1";

const THEME_KEY = "hdc-theme";
const PROFANITY_KEY = "hdc-profanity-filter";
const PRESENCE_KEY = "criasPresenceSettings";
const VALID_THEMES = new Set(["neblina", "preto", "branco", "vermelho", "amarelo", "roxo", "ciano", "personalizado"]);
const PREFERENCE_COLUMNS = "user_id, theme, profanity_filter_enabled, presence_enabled, presence_show_story_title, presence_show_episode_details, presence_show_writer_activity, presence_show_images, presence_show_story_section, presence_show_current_page_button, custom_theme_color_1, custom_theme_color_2, custom_theme_direction, custom_theme_title_color, custom_theme_text_color, custom_theme_interactive_text_color, custom_theme_label_color, custom_theme_card_bg_color, custom_theme_menu_bg_color, custom_theme_button_bg_color, custom_theme_input_bg_color, custom_theme_hover_color, custom_theme_background_type, custom_theme_background_source, custom_theme_background_url, custom_theme_background_path, custom_theme_background_dim, custom_theme_background_blur, custom_theme_background_position, custom_theme_background_zoom, custom_theme_background_rotation, custom_theme_background_flip_x, custom_theme_background_flip_y, custom_theme_background_offset_x, custom_theme_background_offset_y";
const DEFAULT_PREFERENCES = Object.freeze({
    theme: "neblina",
    profanity_filter_enabled: true,
    presence_enabled: true,
    presence_show_story_title: false,
    presence_show_episode_details: false,
    presence_show_writer_activity: false,
    presence_show_images: false,
    presence_show_story_section: true,
    presence_show_current_page_button: false,
    ...DEFAULT_CUSTOM_THEME,
});

const MIME_EXTENSIONS = Object.freeze({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
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

async function readLocalPreferences() {
    const presence = readLocalPresence();
    const localTheme = localStorage.getItem(THEME_KEY);
    const customTheme = await readAnonymousCustomThemeSettings();
    return {
        theme: VALID_THEMES.has(localTheme) ? localTheme : DEFAULT_PREFERENCES.theme,
        profanity_filter_enabled: localStorage.getItem(PROFANITY_KEY) !== "off",
        presence_enabled: typeof presence.enabled === "boolean" ? presence.enabled : DEFAULT_PREFERENCES.presence_enabled,
        presence_show_story_title: typeof presence.showStoryTitle === "boolean" ? presence.showStoryTitle : DEFAULT_PREFERENCES.presence_show_story_title,
        presence_show_episode_details: typeof presence.showEpisodeDetails === "boolean" ? presence.showEpisodeDetails : DEFAULT_PREFERENCES.presence_show_episode_details,
        presence_show_writer_activity: typeof presence.showWriterActivity === "boolean" ? presence.showWriterActivity : DEFAULT_PREFERENCES.presence_show_writer_activity,
        presence_show_images: typeof presence.showImages === "boolean" ? presence.showImages : DEFAULT_PREFERENCES.presence_show_images,
        presence_show_story_section: typeof presence.showStorySection === "boolean" ? presence.showStorySection : DEFAULT_PREFERENCES.presence_show_story_section,
        presence_show_current_page_button: typeof presence.showCurrentPageButton === "boolean" ? presence.showCurrentPageButton : DEFAULT_PREFERENCES.presence_show_current_page_button,
        ...customTheme,
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
        presence_show_images: typeof value.presence_show_images === "boolean" ? value.presence_show_images : DEFAULT_PREFERENCES.presence_show_images,
        presence_show_story_section: typeof value.presence_show_story_section === "boolean" ? value.presence_show_story_section : DEFAULT_PREFERENCES.presence_show_story_section,
        presence_show_current_page_button: typeof value.presence_show_current_page_button === "boolean" ? value.presence_show_current_page_button : DEFAULT_PREFERENCES.presence_show_current_page_button,
        ...normalizeCustomThemeSettings(value),
    };
}

function applyPreferencesToBrowser(value) {
    const preferences = normalizePreferences(value);
    applyCustomThemeSettings(preferences);
    try {
        localStorage.setItem(THEME_KEY, preferences.theme);
        localStorage.setItem(PROFANITY_KEY, preferences.profanity_filter_enabled ? "on" : "off");
        localStorage.setItem(PRESENCE_KEY, JSON.stringify({
            enabled: preferences.presence_enabled,
            showStoryTitle: preferences.presence_show_story_title,
            showEpisodeDetails: preferences.presence_show_episode_details,
            showWriterActivity: preferences.presence_show_writer_activity,
            showImages: preferences.presence_show_images,
            showStorySection: preferences.presence_show_story_section,
            showCurrentPageButton: preferences.presence_show_current_page_button,
        }));
    } catch (error) {
        console.warn("Não foi possível aplicar as preferências localmente:", error);
    }

    if (preferences.theme === "personalizado") {
        void resolveCustomThemeBackground(preferences);
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

function isOwnedThemeBackgroundPath(path, userId) {
    if (typeof path !== "string" || !path || !userId) return false;
    if (!path.startsWith(`${userId}/`) || path.startsWith("/") || path.includes("\\")) return false;
    return !path.split("/").some((part) => part === ".." || part === ".");
}

async function uploadThemeBackground(user, file) {
    validateThemeBackgroundFile(file);
    if (!MIME_EXTENSIONS[file.type]) {
        throw new Error("Formato de imagem não suportado para upload.");
    }
    const fileId = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    const path = `${user.id}/${fileId}.${MIME_EXTENSIONS[file.type]}`;
    const { error } = await supabase.storage.from(THEME_BACKGROUND_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
    });
    if (error) {
        const message = String(error.message || "");
        if (/bucket not found/i.test(message)) {
            throw new Error("O bucket privado user-theme-backgrounds ainda não existe. Execute a migração SQL das imagens de fundo.");
        }
        throw error;
    }
    return path;
}

async function deleteThemeBackgroundIfOwned(user, path) {
    if (!isOwnedThemeBackgroundPath(path, user?.id)) return;
    const { error } = await supabase.storage.from(THEME_BACKGROUND_BUCKET).remove([path]);
    if (error) console.warn("A preferência foi salva, mas a imagem anterior não pôde ser removida do Storage.", error);
}

async function loadOrCreatePreferences(user, seedFromLocal = true) {
    const { data, error } = await supabase
        .from("user_preferences")
        .select(PREFERENCE_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) throw error;
    if (data) return normalizePreferences(data);

    // No primeiro login, preserva as configurações do navegador. Se houver uma
    // imagem local, tenta migrá-la para o bucket privado da conta autenticada.
    const initial = seedFromLocal ? await readLocalPreferences() : { ...DEFAULT_PREFERENCES };
    let uploadedSeedPath = "";
    if (initial.custom_theme_background_source === "upload" && !initial.custom_theme_background_path) {
        const localFile = await getAnonymousCustomThemeBackgroundFile();
        if (localFile) {
            try {
                uploadedSeedPath = await uploadThemeBackground(user, localFile);
                initial.custom_theme_background_path = uploadedSeedPath;
            } catch (uploadError) {
                console.warn("Não foi possível migrar a imagem local para a conta. O restante das preferências será preservado.", uploadError);
                initial.custom_theme_background_path = "";
                if (initial.custom_theme_background_type === "image") initial.custom_theme_background_type = "gradient";
            }
        } else if (initial.custom_theme_background_type === "image") {
            // Não cria uma preferência de imagem sem arquivo ou caminho persistente.
            initial.custom_theme_background_type = "gradient";
        }
    }

    const initialPayload = {
        user_id: user.id,
        ...initial,
        custom_theme_background_url: initial.custom_theme_background_url || null,
        custom_theme_background_path: initial.custom_theme_background_path || null,
        updated_at: new Date().toISOString(),
    };
    const { data: inserted, error: insertError } = await supabase
        .from("user_preferences")
        .upsert(initialPayload, { onConflict: "user_id" })
        .select(PREFERENCE_COLUMNS)
        .single();

    if (insertError) {
        if (uploadedSeedPath) await deleteThemeBackgroundIfOwned(user, uploadedSeedPath);
        throw insertError;
    }
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
    if (!user) {
        const hasCustomThemePatch = [
            "custom_theme_color_1", "custom_theme_color_2", "custom_theme_direction",
            "custom_theme_title_color", "custom_theme_text_color", "custom_theme_interactive_text_color", "custom_theme_label_color",
            "custom_theme_card_bg_color", "custom_theme_menu_bg_color", "custom_theme_button_bg_color",
            "custom_theme_input_bg_color", "custom_theme_hover_color",
        ].some((key) => Object.hasOwn(patch, key));
        if (hasCustomThemePatch) {
            const current = await readAnonymousCustomThemeSettings();
            const merged = normalizeCustomThemeSettings({ ...current, ...patch });
            await saveAnonymousCustomThemeSettings(merged);
            applyCustomThemeSettings(merged);
        }
        return false;
    }

    const allowed = {};
    if (Object.hasOwn(patch, "theme") && VALID_THEMES.has(patch.theme)) allowed.theme = patch.theme;
    for (const key of [
        "custom_theme_color_1", "custom_theme_color_2",
        "custom_theme_title_color", "custom_theme_text_color", "custom_theme_interactive_text_color", "custom_theme_label_color",
        "custom_theme_card_bg_color", "custom_theme_menu_bg_color", "custom_theme_button_bg_color", "custom_theme_input_bg_color", "custom_theme_hover_color",
    ]) {
        if (Object.hasOwn(patch, key)) {
            const normalized = normalizeCustomThemeSettings({ [key]: patch[key] });
            const candidate = normalized[key];
            if (typeof patch[key] === "string" && /^#?[\da-fA-F]{6}$/.test(patch[key].trim())) allowed[key] = candidate;
        }
    }
    if (Object.hasOwn(patch, "custom_theme_direction") && ["horizontal", "vertical"].includes(patch.custom_theme_direction)) {
        allowed.custom_theme_direction = patch.custom_theme_direction;
    }
    for (const key of [
        "profanity_filter_enabled",
        "presence_enabled",
        "presence_show_story_title",
        "presence_show_episode_details",
        "presence_show_writer_activity",
        "presence_show_images",
        "presence_show_story_section",
        "presence_show_current_page_button",
    ]) {
        if (Object.hasOwn(patch, key) && typeof patch[key] === "boolean") allowed[key] = patch[key];
    }
    if (!Object.keys(allowed).length) return false;

    await loadOrCreatePreferences(user, true);
    const { data, error } = await supabase
        .from("user_preferences")
        .update({ ...allowed, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select(PREFERENCE_COLUMNS)
        .single();

    if (error) throw error;
    applyPreferencesToBrowser(data);
    return true;
}

export async function saveCustomThemePreferences(value = {}, { backgroundFile = null, clearBackground = false } = {}) {
    let customTheme = normalizeCustomThemeSettings(value);
    const user = await getSignedInUser();

    if (clearBackground) {
        customTheme = normalizeCustomThemeSettings({
            ...customTheme,
            custom_theme_background_type: "gradient",
            custom_theme_background_source: "url",
            custom_theme_background_url: "",
            custom_theme_background_path: "",
        });
    }

    if (!user) {
        if (customTheme.custom_theme_background_type === "image") {
            if (customTheme.custom_theme_background_source === "url") {
                if (!normalizeBackgroundImageUrl(value.custom_theme_background_url)) {
                    throw new Error("Informe um endereço HTTPS válido para a imagem de fundo.");
                }
            } else if (!backgroundFile && !(await getAnonymousCustomThemeBackgroundFile())) {
                throw new Error("Selecione uma imagem do dispositivo antes de salvar, ou escolha um link de imagem.");
            }
        }

        const stored = await saveAnonymousCustomThemeSettings(customTheme, { backgroundFile, clearBackground });
        const localPreferences = await readLocalPreferences();
        const preferences = normalizePreferences({
            ...localPreferences,
            theme: "personalizado",
            ...stored.settings,
        });
        applyPreferencesToBrowser(preferences);
        await resolveCustomThemeBackground(preferences);
        return { savedTo: stored.storage, preferences };
    }

    // Cria/recupera a linha e mantém o ID antigo para removê-lo somente após salvar.
    const previous = await loadOrCreatePreferences(user, true);
    const previousPath = isOwnedThemeBackgroundPath(previous.custom_theme_background_path, user.id)
        ? previous.custom_theme_background_path
        : "";
    let uploadedPath = "";

    try {
        if (customTheme.custom_theme_background_type === "image") {
            if (customTheme.custom_theme_background_source === "url") {
                const imageUrl = normalizeBackgroundImageUrl(value.custom_theme_background_url);
                if (!imageUrl) throw new Error("Informe um endereço HTTPS válido para a imagem de fundo.");
                customTheme.custom_theme_background_url = imageUrl;
                customTheme.custom_theme_background_path = "";
            } else if (backgroundFile) {
                validateThemeBackgroundFile(backgroundFile);
                uploadedPath = await uploadThemeBackground(user, backgroundFile);
                customTheme.custom_theme_background_url = "";
                customTheme.custom_theme_background_path = uploadedPath;
            } else {
                let requestedPath = customTheme.custom_theme_background_path || previousPath;
                if (!isOwnedThemeBackgroundPath(requestedPath, user.id)) {
                    // Se o visitante escolheu uma imagem antes de entrar, migra o Blob
                    // local para o bucket privado quando passa a usar uma conta existente.
                    const localFile = await getAnonymousCustomThemeBackgroundFile();
                    if (localFile) {
                        uploadedPath = await uploadThemeBackground(user, localFile);
                        requestedPath = uploadedPath;
                    }
                }
                if (!isOwnedThemeBackgroundPath(requestedPath, user.id)) {
                    throw new Error("Selecione uma imagem do dispositivo antes de salvar, ou escolha um link de imagem.");
                }
                customTheme.custom_theme_background_url = "";
                customTheme.custom_theme_background_path = requestedPath;
            }
        } else {
            // Deixa a imagem anterior guardada para que o usuário possa voltar a ela depois.
            if (customTheme.custom_theme_background_source === "upload") {
                customTheme.custom_theme_background_url = "";
                customTheme.custom_theme_background_path = customTheme.custom_theme_background_path || previousPath;
                if (customTheme.custom_theme_background_path && !isOwnedThemeBackgroundPath(customTheme.custom_theme_background_path, user.id)) {
                    customTheme.custom_theme_background_path = "";
                }
            } else {
                customTheme.custom_theme_background_path = "";
                customTheme.custom_theme_background_url = normalizeBackgroundImageUrl(value.custom_theme_background_url);
            }
        }

        const update = {
            theme: "personalizado",
            ...customTheme,
            custom_theme_background_url: customTheme.custom_theme_background_url || null,
            custom_theme_background_path: customTheme.custom_theme_background_path || null,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
            .from("user_preferences")
            .update(update)
            .eq("user_id", user.id)
            .select(PREFERENCE_COLUMNS)
            .single();

        if (error) throw error;
        const preferences = normalizePreferences(data);
        applyPreferencesToBrowser(preferences);
        await resolveCustomThemeBackground(preferences);

        const newPath = preferences.custom_theme_background_path;
        if (previousPath && previousPath !== newPath) {
            await deleteThemeBackgroundIfOwned(user, previousPath);
        }
        if (clearBackground) await removeAnonymousCustomThemeBackgroundFile();
        return { savedTo: "account", preferences };
    } catch (error) {
        if (uploadedPath) await deleteThemeBackgroundIfOwned(user, uploadedPath);
        throw error;
    }
}

export function preferenceDefaults() {
    return { ...DEFAULT_PREFERENCES };
}

export function applyPreferencesLocally(value) {
    return applyPreferencesToBrowser(value);
}
