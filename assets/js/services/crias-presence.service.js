import { saveUserPreferencePatch, syncUserPreferences } from "./user-preferences.service.js?v=20261028-crias-presence-final-1";
import { CRIAS_PRESENCE_LOGO_URL } from "./crias-presence-images.service.js?v=20261028-crias-presence-final-1";

const WS_URL = "ws://127.0.0.1:32145/presence";
const GITHUB_PAGES_ORIGIN = "https://evertonteto09.github.io";
const SESSION_KEY = "criasPresenceSession";
const SETTINGS_KEY = "criasPresenceSettings";

const PUBLIC_SITE_BASE_URL = "https://evertonteto09.github.io/universo-crias-newstart/";
const PUBLIC_SITE_ORIGIN = "https://evertonteto09.github.io";
const READER_PAGE_CONTEXTS = new Set(["home", "story", "episode"]);
const STORY_SECTION_DETAILS = Object.freeze({
    chapters: "Vendo episódios",
    news: "Lendo notícias",
    reviews: "Lendo avaliações",
});

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    showStoryTitle: false,
    showEpisodeDetails: false,
    showWriterActivity: false,
    showImages: false,
    showStorySection: true,
    showCurrentPageButton: false,
});

const MAX_TEXT_LENGTH = 128;
const MAX_IMAGE_URL_LENGTH = 300;
const WIDGET_ID = "crias-presence-control";
const STYLE_ID = "crias-presence-styles";

function loadSavedSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
            return { ...DEFAULT_SETTINGS };
        }
        return {
            enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_SETTINGS.enabled,
            showStoryTitle: typeof saved.showStoryTitle === "boolean" ? saved.showStoryTitle : DEFAULT_SETTINGS.showStoryTitle,
            showEpisodeDetails: typeof saved.showEpisodeDetails === "boolean" ? saved.showEpisodeDetails : DEFAULT_SETTINGS.showEpisodeDetails,
            showWriterActivity: typeof saved.showWriterActivity === "boolean" ? saved.showWriterActivity : DEFAULT_SETTINGS.showWriterActivity,
            showImages: typeof saved.showImages === "boolean" ? saved.showImages : DEFAULT_SETTINGS.showImages,
            showStorySection: typeof saved.showStorySection === "boolean" ? saved.showStorySection : DEFAULT_SETTINGS.showStorySection,
            showCurrentPageButton: typeof saved.showCurrentPageButton === "boolean" ? saved.showCurrentPageButton : DEFAULT_SETTINGS.showCurrentPageButton,
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Inicializa o Crias Presence no cabeçalho do site.
 *
 * O serviço gerencia:
 * - Conexão com o programa local.
 * - Autorização com código temporário.
 * - Reutilização da sessão na mesma aba.
 * - Atualização e remoção da Rich Presence.
 * - Interface integrada aos temas do site.
 */
export function initCriasPresence(initialActivity = {}) {
    // Evita criar vários menus se o serviço for inicializado
    // mais de uma vez na mesma página.
    const existing = document.getElementById(WIDGET_ID);

    if (existing?.criasPresenceApi) {
        existing.criasPresenceApi.update(initialActivity);
        return existing.criasPresenceApi;
    }

    // O GitHub Pages usa o mesmo Origin independente do caminho do projeto.
    // A conexão continua sendo feita apenas para o serviço loopback instalado.
    const isGitHubPagesOrigin = window.location.origin === GITHUB_PAGES_ORIGIN;

    let activity = normalizeActivity(initialActivity);
    let settings = loadSavedSettings();

    let socket = null;
    let authorized = false;
    let discordReady = false;
    let appSupportsImages = false;
    let appSupportsButtons = false;
    let pageUnloading = false;
    let pendingAction = null;
    let publishTimer = null;
    let rateLimitRetryTimer = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;

    const AUTO_PUBLISH_DELAY_MS = 400;
    const RATE_LIMIT_RETRY_MS = 500;
    const RECONNECT_BASE_DELAY_MS = 1000;
    const RECONNECT_MAX_DELAY_MS = 10000;

    // ==================================================
    // ESTILOS
    // ==================================================

    function installStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;

        style.textContent = `
            #${WIDGET_ID} {
                position: relative;
                display: inline-flex;
                align-items: center;
                font: inherit;
            }

            #${WIDGET_ID} *,
            #${WIDGET_ID} *::before,
            #${WIDGET_ID} *::after {
                box-sizing: border-box;
            }

            #${WIDGET_ID} .cp-trigger {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                white-space: nowrap;
            }

            #${WIDGET_ID} .cp-indicator {
                width: 8px;
                height: 8px;
                flex: 0 0 8px;
                border-radius: 50%;
                background: #888;
            }

            #${WIDGET_ID} .cp-indicator[data-state="connected"] {
                background: #e0b54e;
            }

            #${WIDGET_ID} .cp-indicator[data-state="ready"] {
                background: #45c878;
            }

            #${WIDGET_ID} .cp-indicator[data-state="error"] {
                background: #ed5b5b;
            }

            #${WIDGET_ID} .cp-popover {
                position: absolute;
                z-index: 1000;
                top: calc(100% + 10px);
                right: 0;
                width: min(350px, calc(100vw - 24px));
                max-height: min(75vh, 580px);
                overflow-y: auto;
                padding: 18px;
                color: var(--text);
                background:
                    radial-gradient(
                        circle at top right,
                        rgba(var(--accent-rgb), .10),
                        transparent 45%
                    ),
                    var(--surface);
                border: 1px solid var(--border);
                border-radius: 18px;
                box-shadow: var(--shadow);
                font-family: inherit;
            }

            #${WIDGET_ID} .cp-popover[hidden],
            #${WIDGET_ID} [hidden] {
                display: none !important;
            }

            #${WIDGET_ID} .cp-heading {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 8px;
            }

            #${WIDGET_ID} .cp-heading h2 {
                margin: 0;
                color: var(--text);
                font-size: 1.08rem;
                line-height: 1.4;
            }

            #${WIDGET_ID} .cp-description {
                margin: 8px 0 14px;
                color: var(--muted);
                font-size: .84rem;
                line-height: 1.6;
            }

            #${WIDGET_ID} .cp-close {
                width: 32px;
                height: 32px;
                flex: 0 0 32px;
                display: grid;
                place-items: center;
                padding: 0;
                border: 1px solid var(--border);
                border-radius: 10px;
                background: var(--surface-2);
                color: var(--text);
                font: inherit;
                font-size: 1.2rem;
                cursor: pointer;
            }

            #${WIDGET_ID} .cp-status {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 12px;
                margin: 12px 0;
                border: 1px solid var(--border);
                border-radius: 12px;
                background: var(--surface-2);
                color: var(--muted);
                font-size: .82rem;
                line-height: 1.55;
                overflow-wrap: anywhere;
            }

            #${WIDGET_ID} .cp-status-mark {
                flex: 0 0 auto;
            }

            #${WIDGET_ID} .cp-section {
                display: grid;
                gap: 10px;
                margin-top: 16px;
            }

            #${WIDGET_ID} .cp-section-title {
                margin: 0;
                color: var(--text);
                font-size: .88rem;
                font-weight: 800;
            }

            #${WIDGET_ID} .cp-label {
                display: grid;
                gap: 7px;
                color: var(--text);
                font-size: .82rem;
                font-weight: 700;
            }

            #${WIDGET_ID} .cp-code {
                width: 100%;
                min-width: 0;
                padding: 12px;
                border: 1px solid var(--border);
                border-radius: 11px;
                background: var(--surface-2);
                color: var(--text);
                font: 600 1rem/1.4 ui-monospace, monospace;
                letter-spacing: .12em;
                text-align: center;
                text-transform: uppercase;
            }

            #${WIDGET_ID} .cp-code:focus-visible,
            #${WIDGET_ID} button:focus-visible,
            #${WIDGET_ID} a:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 3px;
            }

            #${WIDGET_ID} .cp-download-callout {
                display: grid;
                gap: 8px;
                padding: 12px;
                border: 1px solid var(--border);
                border-radius: 12px;
                background: var(--surface);
            }

            #${WIDGET_ID} .cp-download-link {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                min-height: 42px;
                text-align: center;
                text-decoration: none;
                border-color: rgba(var(--accent-rgb), .35);
            }

            #${WIDGET_ID} .cp-download-link:hover {
                border-color: var(--accent);
            }

            #${WIDGET_ID} .cp-help {
                margin: 0;
                color: var(--muted);
                font-size: .76rem;
                line-height: 1.55;
            }

            #${WIDGET_ID} .cp-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-top: 16px;
            }

            #${WIDGET_ID} .cp-button {
                min-width: 0;
                padding: 10px 12px;
                border: 1px solid var(--border);
                border-radius: 11px;
                background: var(--surface-2);
                color: var(--text);
                font: inherit;
                font-size: .8rem;
                font-weight: 700;
                cursor: pointer;
                transition:
                    transform .15s ease,
                    opacity .15s ease;
            }

            #${WIDGET_ID} .cp-button:hover:not(:disabled) {
                transform: translateY(-1px);
            }

            #${WIDGET_ID} .cp-button:disabled {
                opacity: .45;
                cursor: not-allowed;
            }

            #${WIDGET_ID} .cp-button-primary {
                border-color: transparent;
                background: var(--accent);
                color: var(--accent-contrast);
            }

            #${WIDGET_ID} .cp-full {
                grid-column: 1 / -1;
                width: 100%;
            }

            #${WIDGET_ID} .cp-settings-list {
                display: grid;
                gap: 8px;
            }

            #${WIDGET_ID} .cp-setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 11px 12px;
                border: 1px solid var(--border);
                border-radius: 12px;
                background: var(--surface-2);
                color: var(--text);
                cursor: pointer;
            }

            #${WIDGET_ID} .cp-setting-copy {
                display: grid;
                gap: 4px;
                min-width: 0;
            }

            #${WIDGET_ID} .cp-setting-copy strong {
                font-size: .8rem;
                line-height: 1.4;
            }

            #${WIDGET_ID} .cp-setting-copy small {
                color: var(--muted);
                font-size: .72rem;
                font-weight: 400;
                line-height: 1.45;
            }

            #${WIDGET_ID} .cp-setting-row input[type="checkbox"] {
                flex: 0 0 auto;
                width: 18px;
                height: 18px;
                margin: 0;
                accent-color: var(--accent);
                cursor: pointer;
            }

            #${WIDGET_ID} .cp-privacy-note {
                margin: 0;
                color: var(--muted);
                font-size: .73rem;
                line-height: 1.5;
            }

            /* O tema personalizado controla os fundos do menu e dos cards do widget. */
            :root[data-theme="personalizado"] #${WIDGET_ID} .cp-popover {
                background: var(--custom-theme-menu-bg-color, var(--surface)) !important;
            }

            :root[data-theme="personalizado"] #${WIDGET_ID} .cp-status,
            :root[data-theme="personalizado"] #${WIDGET_ID} .cp-download-callout,
            :root[data-theme="personalizado"] #${WIDGET_ID} .cp-setting-row {
                background: var(--custom-theme-card-bg-color, var(--surface-2)) !important;
                color: var(--custom-theme-text-color, var(--text));
            }

            :root[data-theme="personalizado"] #${WIDGET_ID} .cp-code {
                background: var(--custom-theme-input-bg-color, #0C1218) !important;
                color: var(--custom-theme-text-color, var(--text)) !important;
                border-color: color-mix(in srgb, var(--custom-theme-input-bg-color, #0C1218) 78%, var(--custom-theme-text-color, #F4FBFF)) !important;
            }

            :root[data-theme="personalizado"] #${WIDGET_ID} .cp-button {
                background: var(--custom-theme-button-bg-color, var(--surface-2)) !important;
                color: var(--custom-theme-text-color, var(--text)) !important;
                border-color: color-mix(in srgb, var(--custom-theme-button-bg-color, #16002B) 72%, var(--custom-theme-text-color, #F4FBFF)) !important;
            }

            /* Rich Presence requer o programa e o Discord para computador.
               Oculte o controle em telas pequenas e dispositivos com toque primário. */
            @media (max-width: 680px), (hover: none) and (pointer: coarse) {
                #${WIDGET_ID} {
                    display: none !important;
                }
            }

            @media (max-width: 680px) {
                #${WIDGET_ID} .cp-popover {
                    right: 0;
                    width: min(350px, calc(100vw - 24px));
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #${WIDGET_ID} .cp-button {
                    transition: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    installStyles();

    // ==================================================
    // CRIAÇÃO DO BOTÃO E DO MENU
    // ==================================================

    const host = document.createElement("div");
    host.id = WIDGET_ID;

    host.innerHTML = `
        <button
            class="theme-button cp-trigger"
            id="cp-toggle"
            type="button"
            aria-expanded="false"
            aria-haspopup="dialog"
            aria-controls="cp-popover"
        >
            <span aria-hidden="true">🎮</span>
            <span>Presença</span>
            <span
                class="cp-indicator"
                id="cp-indicator"
                data-state="error"
                aria-hidden="true"
            ></span>
        </button>

        <section
            class="cp-popover"
            id="cp-popover"
            role="dialog"
            aria-label="Configurações do Crias Presence"
            hidden
        >
            <div class="cp-heading">
                <div>
                    <span class="eyebrow">UNIVERSO DOS CRIAS</span>
                    <h2>Crias Presence</h2>
                </div>

                <button
                    class="cp-close"
                    id="cp-close"
                    type="button"
                    aria-label="Fechar menu"
                >
                    ×
                </button>
            </div>

            <p class="cp-description">
                Gerencie a conexão e atualize sua atividade no Discord.
            </p>

            <div
                class="cp-status"
                id="cp-status"
                role="status"
                aria-live="polite"
            >
                <span class="cp-status-mark" aria-hidden="true">●</span>
                <span id="cp-status-text">
                    Aguardando conexão com o programa.
                </span>
            </div>

            <div class="cp-section">
                <div class="cp-download-callout">
                    <p class="cp-help">Ainda não tem o aplicativo instalado?</p>
                    <a
                        class="cp-button cp-download-link cp-full"
                        id="cp-download-link"
                        href="#"
                    >
                        Baixe o programa aqui <span aria-hidden="true">↗</span>
                    </a>
                </div>

                <button
                    class="cp-button cp-button-primary cp-full"
                    id="cp-connect"
                    type="button"
                >
                    Conectar ao programa
                </button>

                <p class="cp-help" id="cp-local-access-help" hidden>
                    No site publicado, o navegador pode pedir permissão para conectar ao aplicativo local
                    ("Apps no dispositivo" ou "Acesso à rede local"). Permita o acesso para continuar.
                    A conexão é feita com o programa neste computador.
                </p>

                <form id="cp-auth-form" hidden>
                    <label class="cp-label" for="cp-code">
                        Código temporário
                        <input
                            class="cp-code"
                            id="cp-code"
                            type="text"
                            minlength="8"
                            maxlength="8"
                            pattern="[A-HJ-NP-Z2-9]{8}"
                            autocomplete="off"
                            autocapitalize="characters"
                            spellcheck="false"
                            placeholder="ABCD2345"
                            required
                        >
                    </label>

                    <p class="cp-help">
                        Abra o Crias Presence no computador e
                        utilize o código exibido no terminal.
                    </p>

                    <button
                        class="cp-button cp-button-primary cp-full"
                        type="submit"
                    >
                        Autorizar conexão
                    </button>
                </form>
            </div>

            <div class="cp-section" aria-labelledby="cp-settings-title">
                <h3 class="cp-section-title" id="cp-settings-title">
                    Privacidade e preferências
                </h3>

                <div class="cp-settings-list">
                    <label class="cp-setting-row" for="cp-setting-enabled">
                        <span class="cp-setting-copy">
                            <strong>Ativar Rich Presence</strong>
                            <small>Permite ou pausa a atividade no Discord.</small>
                        </span>
                        <input id="cp-setting-enabled" type="checkbox">
                    </label>

                    <label class="cp-setting-row" for="cp-setting-story-title">
                        <span class="cp-setting-copy">
                            <strong>Mostrar título da história</strong>
                            <small>Inclui o nome da obra na atividade quando disponível.</small>
                        </span>
                        <input id="cp-setting-story-title" type="checkbox">
                    </label>

                    <label class="cp-setting-row" for="cp-setting-episode-details">
                        <span class="cp-setting-copy">
                            <strong>Mostrar episódio atual</strong>
                            <small>Exibe número e título do episódio ou piloto.</small>
                        </span>
                        <input id="cp-setting-episode-details" type="checkbox">
                    </label>

                    <label class="cp-setting-row" for="cp-setting-writer-activity">
                        <span class="cp-setting-copy">
                            <strong>Mostrar atividade do escritor</strong>
                            <small>Permite exibir quando você está no portal ou editando uma obra.</small>
                        </span>
                        <input id="cp-setting-writer-activity" type="checkbox">
                    </label>

                    <label class="cp-setting-row" for="cp-setting-images">
                        <span class="cp-setting-copy">
                            <strong>Mostrar imagens das obras</strong>
                            <small>Exibe a logo ou as capas de histórias e episódios na atividade do Discord.</small>
                        </span>
                        <input id="cp-setting-images" type="checkbox">
                    </label>

                    <label class="cp-setting-row" for="cp-setting-story-section">
                        <span class="cp-setting-copy">
                            <strong>Mostrar seção da história</strong>
                            <small>Na página da obra, exibe “Vendo episódios”, “Lendo notícias” ou “Lendo avaliações”. Desative para usar “Lendo uma história”.</small>
                        </span>
                        <input id="cp-setting-story-section" type="checkbox">
                    </label>

                    <label class="cp-setting-row" for="cp-setting-current-page-button">
                        <span class="cp-setting-copy">
                            <strong>Mostrar botão da página atual</strong>
                            <small>Adiciona um botão para abrir a página atual de leitura. Ele não aparece no Portal do Escritor.</small>
                        </span>
                        <input id="cp-setting-current-page-button" type="checkbox">
                    </label>
                </div>

                <p class="cp-privacy-note">
                    As preferências ficam salvas na sua conta quando você está conectado. Ao ativar imagens, as URLs das capas são enviadas ao Discord para exibição. O botão “Conheça o Universo” é padrão; o botão da página atual é opcional e nunca aparece no Portal do Escritor.
                </p>
            </div>

            <div class="cp-actions">
                <button
                    class="cp-button"
                    id="cp-retry"
                    type="button"
                >
                    Reconectar
                </button>

                <button
                    class="cp-button"
                    id="cp-refresh"
                    type="button"
                    disabled
                >
                    Atualizar presença
                </button>

                <button
                    class="cp-button cp-full"
                    id="cp-clear"
                    type="button"
                    disabled
                >
                    Limpar presença
                </button>
            </div>
        </section>
    `;

    // Resolve a página a partir da localização deste módulo, para funcionar
    // tanto em /universo-crias-newstart/ no GitHub Pages quanto no Live Server local.
    const downloadPageLink = host.querySelector("#cp-download-link");
    if (downloadPageLink) {
        downloadPageLink.href = new URL("../../../crias-presence.html", import.meta.url).href;

        // Na própria página de instalação, o callout seria redundante.
        if (window.location.pathname.endsWith("/crias-presence.html")) {
            downloadPageLink.closest(".cp-download-callout")?.setAttribute("hidden", "");
        }
    }

    // Coloca o botão próximo aos filtros e antes do seletor de tema.
    const navigation = document.querySelector(".main-nav");
    const header = document.querySelector(".site-header");
    const themeButton = document.querySelector("#theme-toggle");

    if (navigation) {
        if (themeButton?.parentElement === navigation) {
            navigation.insertBefore(host, themeButton);
        } else {
            navigation.appendChild(host);
        }
    } else if (header) {
        header.appendChild(host);
    } else {
        document.body.prepend(host);
    }

    // ==================================================
    // REFERÊNCIAS DA INTERFACE
    // ==================================================

    const toggleButton = host.querySelector("#cp-toggle");
    const closeButton = host.querySelector("#cp-close");
    const popover = host.querySelector("#cp-popover");

    const statusText = host.querySelector("#cp-status-text");
    const statusIndicator = host.querySelector("#cp-indicator");

    const connectButton = host.querySelector("#cp-connect");
    const retryButton = host.querySelector("#cp-retry");
    const refreshButton = host.querySelector("#cp-refresh");
    const clearButton = host.querySelector("#cp-clear");

    const authForm = host.querySelector("#cp-auth-form");
    const codeInput = host.querySelector("#cp-code");
    const localAccessHelp = host.querySelector("#cp-local-access-help");

    if (localAccessHelp) {
        localAccessHelp.hidden = !isGitHubPagesOrigin;
    }

    const settingsInputs = {
        enabled: host.querySelector("#cp-setting-enabled"),
        showStoryTitle: host.querySelector("#cp-setting-story-title"),
        showEpisodeDetails: host.querySelector("#cp-setting-episode-details"),
        showWriterActivity: host.querySelector("#cp-setting-writer-activity"),
        showImages: host.querySelector("#cp-setting-images"),
        showStorySection: host.querySelector("#cp-setting-story-section"),
        showCurrentPageButton: host.querySelector("#cp-setting-current-page-button"),
    };

    // ==================================================
    // UTILITÁRIOS
    // ==================================================

    function normalizeText(value) {
        if (typeof value !== "string") {
            return "";
        }

        return value
            .replace(/[\u0000-\u001F\u007F]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, MAX_TEXT_LENGTH);
    }

    function normalizeImageUrl(value) {
        if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_IMAGE_URL_LENGTH) return "";
        try {
            const url = new URL(value.trim(), window.location.href);
            if (url.protocol !== "https:" || url.username || url.password || url.href.length > MAX_IMAGE_URL_LENGTH) return "";
            return url.href;
        } catch {
            return "";
        }
    }

    function normalizePublicPageUrl(value) {
        if (typeof value !== "string" || !value.trim()) return "";
        try {
            const url = new URL(value.trim(), window.location.href);
            if (url.username || url.password) return "";

            // Em localhost, Rich Presence deve apontar para a versão publicada do
            // site, não para o computador de quem está desenvolvendo.
            if (["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol)) {
                const relativePath = url.pathname.replace(/^\/+/, "") || "index.html";
                const publicUrl = new URL(relativePath, PUBLIC_SITE_BASE_URL);
                publicUrl.search = url.search;
                publicUrl.hash = url.hash;
                return publicUrl.href.length <= 512 ? publicUrl.href : "";
            }

            if (url.protocol !== "https:" || url.origin !== PUBLIC_SITE_ORIGIN ||
                !url.pathname.startsWith("/universo-crias-newstart/")) return "";
            return url.href.length <= 512 ? url.href : "";
        } catch {
            return "";
        }
    }

    function normalizeActivity(value = {}) {
        const pageContext = ["home", "story", "episode", "writer"].includes(value.pageContext)
            ? value.pageContext
            : "other";
        const storySection = Object.hasOwn(STORY_SECTION_DETAILS, value.storySection)
            ? value.storySection
            : "chapters";
        const currentPageButtonLabel = normalizeText(value.currentPageButtonLabel).slice(0, 32);

        return {
            details: normalizeText(value.details),
            state: normalizeText(value.state),
            largeImageUrl: normalizeImageUrl(value.largeImageUrl) || CRIAS_PRESENCE_LOGO_URL,
            smallImageUrl: normalizeImageUrl(value.smallImageUrl),
            largeImageText: normalizeText(value.largeImageText) || "Universo dos Crias",
            smallImageText: normalizeText(value.smallImageText),
            pageContext,
            storySection,
            storyTitle: normalizeText(value.storyTitle),
            currentPageUrl: normalizePublicPageUrl(value.currentPageUrl),
            currentPageButtonLabel,
        };
    }

    function saveSettings({ syncRemote = true } = {}) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (error) {
            console.warn("Não foi possível salvar as preferências do Crias Presence:", error);
            setStatus("Não foi possível salvar as preferências neste navegador.", "error");
        }

        if (syncRemote) {
            saveUserPreferencePatch({
                presence_enabled: settings.enabled,
                presence_show_story_title: settings.showStoryTitle,
                presence_show_episode_details: settings.showEpisodeDetails,
                presence_show_writer_activity: settings.showWriterActivity,
                presence_show_images: settings.showImages,
                presence_show_story_section: settings.showStorySection,
                presence_show_current_page_button: settings.showCurrentPageButton,
            }).catch((error) => {
                console.warn("Não foi possível sincronizar as preferências de Presença com a conta:", error);
            });
        }
    }

    function renderSettingsControls() {
        for (const [key, input] of Object.entries(settingsInputs)) {
            input.checked = Boolean(settings[key]);
        }
    }

    function withPrivacyFilteredImages(textActivity, { hideArtwork = false } = {}) {
        const result = { ...textActivity };

        // Só as três páginas de leitura podem acrescentar o botão contextual.
        // Páginas do portal/editor e páginas auxiliares ficam apenas com o botão
        // institucional inserido pelo aplicativo desktop.
        if (
            settings.showCurrentPageButton &&
            READER_PAGE_CONTEXTS.has(activity.pageContext) &&
            activity.currentPageUrl &&
            activity.currentPageButtonLabel
        ) {
            result.currentPageButton = {
                label: activity.currentPageButtonLabel,
                url: activity.currentPageUrl,
            };
        }

        if (!settings.showImages) return result;

        result.largeImageUrl = hideArtwork
            ? CRIAS_PRESENCE_LOGO_URL
            : (activity.largeImageUrl || CRIAS_PRESENCE_LOGO_URL);
        result.largeImageText = hideArtwork
            ? "Universo dos Crias"
            : (activity.largeImageText || "Universo dos Crias");

        if (!hideArtwork && activity.smallImageUrl) {
            result.smallImageUrl = activity.smallImageUrl;
            if (activity.smallImageText) result.smallImageText = activity.smallImageText;
        }
        return result;
    }

    function getPrivacyFilteredActivity() {
        if (!settings.enabled) return null;

        const details = activity.details;
        const state = activity.state;
        const isWriterActivity = /^(No portal do Escritor|Gerenciando histórias|Editando uma história|Editando um episódio|Criando uma história)/i.test(details);

        // Se a atividade de escritor estiver oculta, não compartilhamos a capa
        // da obra que pode estar em rascunho; a logo genérica é usada no lugar.
        if (isWriterActivity && !settings.showWriterActivity) {
            return withPrivacyFilteredImages({
                details: "No Universo dos Crias",
                state: "Universo dos Crias",
            }, { hideArtwork: true });
        }

        if (activity.pageContext === "story") {
            const sectionDetails = STORY_SECTION_DETAILS[activity.storySection] || STORY_SECTION_DETAILS.chapters;
            const safeDetails = settings.showStorySection ? sectionDetails : "Lendo uma história";
            const storyName = activity.storyTitle || state;
            return withPrivacyFilteredImages({
                details: safeDetails,
                state: settings.showStoryTitle && storyName ? `História: ${storyName}` : "Universo dos Crias",
            });
        }

        if (details === "Lendo uma história") {
            return withPrivacyFilteredImages({
                details,
                state: settings.showStoryTitle && state ? state : "Universo dos Crias",
            });
        }

        if (details.startsWith("Lendo: ")) {
            const storyTitle = details.slice("Lendo: ".length).trim();
            return withPrivacyFilteredImages({
                details: settings.showStoryTitle && storyTitle ? `Lendo: ${storyTitle}` : "Lendo um episódio",
                state: settings.showEpisodeDetails && state ? state : "Universo dos Crias",
            });
        }

        if (details === "Editando uma história") {
            return withPrivacyFilteredImages({
                details,
                state: settings.showStoryTitle && state ? state : "Editor de histórias",
            });
        }

        if (details === "Editando um episódio") {
            const separator = state.lastIndexOf(" · ");
            const storyTitle = separator >= 0 ? state.slice(0, separator).trim() : "";
            const episodeLabel = separator >= 0 ? state.slice(separator + 3).trim() : state;
            let safeState = "Editor de episódios";
            if (settings.showStoryTitle && storyTitle && settings.showEpisodeDetails && episodeLabel) {
                safeState = `${storyTitle} · ${episodeLabel}`;
            } else if (settings.showStoryTitle && storyTitle) {
                safeState = storyTitle;
            } else if (settings.showEpisodeDetails && episodeLabel) {
                safeState = episodeLabel;
            }
            return withPrivacyFilteredImages({ details, state: safeState });
        }

        return withPrivacyFilteredImages({ details, state });
    }

    function setStatus(message, state = "info") {
        statusText.textContent = message;
        statusIndicator.dataset.state = state;
    }

    function send(message) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            setStatus(
                "Não há conexão ativa com o programa.",
                "error"
            );

            return false;
        }

        socket.send(JSON.stringify(message));
        return true;
    }

    function isConnected() {
        return socket?.readyState === WebSocket.OPEN;
    }

    function updateControls() {
        const connected = isConnected();

        const connecting =
            socket?.readyState === WebSocket.CONNECTING;

        connectButton.disabled = connected || connecting;

        connectButton.textContent = connecting
            ? "Conectando..."
            : connected
                ? "Programa conectado"
                : "Conectar ao programa";

        authForm.hidden = !connected || authorized;

        refreshButton.disabled =
            !connected || !authorized || !discordReady || !settings.enabled;

        clearButton.disabled =
            !connected || !authorized || !discordReady;

        if (authorized && discordReady) {
            statusIndicator.dataset.state = "ready";
        } else if (connected) {
            statusIndicator.dataset.state = "connected";
        } else {
            statusIndicator.dataset.state = "error";
        }
    }

    function openMenu() {
        popover.hidden = false;
        toggleButton.setAttribute("aria-expanded", "true");

        if (authorized && discordReady) {
            refreshButton.focus();
        } else if (isConnected() && !authorized) {
            codeInput.focus();
        }
    }

    function closeMenu() {
        popover.hidden = true;
        toggleButton.setAttribute("aria-expanded", "false");
    }

    function publishActivity() {
        if (!settings.enabled) {
            setStatus("Rich Presence está desativada nas preferências.", "info");
            return false;
        }

        if (!authorized || !discordReady) {
            setStatus(
                "Conecte e autorize o programa antes de atualizar a presença.",
                "error"
            );

            return false;
        }

        const safeActivity = getPrivacyFilteredActivity();

        if (!safeActivity || (!safeActivity.details && !safeActivity.state)) {
            setStatus(
                "Não há informações de atividade permitidas pelas preferências.",
                "error"
            );
            return false;
        }

        pendingAction = "update";

        setStatus("Enviando atualização para o Discord...");

        const imageFields = appSupportsImages ? {
            ...(safeActivity.largeImageUrl ? { largeImageUrl: safeActivity.largeImageUrl } : {}),
            ...(safeActivity.smallImageUrl ? { smallImageUrl: safeActivity.smallImageUrl } : {}),
            ...(safeActivity.largeImageText ? { largeImageText: safeActivity.largeImageText } : {}),
            ...(safeActivity.smallImageText ? { smallImageText: safeActivity.smallImageText } : {}),
        } : {};

        return send({
            type: "UPDATE_ACTIVITY",
            details: safeActivity.details,
            state: safeActivity.state,
            ...imageFields,
            ...(appSupportsButtons && safeActivity.currentPageButton
                ? { currentPageButton: safeActivity.currentPageButton }
                : {}),
        });
    }

    function clearPresence(reason = "manual") {
        if (!authorized || !discordReady) {
            setStatus(
                "Conecte e autorize o programa primeiro.",
                "error"
            );

            return false;
        }

        pendingAction = reason === "settings-disabled" ? "settings-disabled" : "clear";

        setStatus("Solicitando a remoção da atividade...");

        return send({
            type: "CLEAR_ACTIVITY",
        });
    }

    // ==================================================
    // PERMISSÃO DE ACESSO AO LOOPBACK NO SITE PUBLICADO
    // ==================================================

    async function getLoopbackPermissionState() {
        if (!isGitHubPagesOrigin) {
            return "granted";
        }

        if (!navigator.permissions?.query) {
            // Navegadores sem a consulta granular ainda podem permitir
            // que a tentativa iniciada por clique faça a conexão.
            return "unsupported";
        }

        try {
            const permission = await navigator.permissions.query({
                name: "loopback-network",
            });
            return permission.state;
        } catch {
            // Alguns navegadores ainda não reconhecem o nome da permissão.
            return "unsupported";
        }
    }

    // ==================================================
    // CONEXÃO WEBSOCKET
    // ==================================================

    async function connect(force = false, userInitiated = false) {
        // Em HTTPS público, não disparamos a primeira solicitação de acesso
        // local automaticamente enquanto a permissão ainda precisa de decisão.
        // O botão chama connect(..., true) para manter o gesto do usuário.
        if (isGitHubPagesOrigin && !userInitiated) {
            const permissionState = await getLoopbackPermissionState();

            if (permissionState === "prompt") {
                setStatus(
                    "Para conectar, clique em Conectar ao programa e permita o acesso ao aplicativo local quando o navegador perguntar.",
                    "connected"
                );
                updateControls();
                return;
            }

            if (permissionState === "denied") {
                setStatus(
                    "O acesso ao aplicativo local está bloqueado nas permissões deste site. Libere 'Apps no dispositivo' ou 'Loopback network' nas configurações do navegador e tente novamente.",
                    "error"
                );
                updateControls();
                return;
            }
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (!force && socket) {
            if (
                socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING
            ) {
                return;
            }
        }

        if (force && socket) {
            const previousSocket = socket;
            socket = null;

            previousSocket.close();
        }

        authorized = false;
        discordReady = false;
        pendingAction = null;

        updateControls();

        setStatus(
            isGitHubPagesOrigin
                ? "Conectando ao programa local. Se o navegador pedir permissão para acessar o aplicativo neste computador, permita para continuar."
                : "Conectando ao Crias Presence...",
            "connected"
        );

        let connection;

        try {
            connection = new WebSocket(WS_URL);
        } catch {
            setStatus(
                "Não foi possível iniciar a conexão.",
                "error"
            );

            updateControls();
            return;
        }

        socket = connection;

        connection.addEventListener("open", () => {
            setStatus(
                "Programa encontrado. Verificando autorização...",
                "connected"
            );

            updateControls();
        });

        connection.addEventListener("message", (event) => {
            let data;

            try {
                data = JSON.parse(event.data);
            } catch {
                setStatus(
                    "O programa enviou uma resposta inválida.",
                    "error"
                );

                return;
            }

            switch (data.type) {
                case "CONNECTED": {
                    discordReady = data.discordReady === true;
                    appSupportsImages = data.supportsImages === true;
                    appSupportsButtons = data.supportsButtons === true;

                    const existingToken =
                        sessionStorage.getItem(SESSION_KEY);

                    updateControls();

                    if (existingToken) {
                        setStatus(
                            "Validando a sessão existente...",
                            "connected"
                        );

                        send({
                            type: "AUTH_SESSION",
                            sessionToken: existingToken,
                        });
                    } else {
                        setStatus(
                            discordReady
                                ? "Programa conectado. Informe o código temporário."
                                : "Programa conectado. O Discord ainda não está pronto.",
                            "connected"
                        );
                    }

                    break;
                }

                case "DISCORD_STATUS": {
                    discordReady = data.discordReady === true;
                    updateControls();

                    if (authorized && discordReady) {
                        setStatus("Discord conectado. Atualizando presença...", "ready");
                        scheduleActivityPublish(250);
                    } else if (authorized && !discordReady) {
                        setStatus("O Discord desconectou. Aguardando reconexão...", "connected");
                    }

                    break;
                }

                case "AUTH_OK": {
                    authorized = true;
                    reconnectAttempts = 0;

                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                        reconnectTimer = null;
                    }

                    if (typeof data.sessionToken === "string") {
                        sessionStorage.setItem(
                            SESSION_KEY,
                            data.sessionToken
                        );
                    }

                    updateControls();

                    setStatus(
                        discordReady
                            ? "Conexão autorizada com sucesso!"
                            : "Sessão autorizada. Aguardando o Discord.",
                        "ready"
                    );

                    if (discordReady) {
                        scheduleActivityPublish();
                    }

                    break;
                }

                case "AUTH_REQUIRED": {
                    sessionStorage.removeItem(SESSION_KEY);

                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                        reconnectTimer = null;
                    }

                    reconnectAttempts = 0;
                    authorized = false;
                    discordReady = false;
                    pendingAction = null;

                    updateControls();

                    setStatus(
                        "A autorização expirou ou não é válida. Informe um novo código.",
                        "error"
                    );

                    break;
                }

                case "ACK": {
                    const action = pendingAction;
                    pendingAction = null;

                    if (!data.ok) {
                        setStatus(
                            "O programa não confirmou a operação.",
                            "error"
                        );

                        break;
                    }

                    if (action === "clear") {
                        setStatus(
                            "Presença removida do Discord.",
                            "ready"
                        );
                    } else if (action === "settings-disabled") {
                        setStatus(
                            "Rich Presence desativada; a atividade foi removida.",
                            "info"
                        );
                    } else {
                        setStatus(
                            settings.showImages && !appSupportsImages
                                ? "Atividade textual atualizada. Instale o Crias Presence 1.2.0 ou mais recente para exibir imagens."
                                : !appSupportsButtons
                                    ? "Atividade atualizada. Instale o Crias Presence 1.3.0 para usar os botões da atividade."
                                    : "Rich Presence atualizada com sucesso!",
                            "ready"
                        );
                    }

                    break;
                }

                case "ERROR": {
                    const failedAction = pendingAction;

                     pendingAction = null;

                    setStatus(
                        data.error || "Ocorreu um erro no programa.",
                        "error"
                    );

                    updateControls();

                    const errorText = String(data.error || "");

                    if (
                        failedAction === "update" &&
                        /aguarde|outra atualização/i.test(errorText)
                    ) {
                        if (rateLimitRetryTimer) {
                            clearTimeout(rateLimitRetryTimer);
                        }

                    rateLimitRetryTimer = setTimeout(() => {
                        rateLimitRetryTimer = null;

                        if (authorized && discordReady && !pageUnloading) {
                            scheduleActivityPublish(0);
                        }
                    }, RATE_LIMIT_RETRY_MS);

                }

                break;
            }

                default:
                    console.debug(
                        "[Crias Presence] Mensagem recebida:",
                        data.type
                    );
            }
        });

        connection.addEventListener("error", () => {
            setStatus(
                isGitHubPagesOrigin
                    ? "Não foi possível conectar. Confirme que o Crias Presence está aberto e que o navegador permitiu o acesso ao aplicativo local (Loopback network/Apps no dispositivo)."
                    : "Não foi possível conectar. Verifique se o Crias Presence está aberto.",
                "error"
            );
        });

        connection.addEventListener("close", () => {
            // Ignora eventos de conexões antigas após uma reconexão.
            if (socket !== connection) {
                return;
            }

            socket = null;
            authorized = false;
            discordReady = false;
            appSupportsImages = false;
            appSupportsButtons = false;
            pendingAction = null;

            updateControls();

            if (publishTimer) {
                clearTimeout(publishTimer);
                publishTimer = null;
            }

            if (rateLimitRetryTimer) {
                clearTimeout(rateLimitRetryTimer);
                rateLimitRetryTimer = null;
            }

            if (!pageUnloading) {
                const hasSession = Boolean(sessionStorage.getItem(SESSION_KEY));

                if (hasSession) {
                    setStatus("Conexão interrompida. Tentando reconectar automaticamente...", "connected");
                    scheduleReconnect();
                } else {
                    setStatus(
                        "Conexão encerrada. Clique em Reconectar para tentar novamente.",
                        "error"
                    );
                }
            }
        });
    }

    function scheduleReconnect() {
        if (
            pageUnloading ||
            reconnectTimer ||
            !sessionStorage.getItem(SESSION_KEY)
        ) {
            return;
        }

        const exponent = Math.min(reconnectAttempts, 4);
        const delay = Math.min(
            RECONNECT_BASE_DELAY_MS * (2 ** exponent),
            RECONNECT_MAX_DELAY_MS
        );

        reconnectAttempts += 1;

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;

            if (!pageUnloading) {
                connect();
            }
        }, delay);
    }

    // ==================================================
    // EVENTOS DA INTERFACE
    // ==================================================

    toggleButton.addEventListener("click", () => {
        if (popover.hidden) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    closeButton.addEventListener("click", closeMenu);

    connectButton.addEventListener("click", () => {
        // A tentativa explícita permite que o navegador apresente o aviso LNA.
        connect(false, true);
    });

    retryButton.addEventListener("click", () => {
        connect(true, true);
    });

    authForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const code = codeInput.value
            .trim()
            .replace(/[\s-]/g, "")
            .toUpperCase();

        if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
            setStatus(
                "Digite um código válido de oito caracteres.",
                "error"
            );

            return;
        }

        if (send({ type: "AUTH", code })) {
            codeInput.value = "";

            setStatus(
                "Verificando o código de vinculação..."
            );
        }
    });

    refreshButton.addEventListener("click", () => {
        publishActivity();
    });

    clearButton.addEventListener("click", () => {
        clearPresence("manual");
    });

    function applySettingsChange(previousSettings) {
        saveSettings();
        renderSettingsControls();
        updateControls();

        if (!settings.enabled) {
            if (authorized && discordReady) {
                clearPresence("settings-disabled");
            } else {
                setStatus("Rich Presence está desativada nas preferências.", "info");
            }
            return;
        }

        const privacyChanged =
            previousSettings.showStoryTitle !== settings.showStoryTitle ||
            previousSettings.showEpisodeDetails !== settings.showEpisodeDetails ||
            previousSettings.showWriterActivity !== settings.showWriterActivity ||
            previousSettings.showImages !== settings.showImages ||
            previousSettings.showStorySection !== settings.showStorySection ||
            previousSettings.showCurrentPageButton !== settings.showCurrentPageButton;

        if (authorized && discordReady) {
            if (!previousSettings.enabled || privacyChanged) {
                scheduleActivityPublish(0);
            }
        }
    }

    for (const [key, input] of Object.entries(settingsInputs)) {
        input.addEventListener("change", () => {
            const previousSettings = { ...settings };
            settings = {
                ...settings,
                [key]: input.checked,
            };

            applySettingsChange(previousSettings);
        });
    }

    // Preferências alteradas em outra aba são aplicadas aqui também.
    window.addEventListener("storage", (event) => {
        if (event.key !== SETTINGS_KEY) {
            return;
        }

        const previousSettings = { ...settings };
        settings = loadSavedSettings();
        applySettingsChangeFromStorage(previousSettings);
    });

    function applyAccountPreferences(preferences) {
        if (!preferences) return;
        const previousSettings = { ...settings };
        settings = {
            enabled: preferences.presence_enabled,
            showStoryTitle: preferences.presence_show_story_title,
            showEpisodeDetails: preferences.presence_show_episode_details,
            showWriterActivity: preferences.presence_show_writer_activity,
            showImages: preferences.presence_show_images,
            showStorySection: preferences.presence_show_story_section,
            showCurrentPageButton: preferences.presence_show_current_page_button,
        };
        // Evita escrever de volta para a nuvem ao aplicar uma mudança recebida dela.
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (error) {
            console.warn("Não foi possível aplicar as preferências de Presença:", error);
        }
        applySettingsChangeFromStorage(previousSettings);
    }

    window.addEventListener("hdc-user-preferences-applied", (event) => {
        applyAccountPreferences(event.detail?.preferences);
    });

    // Cobre também o caso em que a leitura da conta terminou antes de este
    // widget registrar o evento global de preferências.
    syncUserPreferences().then((account) => {
        if (account?.preferences) applyAccountPreferences(account.preferences);
    }).catch((error) => {
        console.warn("Não foi possível recuperar as preferências de Presença da conta:", error);
    });

    function applySettingsChangeFromStorage(previousSettings) {
        renderSettingsControls();
        updateControls();

        if (!settings.enabled) {
            if (authorized && discordReady) {
                clearPresence("settings-disabled");
            } else {
                setStatus("Rich Presence está desativada nas preferências.", "info");
            }
            return;
        }

        const privacyChanged =
            previousSettings.enabled !== settings.enabled ||
            previousSettings.showStoryTitle !== settings.showStoryTitle ||
            previousSettings.showEpisodeDetails !== settings.showEpisodeDetails ||
            previousSettings.showWriterActivity !== settings.showWriterActivity ||
            previousSettings.showImages !== settings.showImages ||
            previousSettings.showStorySection !== settings.showStorySection ||
            previousSettings.showCurrentPageButton !== settings.showCurrentPageButton;

        if (privacyChanged && authorized && discordReady) {
            scheduleActivityPublish(0);
        }
    }

    document.addEventListener("click", (event) => {
        if (!host.contains(event.target)) {
            closeMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    window.addEventListener("beforeunload", () => {
        pageUnloading = true;

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (publishTimer) {
            clearTimeout(publishTimer);
            publishTimer = null;
        }

        if (rateLimitRetryTimer) {
            clearTimeout(rateLimitRetryTimer);
            rateLimitRetryTimer = null;
        }

        if (socket) {
            const oldSocket = socket;
            socket = null;

            oldSocket.close();
        }
    });

    // ==================================================
    // INICIALIZAÇÃO
    // ==================================================

    setStatus(
        settings.enabled
            ? "Aguardando conexão com o programa."
            : "Rich Presence está desativada nas preferências."
    );

    renderSettingsControls();
    updateControls();

    const api = {
        update(nextActivity) {
            activity = normalizeActivity(nextActivity);

            if (authorized && discordReady && settings.enabled) {
                scheduleActivityPublish();
            }
        },

        clear() {
            clearPresence();
        },

        reconnect() {
            connect(true);
        },

        refresh() {
            return publishActivity();
        },

        getSettings() {
            return { ...settings };
        },
    };

    host.criasPresenceApi = api;

    function scheduleActivityPublish(delay = AUTO_PUBLISH_DELAY_MS) {
        if (!authorized || !discordReady) {
            return;
        }

        if (publishTimer) {
            clearTimeout(publishTimer);
        }

        publishTimer = setTimeout(() => {
            publishTimer = null;

        if (authorized && discordReady && !pageUnloading) {
            publishActivity();
        }
    }, delay);

}

    // Se existir uma sessão, tenta recuperá-la. No GitHub Pages a tentativa
    // automática só ocorre se o navegador já concedeu a permissão loopback;
    // caso ainda seja necessária uma decisão, o usuário inicia pelo botão.
    if (sessionStorage.getItem(SESSION_KEY)) {
        connect(false, false);
    }

    return api;
}