import { setupTheme } from "../core/theme.js";
import { showMessage } from "../core/utils.js";
import {
    getCurrentUser,
    getCurrentUserIdentities,
    signIn,
    signInWithDiscord,
    signOut,
} from "../services/auth.service.js?v=20261024-local-login-state";
import { getMyWriterAccount } from "../services/writer.service.js";
import {
    getLastWriterLoginEmail,
    getRememberedWriterLogin,
    normalizeLoginEmail,
    rememberDiscordLoginAttempt,
    rememberWriterLoginState,
} from "../services/local-account-state.service.js?v=20261024-local-login-state-2";

setupTheme();

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const discordButton = document.querySelector("#discord-login-button");
const discordHint = document.querySelector("#discord-login-hint");

function setFormDisabled(disabled) {
    form.querySelectorAll("input, button").forEach((element) => {
        if (element === discordButton && !disabled) {
            element.disabled = false;
        } else {
            element.disabled = disabled;
        }
    });
    if (!disabled) updateDiscordButtonVisibility();
}

function updateDiscordButtonVisibility() {
    const email = normalizeLoginEmail(emailInput.value);
    const remembered = getRememberedWriterLogin(email);
    const canUseDiscord = Boolean(remembered);
    discordButton.hidden = !canUseDiscord;
    discordButton.disabled = false;

    if (!discordHint) return;
    if (canUseDiscord) {
        discordHint.textContent = "Vínculo Discord confirmado anteriormente para esta conta neste navegador.";
        discordHint.classList.remove("error");
    } else if (email && emailInput.validity.valid) {
        discordHint.textContent = "Não há um vínculo Discord confirmado para este e-mail neste navegador. Entre com e-mail e senha; se sua conta já estiver vinculada em outro dispositivo, este login atualizará o registro local.";
        discordHint.classList.remove("error");
    } else {
        discordHint.textContent = "No primeiro acesso neste dispositivo, entre com e-mail e senha para verificar o vínculo.";
        discordHint.classList.remove("error");
    }
}

async function syncCurrentWriterState(user) {
    const writer = await getMyWriterAccount();
    if (!writer) {
        rememberWriterLoginState(user, { isWriter: false, identities: [] });
        return { writer: null, identities: [] };
    }

    let identities = [];
    try {
        identities = await getCurrentUserIdentities();
    } catch (error) {
        // Em falha de verificação, falhamos para o lado seguro: não deixamos o
        // botão OAuth habilitado com um estado positivo que não pôde ser confirmado.
        console.warn("[Writer Login] Não foi possível verificar identidades Discord:", error);
    }
    rememberWriterLoginState(user, { isWriter: true, identities });
    return { writer, identities };
}

async function continueExistingWriterSession() {
    setFormDisabled(true);
    showMessage(message, "Verificando sua sessão...");

    try {
        const user = await getCurrentUser();
        if (!user) {
            setFormDisabled(false);
            message.textContent = "";
            return;
        }

        const { writer } = await syncCurrentWriterState(user);
        if (writer) {
            showMessage(message, "Sessão encontrada. Abrindo o portal...");
            location.href = "./index.html";
            return;
        }

        if (user.email) emailInput.value = user.email;
        setFormDisabled(false);
        const isUnlinkedDiscordLogin = new URLSearchParams(location.search).get("error") === "not-writer";
        showMessage(
            message,
            isUnlinkedDiscordLogin
                ? "Esta identidade Discord entrou em uma conta sem cadastro de escritor. Para proteger suas histórias, o login Discord foi desabilitado para essa conta neste navegador. Entre com suas credenciais de escritor; se a identidade estiver presa a uma conta antiga, procure o administrador para regularizá-la."
                : "A sessão atual não pertence a uma conta de escritor. Entre com as credenciais da conta de escritor.",
            "error",
        );
    } catch (error) {
        console.error("[Writer Login] Falha ao verificar sessão:", error);
        setFormDisabled(false);
        showMessage(message, "Não foi possível verificar a sessão. Você ainda pode entrar abaixo.", "error");
    }
}

// Recupera o último e-mail usado neste navegador. O botão Discord continua oculto
// até existir uma confirmação local de que esse e-mail pertence a uma conta de
// escritor e que a identidade Discord foi consultada no Supabase.
if (!emailInput.value) {
    emailInput.value = getLastWriterLoginEmail();
}
emailInput.addEventListener("input", updateDiscordButtonVisibility);
emailInput.addEventListener("change", updateDiscordButtonVisibility);
emailInput.addEventListener("blur", updateDiscordButtonVisibility);
updateDiscordButtonVisibility();

discordButton.addEventListener("click", async () => {
    const email = normalizeLoginEmail(emailInput.value);
    const remembered = getRememberedWriterLogin(email);
    if (!remembered) {
        updateDiscordButtonVisibility();
        showMessage(message, "Este navegador não confirma um vínculo Discord para esse e-mail. Entre com e-mail e senha antes de tentar novamente.", "error");
        return;
    }

    discordButton.disabled = true;
    showMessage(message, "Abrindo o Discord para a conta de escritor confirmada neste navegador…");
    try {
        rememberDiscordLoginAttempt(email, remembered);
        const redirectTo = new URL("./index.html?discord-login=1", window.location.href).href;
        await signInWithDiscord(redirectTo);
    } catch (error) {
        console.error("[Writer Login] Login Discord falhou:", error);
        showMessage(message, error?.message || "Não foi possível iniciar o login pelo Discord. Entre com e-mail e senha e tente novamente.", "error");
        discordButton.disabled = false;
        updateDiscordButtonVisibility();
    }
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormDisabled(true);
    showMessage(message, "Entrando...");

    try {
        await signIn(emailInput.value.trim(), passwordInput.value);
        const user = await getCurrentUser();
        if (!user) throw new Error("A autenticação foi concluída, mas não foi possível recuperar a sessão.");

        const { writer } = await syncCurrentWriterState(user);
        if (!writer) {
            // Não deixamos uma conta comum avançar pelo Portal do Escritor.
            await signOut().catch(() => {});
            setFormDisabled(false);
            showMessage(message, "Esta conta não está associada a um cadastro de escritor. Se você deveria ter acesso às suas histórias, entre em contato com o administrador.", "error");
            return;
        }

        location.href = "./index.html";
    } catch (error) {
        console.error("[Writer Login] Falha no login por e-mail:", error);
        setFormDisabled(false);
        showMessage(message, "Não foi possível entrar. Verifique suas credenciais e tente novamente.", "error");
    }
});

await continueExistingWriterSession();

// Exibe os parâmetros de erro depois da verificação inicial da sessão, para que
// a mensagem não seja apagada quando o navegador não tiver uma sessão ativa.
const pageParams = new URLSearchParams(location.search);
if (pageParams.has("error_description")) {
    showMessage(message, "O Discord não concluiu a autorização. Tente novamente.", "error");
} else if (pageParams.get("error") === "not-writer") {
    showMessage(message, "Esta identidade Discord está associada a uma conta sem cadastro de escritor. Entre com as credenciais corretas; se a identidade deveria pertencer a suas histórias, procure o administrador para regularizar o vínculo.", "error");
} else if (pageParams.get("error") === "discord-account-mismatch") {
    showMessage(message, "O Discord autenticou uma conta diferente daquela confirmada anteriormente neste navegador. Por segurança, encerramos a sessão. Entre com e-mail e senha para verificar o vínculo novamente.", "error");
}
