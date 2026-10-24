import { setupTheme } from "../core/theme.js";
import {
    showMessage,
} from "../core/utils.js";
import {
    getCurrentUser,
    signIn,
    signInWithDiscord,
} from "../services/auth.service.js";
import {
    getMyWriterAccount,
} from "../services/writer.service.js";

setupTheme();

const form =
    document.querySelector("#login-form");

const message =
    document.querySelector("#login-message");
const discordButton = document.querySelector("#discord-login-button");

async function continueExistingWriterSession() {
    form.querySelectorAll(
        "input, button"
    ).forEach((element) => {
        element.disabled = true;
    });

    showMessage(
        message,
        "Verificando sua sessão..."
    );

    try {
        const user = await getCurrentUser();

        if (!user) {
            form.querySelectorAll(
                "input, button"
            ).forEach((element) => {
                element.disabled = false;
            });

            message.textContent = "";
            return;
        }

        const writer =
            await getMyWriterAccount();

        if (writer) {
            showMessage(
                message,
                "Sessão encontrada. Abrindo o portal..."
            );

            location.href = "./index.html";
            return;
        }

        form.querySelectorAll(
            "input, button"
        ).forEach((element) => {
            element.disabled = false;
        });

        const isUnlinkedDiscordLogin = new URLSearchParams(location.search).get("error") === "not-writer";
        showMessage(
            message,
            isUnlinkedDiscordLogin
                ? "Esta conta Discord ainda não está vinculada a uma conta de escritor. Entre com seu e-mail e senha atuais e use ‘Vincular Discord’ no Portal do Escritor."
                : "A sessão atual não pertence a uma conta de escritor.",
            "error",
        );
    } catch (error) {
        console.error(
            "[Writer Login] Falha ao verificar sessão:",
            error,
        );

        form.querySelectorAll(
            "input, button"
        ).forEach((element) => {
            element.disabled = false;
        });

        showMessage(
            message,
            "Não foi possível verificar a sessão. Você ainda pode entrar abaixo.",
            "error",
        );
    }
}


if (discordButton) {
    discordButton.addEventListener("click", async () => {
        discordButton.disabled = true;
        showMessage(message, "Abrindo o Discord…");
        try {
            const redirectTo = new URL("./index.html?discord-login=1", window.location.href).href;
            await signInWithDiscord(redirectTo);
        } catch (error) {
            console.error("[Writer Login] Login Discord falhou:", error);
            showMessage(message, "Não foi possível iniciar o login pelo Discord. Confira a configuração OAuth no Supabase.", "error");
            discordButton.disabled = false;
        }
    });
}

form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        showMessage(
            message,
            "Entrando..."
        );

        try {
            await signIn(
                document.querySelector(
                    "#email"
                ).value.trim(),
                document.querySelector(
                    "#password"
                ).value,
            );

            location.href = "./index.html";
        } catch (error) {
            console.error(error);

            showMessage(
                message,
                "Não foi possível entrar. Verifique suas credenciais.",
                "error",
            );
        }
    }
);


// Ao voltar para a tela de login, aproveitamos a sessão existente.
// O escritor só precisará entrar novamente depois que todas as abas do site
// forem fechadas (ou quando sair manualmente do Portal do Escritor).
const pageParams = new URLSearchParams(location.search);
if (pageParams.has("error_description")) {
    showMessage(message, "O Discord não concluiu a autorização. Tente novamente.", "error");
} else if (pageParams.get("error") === "not-writer") {
    showMessage(message, "Esta conta Discord não está vinculada a uma conta de escritor. Entre com suas credenciais atuais e vincule o Discord no Portal do Escritor.", "error");
}
await continueExistingWriterSession();
