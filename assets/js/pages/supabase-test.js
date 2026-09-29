import { checkSupabaseConnection } from "../core/supabase.js";
import { setupTheme } from "../core/theme.js";

setupTheme();

const status =
    document.querySelector("#status");

const details =
    document.querySelector("#details");

try {
    const result =
        await checkSupabaseConnection();

    if (result.ok) {
        status.textContent =
            "✅ Supabase respondeu corretamente.";
        details.textContent =
            "A consulta simples à tabela stories funcionou.";
    } else {
        status.textContent =
            "❌ A conexão não foi concluída.";
        details.textContent =
            result.error?.message ||
            "Erro desconhecido.";
    }
} catch (error) {
    status.textContent =
        "❌ Erro ao testar o Supabase.";
    details.textContent =
        error?.message ||
        String(error);
}
