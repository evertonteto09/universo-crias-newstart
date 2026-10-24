import { supabase } from "../core/supabase.js";
import { getCurrentUserIdentities } from "../services/auth.service.js";

const messageElement = document.querySelector("#discord-callback-message");
const returnLink = document.querySelector("#discord-callback-return");

const PENDING_KEY = "hdc-discord-link-pending";
const OAUTH_RESULT_KEY = "hdc-discord-link-oauth-result";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeReadJson(storage, key) {
    try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function normalizedFailure(snapshot) {
    const code = String(snapshot?.errorCode || snapshot?.error || "").toLowerCase();
    const description = String(snapshot?.errorDescription || "").toLowerCase();
    const combined = `${code} ${description}`;

    if (combined.includes("identity_already_exists") || combined.includes("identity already exists")) {
        return "identity_already_exists";
    }
    if (combined.includes("manual_linking_disabled") || combined.includes("manual linking is disabled")) {
        return "manual_linking_disabled";
    }
    if (combined.includes("access_denied") || combined.includes("user denied") || combined.includes("cancelled")) {
        return "authorization_denied";
    }
    if (
        combined.includes("pkce") ||
        combined.includes("code verifier") ||
        combined.includes("flow_state") ||
        combined.includes("flow state") ||
        combined.includes("invalid_grant") ||
        combined.includes("expired")
    ) {
        return "pkce_failed";
    }
    if (snapshot?.error || snapshot?.errorCode || snapshot?.errorDescription) {
        return "oauth_error";
    }
    return null;
}

function goToDashboard(result, reason = "") {
    localStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(OAUTH_RESULT_KEY);

    const destination = new URL("./index.html", window.location.href);
    destination.searchParams.set("discord-link-result", result);
    if (reason) destination.searchParams.set("reason", reason);
    window.location.replace(destination.href);
}

async function finishLinking() {
    messageElement.textContent = "Validando o retorno do Discord…";

    const oauthResult = safeReadJson(sessionStorage, OAUTH_RESULT_KEY);
    const oauthFailure = normalizedFailure(oauthResult);
    if (oauthFailure) {
        goToDashboard("error", oauthFailure);
        return;
    }

    const pending = safeReadJson(localStorage, PENDING_KEY);
    const maxAgeMs = 15 * 60 * 1000;
    if (!pending?.userId || !pending?.startedAt || Date.now() - pending.startedAt > maxAgeMs) {
        goToDashboard("error", "pending_missing");
        return;
    }

    // getSession waits for Supabase Auth's PKCE callback initialization.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        console.warn("[Discord callback] Supabase não concluiu a sessão OAuth:", sessionError);
        goToDashboard("error", "pkce_failed");
        return;
    }

    const user = sessionData?.session?.user;
    if (!user) {
        goToDashboard("error", "session_missing");
        return;
    }

    // Nunca confirmar o vínculo em uma conta diferente daquela que iniciou o fluxo.
    if (user.id !== pending.userId) {
        goToDashboard("error", "session_changed");
        return;
    }

    // Em redes móveis pode haver um pequeno atraso entre o retorno OAuth e a consulta
    // da lista de identidades. Reconsultamos por alguns segundos antes de declarar falha.
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const identities = await getCurrentUserIdentities();
            if (identities.some((identity) => identity.provider === "discord")) {
                goToDashboard("success");
                return;
            }
        } catch (error) {
            lastError = error;
            console.warn("[Discord callback] A identidade ainda não pôde ser consultada:", error);
        }

        if (attempt < 4) await delay(700);
    }

    if (lastError) {
        console.warn("[Discord callback] Não foi possível confirmar a identidade após novas tentativas.");
    }
    goToDashboard("error", "not_confirmed");
}

finishLinking().catch((error) => {
    console.error("[Discord callback] Falha ao concluir o vínculo:", error);
    messageElement.textContent = "Não foi possível confirmar o vínculo agora. Você pode voltar ao portal e tentar novamente.";
    returnLink.hidden = false;
    localStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(OAUTH_RESULT_KEY);
});
