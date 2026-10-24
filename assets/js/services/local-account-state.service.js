/**
 * Estado local de conveniência para o login de escritor.
 * Não é uma fonte de autorização: permissões continuam sendo verificadas pelo Supabase.
 * Armazena somente e-mail, flags de vínculo e o auth user id esperado, nunca tokens ou senhas.
 */
const STORAGE_KEY = "hdc-writer-login-state-v1";
const PENDING_DISCORD_LOGIN_KEY = "hdc-writer-discord-login-pending";
const SCHEMA_VERSION = 1;
const MAX_REMEMBERED_ACCOUNTS = 12;
const MAX_PENDING_AGE_MS = 15 * 60 * 1000;

export function normalizeLoginEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}

function emptyState() {
    return { version: SCHEMA_VERSION, lastLoginEmail: "", accounts: {} };
}

function readState() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== SCHEMA_VERSION || typeof parsed.accounts !== "object" || parsed.accounts === null || Array.isArray(parsed.accounts)) {
            return emptyState();
        }

        const accounts = {};
        for (const [key, value] of Object.entries(parsed.accounts)) {
            const email = normalizeLoginEmail(key);
            if (!email || !value || typeof value !== "object") continue;
            accounts[email] = {
                writerAccount: value.writerAccount === true,
                discordLinked: value.discordLinked === true,
                authUserId: typeof value.authUserId === "string" ? value.authUserId : "",
                verifiedAt: Number.isFinite(Number(value.verifiedAt)) ? Number(value.verifiedAt) : 0,
            };
        }

        return {
            version: SCHEMA_VERSION,
            lastLoginEmail: normalizeLoginEmail(parsed.lastLoginEmail),
            accounts,
        };
    } catch (error) {
        console.warn("[Local account state] Não foi possível ler o estado local:", error);
        return emptyState();
    }
}

function writeState(state) {
    try {
        const records = Object.entries(state.accounts)
            .sort(([, a], [, b]) => Number(b.verifiedAt || 0) - Number(a.verifiedAt || 0))
            .slice(0, MAX_REMEMBERED_ACCOUNTS);
        state.accounts = Object.fromEntries(records);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (error) {
        // Storage cheio/desativado não deve impedir a autenticação por e-mail e senha.
        console.warn("[Local account state] Não foi possível salvar o estado local:", error);
        return false;
    }
}

export function getLastWriterLoginEmail() {
    return readState().lastLoginEmail;
}

export function getRememberedAccountState(emailValue) {
    const email = normalizeLoginEmail(emailValue);
    if (!email) return null;
    const record = readState().accounts[email];
    return record ? { ...record, email } : null;
}

export function getRememberedWriterLogin(emailValue) {
    const record = getRememberedAccountState(emailValue);
    if (!record || record.writerAccount !== true || record.discordLinked !== true || !record.authUserId) {
        return null;
    }
    return record;
}

/**
 * Salva somente um estado obtido após consultar o usuário, sua associação de escritor
 * e suas identidades no Supabase. Contas sem cadastro de escritor nunca ficam marcadas
 * como elegíveis para o botão de login Discord do portal.
 */
export function rememberWriterLoginState(user, { isWriter, identities = [] } = {}) {
    const email = normalizeLoginEmail(user?.email);
    if (!email || !user?.id) return false;

    const state = readState();
    const writerAccount = isWriter === true;
    const discordLinked = writerAccount && Array.isArray(identities)
        && identities.some((identity) => identity?.provider === "discord");

    const authUserId = String(user.id);
    // Se o e-mail da mesma conta mudou, removemos a chave antiga para que um
    // endereço desatualizado não continue exibindo o botão Discord.
    for (const [knownEmail, record] of Object.entries(state.accounts)) {
        if (knownEmail !== email && record?.authUserId === authUserId) {
            delete state.accounts[knownEmail];
        }
    }

    // O e-mail pré-preenchido representa o último login confirmado de escritor;
    // uma sessão comum/leitor não deve substituir essa referência.
    if (writerAccount) state.lastLoginEmail = email;
    state.accounts[email] = {
        writerAccount,
        discordLinked,
        authUserId,
        verifiedAt: Date.now(),
    };
    return writeState(state);
}

export function rememberDiscordLoginAttempt(emailValue, record) {
    const email = normalizeLoginEmail(emailValue);
    if (!email || !record?.writerAccount || !record?.discordLinked || !record?.authUserId) {
        throw new Error("Este navegador ainda não confirmou que o Discord está vinculado a essa conta de escritor. Entre primeiro com e-mail e senha.");
    }

    const payload = {
        email,
        authUserId: record.authUserId,
        startedAt: Date.now(),
    };
    try {
        window.localStorage.setItem(PENDING_DISCORD_LOGIN_KEY, JSON.stringify(payload));
    } catch (error) {
        throw new Error("Não foi possível salvar a verificação temporária neste navegador. Entre com e-mail e senha e tente novamente.");
    }
    return payload;
}

export function readPendingDiscordLogin() {
    try {
        const raw = window.localStorage.getItem(PENDING_DISCORD_LOGIN_KEY);
        if (!raw) return null;
        const pending = JSON.parse(raw);
        if (!pending?.email || !pending?.authUserId || !Number.isFinite(Number(pending.startedAt))) return null;
        if (Date.now() - Number(pending.startedAt) > MAX_PENDING_AGE_MS || Date.now() < Number(pending.startedAt)) return null;
        return {
            email: normalizeLoginEmail(pending.email),
            authUserId: String(pending.authUserId),
            startedAt: Number(pending.startedAt),
        };
    } catch {
        return null;
    }
}

export function clearPendingDiscordLogin() {
    try {
        window.localStorage.removeItem(PENDING_DISCORD_LOGIN_KEY);
    } catch {
        // Nada a fazer; falhas de storage não devem quebrar o site.
    }
}

/** Marca o vínculo local como não confirmado depois de uma divergência no retorno OAuth. */
export function invalidateRememberedDiscordLink(emailValue, expectedAuthUserId = "") {
    const email = normalizeLoginEmail(emailValue);
    if (!email) return false;
    const state = readState();
    const current = state.accounts[email];
    if (!current) return false;
    if (expectedAuthUserId && current.authUserId && current.authUserId !== expectedAuthUserId) return false;
    current.discordLinked = false;
    current.verifiedAt = Date.now();
    state.accounts[email] = current;
    return writeState(state);
}

export function clearPendingDiscordLoginIfExpired() {
    const pending = readPendingDiscordLogin();
    if (pending) return pending;
    try {
        window.localStorage.removeItem(PENDING_DISCORD_LOGIN_KEY);
    } catch {
        // Ignorado.
    }
    return null;
}
