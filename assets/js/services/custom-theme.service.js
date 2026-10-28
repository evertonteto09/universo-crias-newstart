import { supabase } from "../core/supabase.js";

const DB_NAME = "universo-crias-theme-settings";
const DB_VERSION = 2;
const STORE_NAME = "settings";
const ASSET_STORE_NAME = "assets";
const SETTINGS_KEY = "custom-gradient";
const BACKGROUND_ASSET_KEY = "custom-theme-background";
const FALLBACK_KEY = "hdc-custom-theme-fallback";
export const THEME_BACKGROUND_BUCKET = "user-theme-backgrounds";
export const THEME_BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;
export const THEME_BACKGROUND_MIME_TYPES = Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
]);

export const DEFAULT_CUSTOM_THEME = Object.freeze({
    custom_theme_color_1: "#00E5FF",
    custom_theme_color_2: "#16002B",
    custom_theme_direction: "horizontal",
    custom_theme_title_color: "#F4FBFF",
    custom_theme_text_color: "#F4FBFF",
    custom_theme_interactive_text_color: "#F4FBFF",
    custom_theme_label_color: "#A2BEC5",
    custom_theme_card_bg_color: "#0C1218",
    custom_theme_menu_bg_color: "#111A22",
    custom_theme_button_bg_color: "#16002B",
    custom_theme_input_bg_color: "#0C1218",
    custom_theme_hover_color: "#00E5FF",
    custom_theme_background_type: "gradient",
    custom_theme_background_source: "url",
    custom_theme_background_url: "",
    custom_theme_background_path: "",
    custom_theme_background_dim: 0,
    custom_theme_background_blur: 0,
    custom_theme_background_position: "cover",
    custom_theme_background_zoom: 100,
    custom_theme_background_rotation: 0,
    custom_theme_background_flip_x: false,
    custom_theme_background_flip_y: false,
    custom_theme_background_offset_x: 0,
    custom_theme_background_offset_y: 0,
});

let cachedSettings = { ...DEFAULT_CUSTOM_THEME };
let databasePromise = null;
let resolvedBackgroundKey = "";
let resolvedBackgroundUrl = "";
let resolvedBackgroundExpiresAt = 0;
let anonymousBackgroundFingerprint = "";
let anonymousBackgroundObjectUrl = "";
let customThemeBackgroundRequest = 0;

export function normalizeHexColor(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    if (!/^[\da-fA-F]{6}$/.test(raw)) return fallback;
    return `#${raw.toUpperCase()}`;
}

export function normalizeBackgroundImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
        return url.href;
    } catch {
        return "";
    }
}

export function validateThemeBackgroundFile(file) {
    if (!(file instanceof Blob)) {
        throw new Error("Selecione um arquivo de imagem válido.");
    }
    if (file.size <= 0) {
        throw new Error("A imagem selecionada está vazia.");
    }
    if (file.size > THEME_BACKGROUND_MAX_BYTES) {
        throw new Error("A imagem deve ter no máximo 5 MB.");
    }
    const mime = String(file.type || "").toLowerCase();
    if (!THEME_BACKGROUND_MIME_TYPES.includes(mime)) {
        throw new Error("Formato não suportado. Use PNG, JPEG, WebP, AVIF ou GIF.");
    }
    return true;
}

function normalizeStoragePath(value) {
    if (typeof value !== "string") return "";
    const path = value.trim().replace(/^\/+/, "");
    if (!path || path.length > 700 || path.includes("\\") || path.split("/").some((part) => part === ".." || part === ".")) {
        return "";
    }
    return path;
}

export function normalizeCustomThemeSettings(value = {}) {
    // Compatibilidade: quem ainda não salvou a cor do texto interativo mantém
    // a cor geral como referência, sem perder as demais personalizações.
    const generalTextColor = normalizeHexColor(
        value.custom_theme_text_color,
        DEFAULT_CUSTOM_THEME.custom_theme_text_color,
    );
    const color2 = normalizeHexColor(value.custom_theme_color_2, DEFAULT_CUSTOM_THEME.custom_theme_color_2);
    // Compatibilidade: temas antigos usavam a segunda cor do gradiente nos rótulos.
    // Se um registro antigo ainda não tiver a nova preferência, preserve essa aparência.
    const labelColorFallback = Object.hasOwn(value, "custom_theme_color_2")
        ? color2
        : DEFAULT_CUSTOM_THEME.custom_theme_label_color;
    const source = value.custom_theme_background_source === "upload" ? "upload" : "url";

    return {
        custom_theme_color_1: normalizeHexColor(value.custom_theme_color_1, DEFAULT_CUSTOM_THEME.custom_theme_color_1),
        custom_theme_color_2: color2,
        custom_theme_direction: value.custom_theme_direction === "vertical" ? "vertical" : "horizontal",
        custom_theme_title_color: normalizeHexColor(value.custom_theme_title_color, DEFAULT_CUSTOM_THEME.custom_theme_title_color),
        custom_theme_text_color: generalTextColor,
        custom_theme_interactive_text_color: normalizeHexColor(value.custom_theme_interactive_text_color, generalTextColor),
        custom_theme_label_color: normalizeHexColor(value.custom_theme_label_color, labelColorFallback),
        custom_theme_card_bg_color: normalizeHexColor(value.custom_theme_card_bg_color, DEFAULT_CUSTOM_THEME.custom_theme_card_bg_color),
        custom_theme_menu_bg_color: normalizeHexColor(value.custom_theme_menu_bg_color, DEFAULT_CUSTOM_THEME.custom_theme_menu_bg_color),
        custom_theme_button_bg_color: normalizeHexColor(value.custom_theme_button_bg_color, DEFAULT_CUSTOM_THEME.custom_theme_button_bg_color),
        custom_theme_input_bg_color: normalizeHexColor(value.custom_theme_input_bg_color, DEFAULT_CUSTOM_THEME.custom_theme_input_bg_color),
        custom_theme_hover_color: normalizeHexColor(value.custom_theme_hover_color, DEFAULT_CUSTOM_THEME.custom_theme_hover_color),
        custom_theme_background_type: value.custom_theme_background_type === "image" ? "image" : "gradient",
        custom_theme_background_source: source,
        custom_theme_background_url: normalizeBackgroundImageUrl(value.custom_theme_background_url),
        custom_theme_background_path: normalizeStoragePath(value.custom_theme_background_path),
        custom_theme_background_dim: normalizeInteger(value.custom_theme_background_dim, 0, 80, DEFAULT_CUSTOM_THEME.custom_theme_background_dim),
        custom_theme_background_blur: normalizeInteger(value.custom_theme_background_blur, 0, 20, DEFAULT_CUSTOM_THEME.custom_theme_background_blur),
        custom_theme_background_position: ["center", "contain", "cover", "custom"].includes(value.custom_theme_background_position)
            ? value.custom_theme_background_position
            : DEFAULT_CUSTOM_THEME.custom_theme_background_position,
        custom_theme_background_zoom: normalizeInteger(value.custom_theme_background_zoom, 100, 300, DEFAULT_CUSTOM_THEME.custom_theme_background_zoom),
        custom_theme_background_rotation: normalizeRotation(value.custom_theme_background_rotation),
        custom_theme_background_flip_x: value.custom_theme_background_flip_x === true,
        custom_theme_background_flip_y: value.custom_theme_background_flip_y === true,
        custom_theme_background_offset_x: normalizeInteger(value.custom_theme_background_offset_x, -50, 50, DEFAULT_CUSTOM_THEME.custom_theme_background_offset_x),
        custom_theme_background_offset_y: normalizeInteger(value.custom_theme_background_offset_y, -50, 50, DEFAULT_CUSTOM_THEME.custom_theme_background_offset_y),
    };
}

function normalizeInteger(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeRotation(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_CUSTOM_THEME.custom_theme_background_rotation;
    const normalized = ((Math.round(number / 90) * 90) % 360 + 360) % 360;
    return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
}

export function getCustomThemeBackgroundTransform(settings, width = window.innerWidth, height = window.innerHeight) {
    const rotation = settings.custom_theme_background_rotation;
    const rotatedQuarterTurn = rotation % 180 !== 0;
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    // Um quarto de volta troca a largura pela altura; compensamos para manter o quadro coberto.
    const rotationCoverScale = rotatedQuarterTurn
        ? Math.max(safeWidth / safeHeight, safeHeight / safeWidth)
        : 1;
    const offsetX = Math.max(-50, Math.min(50, Number(settings.custom_theme_background_offset_x) || 0));
    const offsetY = Math.max(-50, Math.min(50, Number(settings.custom_theme_background_offset_y) || 0));
    // Ao deslocar a imagem, aumentamos somente o necessário para não revelar bordas vazias.
    const panCoverScale = Math.max(1 + (2 * Math.abs(offsetX) / 100), 1 + (2 * Math.abs(offsetY) / 100));
    const zoom = (settings.custom_theme_background_zoom / 100) * rotationCoverScale * panCoverScale;
    const flipX = settings.custom_theme_background_flip_x ? -1 : 1;
    const flipY = settings.custom_theme_background_flip_y ? -1 : 1;
    // O translate vem primeiro na lista para deslocar a imagem em coordenadas do quadro,
    // independente da rotação/espelhamento. Offsets negativos mantêm a direção do arraste existente.
    return `translate(${-offsetX}%, ${-offsetY}%) scaleX(${flipX}) scaleY(${flipY}) rotate(${rotation}deg) scale(${zoom})`;
}

function applyBackgroundCropVariables(root, settings) {
    const customPosition = settings.custom_theme_background_position === "custom";
    // A posição é controlada por translate(), não por object-position: esta última não move
    // conteúdo quando a proporção da imagem coincide com a do quadro.
    root.style.setProperty("--custom-theme-background-object-position", "50% 50%");
    root.style.setProperty("--custom-theme-background-transform", customPosition
        ? getCustomThemeBackgroundTransform(settings)
        : "none");
}

function openDatabase() {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("Este navegador não oferece IndexedDB."));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) db.createObjectStore(ASSET_STORE_NAME);
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => reject(request.error || new Error("Não foi possível abrir o IndexedDB."));
        request.onblocked = () => reject(new Error("O armazenamento local está bloqueado por outra aba. Feche outras abas do site e tente novamente."));
    }).catch((error) => {
        databasePromise = null;
        throw error;
    });

    return databasePromise;
}

function readStoreValue(storeName, key) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error || new Error("Não foi possível ler o IndexedDB."));
        transaction.onabort = () => reject(transaction.error || new Error("A leitura do IndexedDB foi cancelada."));
    }));
}

function writeStoreValue(storeName, key, value) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(value, key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Não foi possível salvar no IndexedDB."));
        transaction.onabort = () => reject(transaction.error || new Error("O salvamento no IndexedDB foi cancelado."));
    }));
}

function deleteStoreValue(storeName, key) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Não foi possível remover os dados locais."));
        transaction.onabort = () => reject(transaction.error || new Error("A remoção local foi cancelada."));
    }));
}

async function readFromDatabase() {
    return readStoreValue(STORE_NAME, SETTINGS_KEY);
}

async function writeToDatabase(settings) {
    return writeStoreValue(STORE_NAME, SETTINGS_KEY, settings);
}

export async function getAnonymousCustomThemeBackgroundFile() {
    try {
        const asset = await readStoreValue(ASSET_STORE_NAME, BACKGROUND_ASSET_KEY);
        return asset instanceof Blob ? asset : null;
    } catch (error) {
        console.warn("Não foi possível recuperar a imagem de fundo do IndexedDB.", error);
        return null;
    }
}

export async function removeAnonymousCustomThemeBackgroundFile() {
    try {
        await deleteStoreValue(ASSET_STORE_NAME, BACKGROUND_ASSET_KEY);
    } catch (error) {
        console.warn("Não foi possível remover a imagem de fundo do IndexedDB.", error);
    }
    if (anonymousBackgroundObjectUrl) {
        URL.revokeObjectURL(anonymousBackgroundObjectUrl);
        anonymousBackgroundObjectUrl = "";
        anonymousBackgroundFingerprint = "";
    }
    if (resolvedBackgroundKey === "anonymous-upload") {
        resolvedBackgroundKey = "";
        resolvedBackgroundUrl = "";
        resolvedBackgroundExpiresAt = 0;
    }
}

export function getCachedCustomThemeSettings() {
    return { ...cachedSettings };
}

export async function readAnonymousCustomThemeSettings() {
    try {
        const saved = await readFromDatabase();
        cachedSettings = normalizeCustomThemeSettings(saved || DEFAULT_CUSTOM_THEME);
        return { ...cachedSettings };
    } catch (error) {
        try {
            const raw = window.localStorage.getItem(FALLBACK_KEY);
            cachedSettings = normalizeCustomThemeSettings(raw ? JSON.parse(raw) : DEFAULT_CUSTOM_THEME);
        } catch {
            cachedSettings = { ...DEFAULT_CUSTOM_THEME };
        }
        console.warn("Não foi possível ler o tema personalizado do IndexedDB; usando fallback local.", error);
        return { ...cachedSettings };
    }
}

export async function saveAnonymousCustomThemeSettings(value, { backgroundFile = null, clearBackground = false } = {}) {
    const settings = normalizeCustomThemeSettings(value);
    if (backgroundFile) {
        validateThemeBackgroundFile(backgroundFile);
        if (settings.custom_theme_background_type !== "image" || settings.custom_theme_background_source !== "upload") {
            throw new Error("Selecione Imagem e Enviar imagem do dispositivo antes de salvar o arquivo.");
        }
        // Arquivos de visitantes ficam no IndexedDB; nunca são enviados ao Supabase Storage.
        await writeStoreValue(ASSET_STORE_NAME, BACKGROUND_ASSET_KEY, backgroundFile).catch((error) => {
            throw new Error(`Não foi possível guardar a imagem neste navegador. ${error?.message || "Verifique o espaço e as permissões do navegador."}`);
        });
    }

    try {
        await writeToDatabase(settings);
        if (clearBackground || settings.custom_theme_background_source === "url") {
            await removeAnonymousCustomThemeBackgroundFile();
        }
        try { window.localStorage.removeItem(FALLBACK_KEY); } catch { /* ignore */ }
        cachedSettings = settings;
        return { settings: { ...settings }, storage: "indexeddb" };
    } catch (error) {
        // O fallback local é suficiente para preferências pequenas, mas nunca para um Blob.
        if (backgroundFile) {
            throw new Error("O navegador não conseguiu salvar a imagem no IndexedDB. A imagem não foi enviada para nenhum servidor.");
        }
        try {
            window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(settings));
            cachedSettings = settings;
            console.warn("IndexedDB indisponível; as configurações foram guardadas no fallback local.", error);
            return { settings: { ...settings }, storage: "localStorage-fallback" };
        } catch {
            throw new Error("Não foi possível guardar as personalizações neste navegador. Verifique as permissões de armazenamento.");
        }
    }
}

function safeCssImageUrl(value) {
    if (typeof value !== "string" || !value) return "none";
    let parsed;
    try { parsed = new URL(value); } catch { return "none"; }
    if (!["https:", "blob:"].includes(parsed.protocol)) return "none";
    const safeUrl = parsed.href.replace(/\\/g, "%5C").replace(/"/g, "%22").replace(/[\r\n]/g, "");
    return `url("${safeUrl}")`;
}

function safeImageElementUrl(value) {
    if (typeof value !== "string" || !value) return "";
    try {
        const parsed = new URL(value);
        if (!["https:", "blob:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
        return parsed.href;
    } catch {
        return "";
    }
}

function ensureBackgroundImageLayer() {
    if (!document.body) return null;
    let layer = document.getElementById("custom-theme-background-image-layer");
    if (layer) return layer;

    layer = document.createElement("div");
    layer.id = "custom-theme-background-image-layer";
    layer.className = "custom-theme-background-image-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.hidden = true;

    const image = document.createElement("img");
    image.className = "custom-theme-background-image";
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    layer.append(image);
    document.body.prepend(layer);
    return layer;
}

function setRootBackgroundImage(url) {
    const root = document.documentElement;
    if (!root) return;
    const safeUrl = safeImageElementUrl(url);
    root.style.setProperty("--custom-theme-background-image", safeCssImageUrl(safeUrl));

    const layer = ensureBackgroundImageLayer();
    if (!layer) return;
    const image = layer.querySelector("img");
    layer.hidden = !safeUrl || cachedSettings.custom_theme_background_type !== "image";
    layer.style.backgroundImage = "var(--custom-theme-gradient, linear-gradient(to right, #00E5FF, #16002B))";
    if (safeUrl) {
        if (image.getAttribute("src") !== safeUrl) image.src = safeUrl;
    } else {
        image.removeAttribute("src");
    }
}

function currentSettingsMatch(settings) {
    return cachedSettings.custom_theme_background_type === settings.custom_theme_background_type
        && cachedSettings.custom_theme_background_source === settings.custom_theme_background_source
        && cachedSettings.custom_theme_background_url === settings.custom_theme_background_url
        && cachedSettings.custom_theme_background_path === settings.custom_theme_background_path;
}

export function getResolvedCustomThemeBackgroundUrl() {
    return resolvedBackgroundUrl;
}

export function setCustomThemeBackgroundPreview(url) {
    setRootBackgroundImage(url);
}

export function applyCustomThemeSettings(value = {}) {
    cachedSettings = normalizeCustomThemeSettings(value);
    const root = document.documentElement;
    if (!root) return { ...cachedSettings };

    const {
        custom_theme_color_1: color1,
        custom_theme_color_2: color2,
        custom_theme_direction: direction,
        custom_theme_title_color: titleColor,
        custom_theme_text_color: textColor,
        custom_theme_interactive_text_color: interactiveTextColor,
        custom_theme_label_color: labelColor,
        custom_theme_card_bg_color: cardBgColor,
        custom_theme_menu_bg_color: menuBgColor,
        custom_theme_button_bg_color: buttonBgColor,
        custom_theme_input_bg_color: inputBgColor,
        custom_theme_hover_color: hoverColor,
    } = cachedSettings;
    const cssDirection = direction === "vertical" ? "to bottom" : "to right";
    const accentRgb = rgbFromHex(color2).join(", ");

    root.style.setProperty("--custom-theme-color-1", color1);
    root.style.setProperty("--custom-theme-color-2", color2);
    root.style.setProperty("--custom-theme-direction", cssDirection);
    root.style.setProperty("--custom-theme-gradient", `linear-gradient(${cssDirection}, ${color1}, ${color2})`);
    root.style.setProperty("--custom-theme-accent-rgb", accentRgb);
    root.style.setProperty("--custom-theme-accent-contrast", contrastingText(rgbFromHex(color2)));
    root.style.setProperty("--custom-theme-title-color", titleColor);
    root.style.setProperty("--custom-theme-text-color", textColor);
    root.style.setProperty("--custom-theme-interactive-text-color", interactiveTextColor);
    root.style.setProperty("--custom-theme-label-color", labelColor);
    root.style.setProperty("--custom-theme-card-bg-color", cardBgColor);
    root.style.setProperty("--custom-theme-menu-bg-color", menuBgColor);
    root.style.setProperty("--custom-theme-button-bg-color", buttonBgColor);
    root.style.setProperty("--custom-theme-input-bg-color", inputBgColor);
    root.style.setProperty("--custom-theme-hover-color", hoverColor);
    root.style.setProperty("--custom-theme-background-dim", String(cachedSettings.custom_theme_background_dim));
    root.style.setProperty("--custom-theme-background-brightness", String(1 - (cachedSettings.custom_theme_background_dim / 100)));
    root.style.setProperty("--custom-theme-background-blur", `${cachedSettings.custom_theme_background_blur}px`);
    const backgroundPosition = cachedSettings.custom_theme_background_position;
    root.style.setProperty("--custom-theme-background-fit", backgroundPosition === "center"
        ? "none"
        : backgroundPosition === "custom" ? "cover" : backgroundPosition);
    applyBackgroundCropVariables(root, cachedSettings);

    let imageUrl = "";
    if (cachedSettings.custom_theme_background_type === "image") {
        if (cachedSettings.custom_theme_background_source === "url") {
            imageUrl = cachedSettings.custom_theme_background_url;
        } else if (cachedSettings.custom_theme_background_path
            && resolvedBackgroundKey === `storage:${cachedSettings.custom_theme_background_path}`
            && Date.now() < resolvedBackgroundExpiresAt) {
            imageUrl = resolvedBackgroundUrl;
        } else if (!cachedSettings.custom_theme_background_path && resolvedBackgroundKey === "anonymous-upload") {
            imageUrl = resolvedBackgroundUrl;
        }
    }
    setRootBackgroundImage(imageUrl);
    return { ...cachedSettings };
}

if (typeof window !== "undefined") {
    window.addEventListener("resize", () => {
        if (cachedSettings.custom_theme_background_position !== "custom") return;
        const root = document.documentElement;
        if (root) root.style.setProperty("--custom-theme-background-transform", getCustomThemeBackgroundTransform(cachedSettings));
    }, { passive: true });
}

export async function resolveCustomThemeBackground(value = {}) {
    const settings = normalizeCustomThemeSettings(value);
    const requestId = ++customThemeBackgroundRequest;

    if (settings.custom_theme_background_type !== "image") {
        if (currentSettingsMatch(settings)) setRootBackgroundImage("");
        return null;
    }

    if (settings.custom_theme_background_source === "url") {
        const url = normalizeBackgroundImageUrl(settings.custom_theme_background_url);
        if (currentSettingsMatch(settings)) setRootBackgroundImage(url);
        resolvedBackgroundKey = url ? `url:${url}` : "";
        resolvedBackgroundUrl = url;
        resolvedBackgroundExpiresAt = Number.MAX_SAFE_INTEGER;
        return url || null;
    }

    if (settings.custom_theme_background_path) {
        const key = `storage:${settings.custom_theme_background_path}`;
        if (resolvedBackgroundKey === key && resolvedBackgroundUrl && Date.now() < resolvedBackgroundExpiresAt - 60_000) {
            if (currentSettingsMatch(settings)) setRootBackgroundImage(resolvedBackgroundUrl);
            return resolvedBackgroundUrl;
        }

        try {
            const { data, error } = await supabase.storage
                .from(THEME_BACKGROUND_BUCKET)
                .createSignedUrl(settings.custom_theme_background_path, 60 * 60);
            if (error) throw error;
            const signedUrl = normalizeBackgroundImageUrl(data?.signedUrl || "");
            if (!signedUrl) throw new Error("O Storage não retornou uma URL HTTPS válida para a imagem.");
            if (requestId !== customThemeBackgroundRequest) return null;
            resolvedBackgroundKey = key;
            resolvedBackgroundUrl = signedUrl;
            resolvedBackgroundExpiresAt = Date.now() + 60 * 60 * 1000;
            if (currentSettingsMatch(settings)) setRootBackgroundImage(signedUrl);
            return signedUrl;
        } catch (error) {
            console.warn("Não foi possível carregar a imagem de fundo da conta. O gradiente continuará disponível.", error);
            if (currentSettingsMatch(settings)) setRootBackgroundImage("");
            return null;
        }
    }

    // Caminho de visitante anônimo: o arquivo permanece local no IndexedDB.
    try {
        const file = await getAnonymousCustomThemeBackgroundFile();
        if (!file) {
            if (currentSettingsMatch(settings)) setRootBackgroundImage("");
            return null;
        }
        const fingerprint = `${file.name || "blob"}|${file.size}|${file.type}|${file.lastModified || 0}`;
        if (!anonymousBackgroundObjectUrl || fingerprint !== anonymousBackgroundFingerprint) {
            if (anonymousBackgroundObjectUrl) URL.revokeObjectURL(anonymousBackgroundObjectUrl);
            anonymousBackgroundObjectUrl = URL.createObjectURL(file);
            anonymousBackgroundFingerprint = fingerprint;
        }
        if (requestId !== customThemeBackgroundRequest) return null;
        resolvedBackgroundKey = "anonymous-upload";
        resolvedBackgroundUrl = anonymousBackgroundObjectUrl;
        resolvedBackgroundExpiresAt = Number.MAX_SAFE_INTEGER;
        if (currentSettingsMatch(settings)) setRootBackgroundImage(anonymousBackgroundObjectUrl);
        return anonymousBackgroundObjectUrl;
    } catch (error) {
        console.warn("Não foi possível aplicar a imagem de fundo local. O gradiente continuará disponível.", error);
        if (currentSettingsMatch(settings)) setRootBackgroundImage("");
        return null;
    }
}

function rgbFromHex(hex) {
    const safe = normalizeHexColor(hex, "#00E5FF").slice(1);
    return [0, 2, 4].map((index) => Number.parseInt(safe.slice(index, index + 2), 16));
}

function contrastingText(rgb) {
    const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance > 0.52 ? "#001115" : "#FFFFFF";
}
