import { setupTheme } from "../core/theme.js?v=20261028-crias-presence-final-1";
import { getCurrentUser, signInWithDiscord, signOut, getCurrentUserIdentities, unlinkDiscordIdentity } from "../services/auth.service.js?v=20261024-identity-management";
import { getMyWriterAccount } from "../services/writer.service.js";
import { getLastWriterLoginEmail, getRememberedAccountState, rememberWriterLoginState } from "../services/local-account-state.service.js?v=20261024-local-login-state-2";
import {
    applyPreferencesLocally,
    saveUserPreferencePatch,
    syncUserPreferences,
    preferenceDefaults,
} from "../services/user-preferences.service.js?v=20261028-crias-presence-final-1";
import { getCachedCustomThemeSettings, normalizeCustomThemeSettings } from "../services/custom-theme.service.js?v=20261028-theme-label-link-colors-1";
import { initCriasPresence } from "../services/crias-presence.service.js?v=20261028-crias-presence-final-1";
import { deleteReaderAccount } from "../services/account-deletion.service.js?v=20261028-reader-data-deletion-1";

setupTheme();

// Minha Conta não é uma página de leitura: atualiza a atividade para remover
// o botão contextual de história/episódio que possa ter ficado da navegação anterior.
initCriasPresence({
    details: "No Universo dos Crias",
    state: "Minha conta",
    pageContext: "other",
});
document.getElementById("crias-presence-control")?.setAttribute("hidden", "");

const loginSection = document.querySelector("#account-login");
const profileSection = document.querySelector("#account-profile");
const loginButton = document.querySelector("#discord-login-button");
const readerDiscordGuard = document.querySelector("#reader-discord-guard");
const readerDiscordOverride = document.querySelector("#reader-discord-override");
const loginMessage = document.querySelector("#account-login-message");
const displayName = document.querySelector("#account-display-name");
const discordAvatar = document.querySelector("#account-discord-avatar");
const emailLabel = document.querySelector("#account-email");
const roleLabel = document.querySelector("#account-role");
const roleActions = document.querySelector("#account-role-actions");
const prefsMessage = document.querySelector("#account-preferences-message");
const logoutButton = document.querySelector("#account-logout-button");
const deleteAccountSection = document.querySelector("#account-delete-section");
const deleteAccountButton = document.querySelector("#account-delete-button");
const deleteAccountMessage = document.querySelector("#account-delete-message");
const identitiesList = document.querySelector("#account-identities-list");
const identitiesMessage = document.querySelector("#account-identities-message");
let identityMutationInProgress = false;
let currentAccountIsVerifiedReader = false;
let accountRoleWasVerified = false;
let currentCustomThemeSettings = getCachedCustomThemeSettings();

const controls = {
    theme: document.querySelector("#account-theme"),
    profanity_filter_enabled: document.querySelector("#account-profanity-filter"),
    presence_enabled: document.querySelector("#account-presence-enabled"),
    presence_show_story_title: document.querySelector("#account-show-story-title"),
    presence_show_episode_details: document.querySelector("#account-show-episode-details"),
    presence_show_writer_activity: document.querySelector("#account-show-writer-activity"),
    presence_show_images: document.querySelector("#account-show-images"),
    presence_show_story_section: document.querySelector("#account-show-story-section"),
    presence_show_current_page_button: document.querySelector("#account-show-current-page-button"),
};

function setMessage(element, message, kind = "") {
    element.textContent = message;
    element.classList.toggle("error", kind === "error");
    element.classList.toggle("success", kind === "success");
}

function visible(element, isVisible) {
    element.hidden = !isVisible;
}

function configureReaderDiscordEntry() {
    // Se a última conta conhecida neste navegador é uma conta de escritor ainda
    // sem vínculo, o login Discord de leitor fica atrás de uma confirmação explícita.
    const lastEmail = getLastWriterLoginEmail();
    const remembered = getRememberedAccountState(lastEmail);
    const knownUnlinkedWriter = Boolean(
        lastEmail && remembered?.writerAccount === true && remembered?.discordLinked !== true
    );

    if (knownUnlinkedWriter) {
        loginButton.hidden = true;
        readerDiscordGuard.hidden = false;
    } else {
        loginButton.hidden = false;
        readerDiscordGuard.hidden = true;
    }
}

readerDiscordOverride?.addEventListener("click", () => {
    const confirmed = window.confirm(
        "Este caminho é somente para entrar ou criar um perfil de leitor. Se você é escritor e quer associar o Discord às histórias existentes, cancele e entre no Portal do Escritor com e-mail e senha. Deseja continuar como leitor?"
    );
    if (!confirmed) return;
    readerDiscordGuard.hidden = true;
    loginButton.hidden = false;
    setMessage(loginMessage, "Modo de leitor selecionado. O Discord não será vinculado automaticamente a uma conta de escritor.");
});

function displayNameFor(user) {
    const metadata = user?.user_metadata || {};
    return metadata.global_name || metadata.full_name || metadata.name || metadata.preferred_username || metadata.user_name || (user?.email ? user.email.split("@")[0] : "Usuário do Discord");
}

function fillControls(preferences) {
    currentCustomThemeSettings = normalizeCustomThemeSettings(preferences);
    controls.theme.value = preferences.theme;
    controls.profanity_filter_enabled.checked = preferences.profanity_filter_enabled;
    controls.presence_enabled.checked = preferences.presence_enabled;
    controls.presence_show_story_title.checked = preferences.presence_show_story_title;
    controls.presence_show_episode_details.checked = preferences.presence_show_episode_details;
    controls.presence_show_writer_activity.checked = preferences.presence_show_writer_activity;
    controls.presence_show_images.checked = preferences.presence_show_images;
    controls.presence_show_story_section.checked = preferences.presence_show_story_section;
    controls.presence_show_current_page_button.checked = preferences.presence_show_current_page_button;
}

function preferencesFromControls() {
    return {
        ...currentCustomThemeSettings,
        theme: controls.theme.value,
        profanity_filter_enabled: controls.profanity_filter_enabled.checked,
        presence_enabled: controls.presence_enabled.checked,
        presence_show_story_title: controls.presence_show_story_title.checked,
        presence_show_episode_details: controls.presence_show_episode_details.checked,
        presence_show_writer_activity: controls.presence_show_writer_activity.checked,
        presence_show_images: controls.presence_show_images.checked,
        presence_show_story_section: controls.presence_show_story_section.checked,
        presence_show_current_page_button: controls.presence_show_current_page_button.checked,
    };
}

const identityProviderLabels = {
    discord: "Discord",
    email: "E-mail e senha",
    google: "Google",
    github: "GitHub",
    gitlab: "GitLab",
    bitbucket: "Bitbucket",
    azure: "Microsoft",
    apple: "Apple",
    facebook: "Facebook",
    twitter: "X / Twitter",
    phone: "Telefone",
};

function identityDisplayName(identity) {
    const data = identity?.identity_data || {};
    if (identity?.provider === "discord") {
        return data.global_name || data.full_name || data.name || data.username || data.preferred_username || data.user_name || "Conta Discord";
    }
    return data.full_name || data.name || data.preferred_username || data.user_name || identityProviderLabels[identity?.provider] || "Método de acesso";
}

function identitySecondaryLabel(identity) {
    const email = identity?.email || identity?.identity_data?.email;
    if (email) return email;
    if (identity?.provider === "discord") return "Identidade Discord vinculada à conta";
    return `Método de acesso: ${identityProviderLabels[identity?.provider] || identity?.provider || "desconhecido"}`;
}

function safeDiscordAvatarUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value, window.location.href);
        const hostname = url.hostname.toLowerCase();
        const trustedHost = hostname === "discordapp.com"
            || hostname.endsWith(".discordapp.com")
            || hostname === "discordapp.net"
            || hostname.endsWith(".discordapp.net");
        if (url.protocol !== "https:" || !trustedHost) return "";
        return url.href;
    } catch {
        return "";
    }
}

function discordDefaultAvatarUrl(discordUserId) {
    const id = String(discordUserId || "").trim();
    if (!/^\d{5,25}$/.test(id)) return "";
    try {
        // Discord snowflake: índice do avatar padrão = (id >> 22) % 6.
        const index = Number((BigInt(id) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch {
        return "";
    }
}

function resolveDiscordAvatar(identity) {
    if (!identity || identity.provider !== "discord") return { url: "", fallbackUrl: "" };

    const data = identity.identity_data || {};
    const discordUserId = String(
        identity.provider_id || data.provider_id || data.sub || data.id || ""
    ).trim();

    const candidateUrls = [data.avatar_url, data.picture, data.avatarURL, data.image_url];
    let url = candidateUrls.map(safeDiscordAvatarUrl).find(Boolean) || "";

    if (!url && discordUserId && typeof data.avatar === "string" && /^[a-zA-Z0-9_]+$/.test(data.avatar)) {
        const extension = data.avatar.startsWith("a_") ? "gif" : "webp";
        url = `https://cdn.discordapp.com/avatars/${encodeURIComponent(discordUserId)}/${encodeURIComponent(data.avatar)}.${extension}?size=128`;
    }

    const fallbackUrl = discordDefaultAvatarUrl(discordUserId);
    return { url: url || fallbackUrl, fallbackUrl };
}

function renderDiscordAvatar(user, identities) {
    if (!discordAvatar) return;
    const discordIdentity = Array.isArray(identities)
        ? identities.find((identity) => identity?.provider === "discord")
        : null;

    if (!user || !discordIdentity) {
        discordAvatar.hidden = true;
        discordAvatar.removeAttribute("src");
        discordAvatar.removeAttribute("data-fallback-url");
        discordAvatar.removeAttribute("data-fallback-attempted");
        discordAvatar.alt = "";
        return;
    }

    const { url, fallbackUrl } = resolveDiscordAvatar(discordIdentity);
    if (!url) {
        discordAvatar.hidden = true;
        discordAvatar.removeAttribute("src");
        return;
    }

    const discordName = identityDisplayName(discordIdentity);
    discordAvatar.alt = `Avatar do Discord de ${discordName}`;
    discordAvatar.title = `Avatar do Discord de ${discordName}`;
    discordAvatar.dataset.fallbackUrl = fallbackUrl;
    discordAvatar.dataset.fallbackAttempted = "false";
    discordAvatar.onerror = () => {
        const fallback = discordAvatar.dataset.fallbackUrl || "";
        const current = discordAvatar.src;
        if (fallback && discordAvatar.dataset.fallbackAttempted !== "true" && current !== new URL(fallback, window.location.href).href) {
            discordAvatar.dataset.fallbackAttempted = "true";
            discordAvatar.src = fallback;
            return;
        }
        discordAvatar.hidden = true;
    };
    discordAvatar.hidden = false;
    discordAvatar.src = url;
}

function identityErrorMessage(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const combined = `${code} ${message}`;

    if (combined.includes("single_identity_not_deletable")) {
        return "Esta conta precisa manter pelo menos uma identidade de acesso. Vincule outro método antes de remover o Discord.";
    }
    if (combined.includes("identity_not_found")) {
        return "Essa identidade não está mais vinculada a esta conta. Atualize a página para ver a lista atualizada.";
    }
    if (combined.includes("email_conflict_identity_not_deletable")) {
        return "Não foi possível desvincular o Discord porque isso causaria um conflito com o e-mail de outra conta. Procure o administrador para regularizar a associação.";
    }
    if (combined.includes("manual_linking_disabled") || combined.includes("manual linking")) {
        return "O gerenciamento de identidades está desativado na configuração de autenticação do Supabase. Procure o administrador do projeto.";
    }
    if (combined.includes("identity_already_exists")) {
        return "Essa identidade já pertence a outra conta do Universo dos Crias. Ela precisa ser regularizada pelo procedimento administrativo; não pode ser removida por esta sessão.";
    }
    if (combined.includes("session") || combined.includes("unauthorized") || combined.includes("not authenticated")) {
        return "Sua sessão pode ter expirado. Entre novamente e tente de novo.";
    }
    return "Não foi possível desvincular essa identidade. Nenhuma outra identidade foi removida; tente novamente ou procure o administrador.";
}

function buildIdentityCard(identity, identities) {
    const item = document.createElement("article");
    item.className = "account-identity-item";

    const details = document.createElement("div");
    details.className = "account-identity-details";

    const title = document.createElement("strong");
    const providerLabel = identityProviderLabels[identity.provider] || identity.provider || "Método de acesso";
    title.textContent = identity.provider === "discord"
        ? `${providerLabel} · ${identityDisplayName(identity)}`
        : providerLabel;

    const secondary = document.createElement("small");
    secondary.textContent = identitySecondaryLabel(identity);
    details.append(title, secondary);

    const actions = document.createElement("div");
    actions.className = "account-identity-actions";

    if (identity.provider === "discord") {
        const unlinkButton = document.createElement("button");
        unlinkButton.type = "button";
        unlinkButton.className = "secondary-button account-identity-unlink";
        unlinkButton.textContent = "Desvincular Discord";
        unlinkButton.dataset.identityId = identity.id;
        unlinkButton.disabled = identityMutationInProgress || identities.length <= 1;
        unlinkButton.title = identities.length <= 1
            ? "A conta precisa manter pelo menos uma identidade de acesso."
            : "Remove somente esta identidade Discord desta conta.";
        unlinkButton.setAttribute("aria-label", `Desvincular ${identityDisplayName(identity)} do Discord`);
        unlinkButton.addEventListener("click", () => handleUnlinkIdentity(identity, unlinkButton));
        actions.append(unlinkButton);
    } else {
        const badge = document.createElement("span");
        badge.className = "account-role";
        badge.textContent = "Método mantido";
        actions.append(badge);
    }

    item.append(details, actions);
    return item;
}

async function renderIdentities({ preserveMessage = false } = {}) {
    identitiesList.replaceChildren();
    identitiesList.append(Object.assign(document.createElement("p"), {
        className: "muted",
        textContent: "Carregando identidades vinculadas…",
    }));

    try {
        const identities = await getCurrentUserIdentities();
        identitiesList.replaceChildren();

        if (!identities.length) {
            const empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = "O Supabase não retornou identidades para esta sessão. Entre novamente para atualizar os dados da conta.";
            identitiesList.append(empty);
            return identities;
        }

        // Lista identidades da conta atual. Uma identidade pertencente a outro user_id
        // não é consultável nem removível por esta interface.
        for (const identity of identities) {
            identitiesList.append(buildIdentityCard(identity, identities));
        }

        if (!preserveMessage) {
            const discordCount = identities.filter((identity) => identity.provider === "discord").length;
            if (discordCount > 1) {
                setMessage(identitiesMessage, `Esta conta tem ${discordCount} identidades Discord. Você pode remover uma por vez, mantendo pelo menos um método de acesso.`);
            } else if (discordCount === 1 && identities.length === 1) {
                setMessage(identitiesMessage, "Esta é a única identidade desta conta. Para removê-la, primeiro será necessário configurar outro método de acesso.");
            } else {
                setMessage(identitiesMessage, "Estas são as identidades associadas à sua sessão atual.");
            }
        }
        return identities;
    } catch (error) {
        console.error("[Account] Não foi possível carregar as identidades:", error);
        identitiesList.replaceChildren();
        const failed = document.createElement("p");
        failed.className = "muted";
        failed.textContent = "Não foi possível carregar as identidades agora. Atualize a página e tente novamente.";
        identitiesList.append(failed);
        setMessage(identitiesMessage, "Falha ao consultar identidades no Supabase.", "error");
        return null;
    }
}

async function handleUnlinkIdentity(identity, button) {
    if (identityMutationInProgress) return;

    const name = identityDisplayName(identity);
    const confirmed = window.confirm(
        `Deseja desvincular o Discord “${name}” desta conta?\n\n` +
        "Essa identidade deixará de poder ser usada para entrar nesta conta. " +
        "A operação não remove a conta Discord em si nem as histórias do Universo dos Crias."
    );
    if (!confirmed) return;

    identityMutationInProgress = true;
    document.querySelectorAll(".account-identity-unlink").forEach((control) => {
        control.disabled = true;
    });
    setMessage(identitiesMessage, `Desvinculando ${name}…`);

    try {
        await unlinkDiscordIdentity(identity.id);
        setMessage(identitiesMessage, `A identidade Discord “${name}” foi desvinculada desta conta.`, "success");
    } catch (error) {
        console.error("[Account] Falha ao desvincular identidade:", error);
        setMessage(identitiesMessage, identityErrorMessage(error), "error");
    } finally {
        identityMutationInProgress = false;
        // Atualiza a dica local do login Discord somente quando a sessão pertence a um escritor.
        // O cache local nunca concede permissões; o Supabase continua sendo a fonte de verdade.
        try {
            const user = await getCurrentUser();
            const writer = user ? await getMyWriterAccount() : null;
            if (user && writer) {
                const identities = await getCurrentUserIdentities();
                rememberWriterLoginState(user, { isWriter: true, identities });
            }
        } catch (stateError) {
            console.warn("[Account] Não foi possível atualizar o estado local do login:", stateError);
        }
        // A lista e o avatar são refeitos a partir do Supabase depois da operação,
        // seja sucesso ou erro, para não manter um avatar de identidade já removida.
        const refreshedIdentities = await renderIdentities({ preserveMessage: true });
        try {
            const refreshedUser = await getCurrentUser();
            const refreshedDiscordIdentity = Array.isArray(refreshedIdentities)
                ? refreshedIdentities.find((item) => item?.provider === "discord")
                : null;
            renderDiscordAvatar(refreshedUser, refreshedIdentities);
            displayName.textContent = refreshedDiscordIdentity
                ? identityDisplayName(refreshedDiscordIdentity)
                : displayNameFor(refreshedUser);
        } catch (refreshError) {
            console.warn("[Account] Não foi possível atualizar avatar Discord:", refreshError);
            renderDiscordAvatar(null, []);
        }
    }
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
        // Mostra os campos úteis do erro PostgREST (por exemplo, violação de CHECK)
        // sem imprimir tokens de sessão ou outros dados de autenticação.
        console.error("[Account] Falha ao salvar preferência:", {
            code: error?.code,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            status: error?.status,
        });
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
    accountRoleWasVerified = false;
    currentAccountIsVerifiedReader = false;
    try {
        isWriter = Boolean(await getMyWriterAccount());
        accountRoleWasVerified = true;
    } catch (error) {
        // Falha na verificação nunca libera a opção destrutiva por padrão.
        console.warn("[Account] Não foi possível consultar a conta de escritor:", error);
    }

    if (accountRoleWasVerified) {
        roleLabel.textContent = isWriter ? "Escritor" : "Leitor";
        visible(roleActions, isWriter);
        currentAccountIsVerifiedReader = !isWriter;
        visible(deleteAccountSection, currentAccountIsVerifiedReader);
        if (currentAccountIsVerifiedReader) setMessage(deleteAccountMessage, "Você pode solicitar a exclusão da sua conta de leitor e das preferências associadas.");
    } else {
        roleLabel.textContent = "Papel não verificado";
        visible(roleActions, false);
        visible(deleteAccountSection, false);
        setMessage(deleteAccountMessage, "Não foi possível confirmar o tipo da conta. A exclusão fica indisponível até a verificação funcionar.", "error");
    }
    const identities = await renderIdentities();
    const discordIdentity = Array.isArray(identities)
        ? identities.find((identity) => identity?.provider === "discord")
        : null;
    renderDiscordAvatar(user, identities);
    // Se o Discord estiver vinculado, exibimos o nome correspondente ao avatar.
    // Caso contrário, preservamos o nome já disponível na conta do Supabase.
    displayName.textContent = discordIdentity ? identityDisplayName(discordIdentity) : displayNameFor(user);
    if (isWriter && identities) {
        rememberWriterLoginState(user, { isWriter: true, identities });
    }

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


deleteAccountButton?.addEventListener("click", async () => {
    if (!accountRoleWasVerified || !currentAccountIsVerifiedReader || deleteAccountButton.disabled) return;

    const confirmed = window.confirm(
        "Apagar permanentemente sua conta de leitor e suas preferências salvas? Esta ação não pode ser desfeita. Contas de escritor não são apagadas por esta opção."
    );
    if (!confirmed) return;

    const typedConfirmation = window.prompt('Para confirmar a exclusão permanente, digite APAGAR:');
    if (typedConfirmation?.trim() !== "APAGAR") {
        setMessage(deleteAccountMessage, "Confirmação não concluída. Nenhum dado foi apagado.");
        return;
    }

    deleteAccountButton.disabled = true;
    logoutButton.disabled = true;
    setMessage(deleteAccountMessage, "Apagando a conta e as preferências…");

    try {
        await deleteReaderAccount();
        window.location.replace("./conta.html?account_deleted=1");
    } catch (error) {
        console.error("[Account] Falha ao apagar a conta de leitor:", error?.message || error);
        setMessage(deleteAccountMessage, error?.message || "Não foi possível apagar os dados. Tente novamente.", "error");
        deleteAccountButton.disabled = false;
        logoutButton.disabled = false;
    }
});

configureReaderDiscordEntry();
await renderAccount();

const params = new URLSearchParams(location.search);
if (params.has("error_description")) {
    setMessage(loginMessage, "O Discord não concluiu a autorização. Tente novamente.", "error");
}
if (params.get("account_deleted") === "1") {
    setMessage(loginMessage, "Sua conta de leitor e as preferências associadas foram apagadas.", "success");
}
