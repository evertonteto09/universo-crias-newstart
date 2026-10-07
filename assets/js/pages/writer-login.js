import { setupTheme } from "../core/theme.js";
import {
    showMessage,
} from "../core/utils.js";
import {
    getCurrentUser,
    signIn,
} from "../services/auth.service.js";
import {
    getMyWriterAccount,
} from "../services/writer.service.js";

setupTheme();

const form =
    document.querySelector("#login-form");

const message =
    document.querySelector("#login-message");

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

        showMessage(
            message,
            "A sessão atual não pertence a uma conta de escritor.",
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
await continueExistingWriterSession();
