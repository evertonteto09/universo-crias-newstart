import { supabase } from "./supabase-client.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    message.textContent = "Entrando...";

    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        message.textContent = "E-mail ou senha inválidos.";
        message.className = "form-message error";
        return;
    }

    location.href = "./index.html";
});
