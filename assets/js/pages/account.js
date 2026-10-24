import { setupTheme } from "../core/theme.js";
import { getCurrentUser, signInWithDiscord, signOut, getCurrentUserIdentities, unlinkDiscordIdentity } from "../services/auth.service.js?v=20261024-identity-management";
import { getMyWriterAccount } from "../services/writer.service.js";
import { getLastWriterLoginEmail, getRememberedAccountState, rememberWriterLoginState } from "../services/local-account-state.service.js?v=20261024-local-login-state-2";
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
const readerDiscordGuard = document.querySelector("#reader-discord-guard");
const readerDiscordOverride = document.querySelector("#reader-discord-override");
const loginMessage = document.querySelector("#account-login-message");
const displayName = document.querySelector("#account-display-name");
const emailLabel = document.querySelector("#account-email");
const roleLabel = document.querySelector("#account-role");
const roleActions = document.querySelector("#account-role-actions");
const prefsMessage = document.querySelector("#account-preferences-message");
const logoutButton = document.querySelector("#account-logout-button");
const identitiesList = document.querySelector("#account-identities-list");
const identitiesMessage = document.querySelector("#account-identities-message");
let identityMutationInProgress = false;

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
        // A lista é refeita a partir do Supabase depois da operação, seja sucesso ou erro.
        await renderIdentities({ preserveMessage: true });
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
    const identities = await renderIdentities();
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

configureReaderDiscordEntry();
await renderAccount();

const params = new URLSearchParams(location.search);
if (params.has("error_description")) {
    setMessage(loginMessage, "O Discord não concluiu a autorização. Tente novamente.", "error");
}
