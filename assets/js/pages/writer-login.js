import { setupTheme } from "../core/theme.js";
import {
    showMessage,
} from "../core/utils.js";
import { signIn } from "../services/auth.service.js";

setupTheme();

const form =
    document.querySelector("#login-form");

const message =
    document.querySelector("#login-message");

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
