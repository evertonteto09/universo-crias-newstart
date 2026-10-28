import { setupTheme } from "../ui.js?v=20261027-custom-background-crop-1";
import { initCriasPresence } from "../services/crias-presence.service.js?v=20261028-crias-presence-images-2";

// Reutiliza o tema salvo pelo restante do site.
setupTheme();

// Mantém o menu Presença disponível também nesta página de instruções.
initCriasPresence({
    details: "Conhecendo o Crias Presence",
    state: "Instruções de instalação",
});
