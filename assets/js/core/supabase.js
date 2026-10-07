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

/*
 * A sessão do escritor deve ser compartilhada entre as abas abertas,
 * mas não deve sobreviver ao fechamento de todas elas.
 *
 * O Supabase normalmente usa localStorage, que persiste indefinidamente.
 * Aqui continuamos usando localStorage para que as abas consigam enxergar
 * a mesma sessão, mas fazemos uma verificação de "aba viva" antes de
 * devolver a sessão para uma nova aba.
 *
 * Cada aba recebe um identificador guardado em sessionStorage.
 * - Navegação/reload na mesma aba: o identificador continua existindo.
 * - Nova aba: recebe outro identificador.
 * - Depois que todas as abas são fechadas: não existe mais ninguém para
 *   responder ao canal de presença, então a sessão antiga é descartada.
 */
const AUTH_STORAGE_KEY = "historias-crias-auth-session";
const TAB_SESSION_KEY = "historias-crias-tab-id";
const TAB_CHANNEL_NAME = "historias-crias-open-tabs-v1";

const LEGACY_AUTH_STORAGE_KEY = SUPABASE_URL
    ? `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`
    : null;

const supportsBrowserStorage =
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    typeof window.sessionStorage !== "undefined";

function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TAB_ID = supportsBrowserStorage
    ? (window.sessionStorage.getItem(TAB_SESSION_KEY) || (() => {
        const id = createId();
        window.sessionStorage.setItem(TAB_SESSION_KEY, id);
        return id;
    })())
    : createId();

const RUNTIME_ID = createId();

const tabChannel =
    typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(TAB_CHANNEL_NAME)
        : null;

const pendingPresenceRequests = new Map();

if (tabChannel) {
    tabChannel.addEventListener("message", (event) => {
        const message = event.data;

        if (!message || message.runtimeId === RUNTIME_ID) {
            return;
        }

        if (message.type === "presence-request") {
            const hasSession =
                supportsBrowserStorage &&
                window.sessionStorage.getItem(TAB_SESSION_KEY) === TAB_ID &&
                window.sessionStorage.getItem(
                    `${TAB_SESSION_KEY}:authenticated`
                ) === "true";

            tabChannel.postMessage({
                type: "presence-response",
                requestId: message.requestId,
                runtimeId: RUNTIME_ID,
                hasSession,
            });
            return;
        }

        if (message.type === "presence-response") {
            const resolve = pendingPresenceRequests.get(message.requestId);

            if (!resolve) {
                return;
            }

            pendingPresenceRequests.delete(message.requestId);

            if (message.hasSession) {
                resolve(true);
            }
        }
    });
}

function hasSessionMarker() {
    return (
        supportsBrowserStorage &&
        window.sessionStorage.getItem(
            `${TAB_SESSION_KEY}:authenticated`
        ) === "true"
    );
}

function setSessionMarker(value) {
    if (!supportsBrowserStorage) {
        return;
    }

    const key = `${TAB_SESSION_KEY}:authenticated`;

    if (value) {
        window.sessionStorage.setItem(key, "true");
    } else {
        window.sessionStorage.removeItem(key);
    }
}

async function anotherAuthenticatedTabIsOpen() {
    if (!tabChannel) {
        return false;
    }

    const requestId = createId();

    const result = await new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
            pendingPresenceRequests.delete(requestId);
            resolve(false);
        }, 250);

        pendingPresenceRequests.set(requestId, (hasSession) => {
            window.clearTimeout(timeout);
            resolve(Boolean(hasSession));
        });

        tabChannel.postMessage({
            type: "presence-request",
            requestId,
            runtimeId: RUNTIME_ID,
        });
    });

    return result;
}

const browserSessionStorage = {
    async getItem(key) {
        if (!supportsBrowserStorage) {
            return null;
        }

        const value = window.localStorage.getItem(key);

        if (key !== AUTH_STORAGE_KEY || !value) {
            return value;
        }

        // Reloads/navegação na mesma aba mantêm o marcador da sessionStorage.
        if (hasSessionMarker()) {
            return value;
        }

        // Uma nova aba só pode herdar a sessão se outra aba autenticada
        // ainda estiver aberta.
        const authenticatedTabExists =
            await anotherAuthenticatedTabIsOpen();

        if (!authenticatedTabExists) {
            // Sessão órfã de uma sessão anterior do navegador.
            window.localStorage.removeItem(key);
            return null;
        }

        setSessionMarker(true);
        return value;
    },

    setItem(key, value) {
        if (!supportsBrowserStorage) {
            return;
        }

        window.localStorage.setItem(key, value);

        if (key === AUTH_STORAGE_KEY) {
            setSessionMarker(true);
        }
    },

    removeItem(key) {
        if (!supportsBrowserStorage) {
            return;
        }

        window.localStorage.removeItem(key);

        if (key === AUTH_STORAGE_KEY) {
            setSessionMarker(false);
        }
    },
};

// Remove a chave do modelo antigo, que poderia deixar uma sessão permanente
// da versão anterior da V3.0 no navegador.
if (
    supportsBrowserStorage &&
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
            storage: browserSessionStorage,
            storageKey: AUTH_STORAGE_KEY,
        },
    },
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
