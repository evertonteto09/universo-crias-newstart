import { setupTheme } from "../ui.js?v=20261027-custom-background-crop-1";
import { initCriasPresence } from "../services/crias-presence.service.js?v=20261107-universe-presence-1";

setupTheme();

initCriasPresence({
    details: "Conhecendo o Crias Presence",
    state: "Instruções de instalação",
});