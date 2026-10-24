import { setupTheme } from "../core/theme.js";
import { getCurrentUser, signInWithDiscord, signOut } from "../services/auth.service.js";
import { getMyWriterAccount } from "../services/writer.service.js";
import {
    applyPreferencesLocally,
    saveUserPreferencePatch,
    syncUserPreferences,
    preferenceDefaults,
} from "../services/user-preferences.service.js";

setupTheme();

const loginSection = document.querySelector("#account-login");
const profileSection = document.querySelector("#account-profile");
const loginButton = document.querySelector("#discord-login-button");
const loginMessage = document.querySelector("#account-login-message");
const displayName = document.querySelector("#account-display-name");
const emailLabel = document.querySelector("#account-email");
const roleLabel = document.querySelector("#account-role");
const roleActions = document.querySelector("#account-role-actions");
const prefsMessage = document.querySelector("#account-preferences-message");
const logoutButton = document.querySelector("#account-logout-button");

const controls = {
    theme: document.querySelector("#account-theme"),
    profanity_filter_enabled: document.querySelector("#account-profanity-filter"),
    presence_enabled: document.querySelector("#account-presence-enabled"),
    presence_show_story_title: document.querySelector("#account-show-story-title"),
    presence_show_episode_details: document.querySelector("#account-show-episode-details"),
    presence_show_writer_activity: document.querySelector("#account-show-writer-activity"),
};

function setMessage(element, message, kind = "") {
    element.textContent = message;
    element.classList.toggle("error", kind === "error");
    element.classList.toggle("success", kind === "success");
}

function visible(element, isVisible) {
    element.hidden = !isVisible;
}

function displayNameFor(user) {
    const metadata = user?.user_metadata || {};
    return metadata.global_name || metadata.full_name || metadata.name || metadata.preferred_username || metadata.user_name || (user?.email ? user.email.split("@")[0] : "Usuário do Discord");
}

function fillControls(preferences) {
    controls.theme.value = preferences.theme;
    controls.profanity_filter_enabled.checked = preferences.profanity_filter_enabled;
    controls.presence_enabled.checked = preferences.presence_enabled;
    controls.presence_show_story_title.checked = preferences.presence_show_story_title;
    controls.presence_show_episode_details.checked = preferences.presence_show_episode_details;
    controls.presence_show_writer_activity.checked = preferences.presence_show_writer_activity;
}

function preferencesFromControls() {
    return {
        theme: controls.theme.value,
        profanity_filter_enabled: controls.profanity_filter_enabled.checked,
        presence_enabled: controls.presence_enabled.checked,
        presence_show_story_title: controls.presence_show_story_title.checked,
        presence_show_episode_details: controls.presence_show_episode_details.checked,
        presence_show_writer_activity: controls.presence_show_writer_activity.checked,
    };
}

async function updatePreference(key, value) {
    const current = preferencesFromControls();
    const next = { ...current, [key]: value };
    applyPreferencesLocally(next);
    setMessage(prefsMessage, "Salvando preferências…");

    try {
        await saveUserPreferencePatch({ [key]: value });
        setMessage(prefsMessage, "Preferência salva na sua conta.", "success");
    } catch (error) {
        console.error("[Account] Falha ao salvar preferência:", error);
        setMessage(prefsMessage, "Não foi possível sincronizar agora. A preferência continua aplicada neste navegador.", "error");
    }
}

async function renderAccount() {
    let user = null;
    try {
        user = await getCurrentUser();
    } catch (error) {
        // Sem sessão ativa: a tela de login é a experiência esperada.
        console.debug("[Account] Nenhuma sessão ativa:", error?.message || error);
    }

    if (!user) {
        visible(loginSection, true);
        visible(profileSection, false);
        return;
    }

    visible(loginSection, false);
    visible(profileSection, true);
    displayName.textContent = displayNameFor(user);
    emailLabel.textContent = user.email || "Conta do Discord conectada";

    let isWriter = false;
    try {
        isWriter = Boolean(await getMyWriterAccount());
    } catch (error) {
        console.warn("[Account] Não foi possível consultar a conta de escritor:", error);
    }

    roleLabel.textContent = isWriter ? "Escritor" : "Leitor";
    visible(roleActions, isWriter);

    try {
        const synced = await syncUserPreferences();
        fillControls(synced?.preferences || preferenceDefaults());
    } catch (error) {
        console.error("[Account] Falha ao carregar preferências:", error);
        fillControls(preferenceDefaults());
        setMessage(prefsMessage, "Não foi possível carregar as preferências da conta. Confira se a migração SQL foi executada no Supabase.", "error");
    }
}

loginButton.addEventListener("click", async () => {
    loginButton.disabled = true;
    setMessage(loginMessage, "Abrindo o Discord…");
    try {
        const redirectTo = new URL("./conta.html", window.location.href).href;
        await signInWithDiscord(redirectTo);
    } catch (error) {
        console.error("[Account] Login Discord falhou:", error);
        setMessage(loginMessage, "Não foi possível iniciar o login. Confira se o Discord está habilitado no Supabase e se este endereço está autorizado para retorno.", "error");
        loginButton.disabled = false;
    }
});

for (const [key, input] of Object.entries(controls)) {
    input.addEventListener("change", () => {
        const value = input.type === "checkbox" ? input.checked : input.value;
        updatePreference(key, value);
    });
}

window.addEventListener("hdc-user-preferences-applied", (event) => {
    if (profileSection.hidden) return;
    const preferences = event.detail?.preferences;
    if (preferences) fillControls(preferences);
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
        await signOut();
        location.href = "./conta.html";
    } catch (error) {
        console.error("[Account] Falha ao sair:", error);
        setMessage(prefsMessage, "Não foi possível encerrar a sessão. Tente novamente.", "error");
        logoutButton.disabled = false;
    }
});

await renderAccount();

const params = new URLSearchParams(location.search);
if (params.has("error_description")) {
    setMessage(loginMessage, "O Discord não concluiu a autorização. Tente novamente.", "error");
}
