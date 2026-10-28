import { supabase } from "../core/supabase.js";
import {
    DEFAULT_CUSTOM_THEME,
    saveAnonymousCustomThemeSettings,
    removeAnonymousCustomThemeBackgroundFile,
} from "./custom-theme.service.js?v=20261028-theme-label-link-colors-1";

const LOCAL_PREFERENCE_KEYS = [
    "hdc-theme",
    "hdc-profanity-filter",
    "criasPresenceSettings",
    "hdc-custom-theme-fallback",
];

async function extractFunctionError(error) {
    const fallback = "Não foi possível apagar os dados da conta. Tente novamente.";
    try {
        const response = error?.context;
        if (response && typeof response.clone === "function") {
            const payload = await response.clone().json();
            if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
            if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
        }
    } catch {
        // O erro original permanece como fallback; não expomos dados técnicos à tela.
    }
    if (error?.name === "FunctionsFetchError") {
        return "Não foi possível conectar ao serviço de exclusão. Confira sua conexão e tente novamente.";
    }
    return fallback;
}

/**
 * Exclui a conta de leitor por meio de uma Edge Function que valida a sessão e
 * rejeita contas associadas a writer_accounts no servidor.
 */
export async function deleteReaderAccount() {
    const { data, error } = await supabase.functions.invoke("delete-reader-account", {
        method: "POST",
        body: {},
    });

    if (error) {
        throw new Error(await extractFunctionError(error));
    }
    if (data?.success !== true) {
        throw new Error(typeof data?.message === "string"
            ? data.message
            : "O servidor não confirmou a exclusão da conta.");
    }

    // A conta já foi apagada no servidor. Limpe a sessão local mesmo se o Auth
    // não conseguir revogar uma sessão que deixou de existir no backend.
    try {
        await supabase.auth.signOut({ scope: "local" });
    } catch {
        try { localStorage.removeItem("historias-crias-auth-session"); } catch { /* ignore */ }
    }
    try { localStorage.removeItem("historias-crias-auth-session"); } catch { /* ignore */ }

    for (const key of LOCAL_PREFERENCE_KEYS) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }

    // Preferências locais e a imagem de fundo temporária também são limpas neste
    // navegador, para que o tema de uma conta removida não permaneça aplicado.
    try {
        await saveAnonymousCustomThemeSettings({ ...DEFAULT_CUSTOM_THEME }, { clearBackground: true });
    } catch (cleanupError) {
        console.warn("[Account deletion] Não foi possível redefinir todas as preferências locais.", cleanupError);
        await removeAnonymousCustomThemeBackgroundFile();
    }

    return data;
}
