import { setupTheme } from "../ui.js";
import { initCriasPresence } from "../services/crias-presence.service.js";

// Reutiliza o tema salvo pelo restante do site.
setupTheme();

// Mantém o menu Presença disponível também nesta página de instruções.
initCriasPresence({
    details: "Conhecendo o Crias Presence",
    state: "Instruções de instalação",
});
