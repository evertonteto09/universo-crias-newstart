import {
    applyCustomThemeSettings,
    getCachedCustomThemeSettings,
    normalizeCustomThemeSettings,
    readAnonymousCustomThemeSettings,
    getResolvedCustomThemeBackgroundUrl,
    getCustomThemeBackgroundTransform,
    normalizeBackgroundImageUrl,
    resolveCustomThemeBackground,
    setCustomThemeBackgroundPreview,
    validateThemeBackgroundFile,
} from "../services/custom-theme.service.js?v=20261028-theme-label-link-colors-1";
import {
    saveCustomThemePreferences,
    saveUserPreferencePatch,
    syncUserPreferences,
} from "../services/user-preferences.service.js?v=20261028-crias-presence-images-1";

const THEMES = ["neblina", "preto", "branco", "vermelho", "amarelo", "roxo", "ciano", "personalizado"];
const PRESET_THEMES = THEMES.filter((theme) => theme !== "personalizado");
const STORAGE_KEY = "hdc-theme";
const THEME_LABELS = {
    neblina: "Neblina",
    preto: "Preto",
    branco: "Branco",
    vermelho: "Vermelho",
    amarelo: "Amarelo",
    roxo: "Roxo",
    ciano: "Preto-ciano",
    personalizado: "Personalizado",
};

let refreshThemeLabel = () => {};
let editorDialog = null;
let editorState = null;

function themeLabel(theme) {
    return THEME_LABELS[theme] || THEME_LABELS.neblina;
}

function currentTheme() {
    const theme = document.documentElement.dataset.theme;
    return THEMES.includes(theme) ? theme : "neblina";
}

function setThemeLocally(theme) {
    if (!THEMES.includes(theme)) return;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (error) {
        console.warn("Não foi possível guardar o tema no navegador:", error);
    }
    refreshThemeLabel();
}

function showEditorMessage(message, kind = "") {
    if (!editorDialog) return;
    const status = editorDialog.querySelector("#custom-theme-status");
    status.textContent = message;
    status.dataset.kind = kind;
}

function fieldsToSettings() {
    if (!editorDialog) return null;
    if (editorState) editorState.validationMessage = "";
    const fields = [
        ["custom_theme_color_1", "#custom-theme-color-1-hex"],
        ["custom_theme_color_2", "#custom-theme-color-2-hex"],
        ["custom_theme_title_color", "#custom-theme-title-color-hex"],
        ["custom_theme_text_color", "#custom-theme-text-color-hex"],
        ["custom_theme_interactive_text_color", "#custom-theme-interactive-text-color-hex"],
        ["custom_theme_label_color", "#custom-theme-label-color-hex"],
        ["custom_theme_card_bg_color", "#custom-theme-card-bg-color-hex"],
        ["custom_theme_menu_bg_color", "#custom-theme-menu-bg-color-hex"],
        ["custom_theme_button_bg_color", "#custom-theme-button-bg-color-hex"],
        ["custom_theme_input_bg_color", "#custom-theme-input-bg-color-hex"],
        ["custom_theme_hover_color", "#custom-theme-hover-color-hex"],
    ];
    const values = {};
    const validHex = /^#?[\da-fA-F]{6}$/;
    let allValid = true;

    for (const [key, selector] of fields) {
        const input = editorDialog.querySelector(selector);
        const raw = input.value.trim();
        const valid = validHex.test(raw);
        input.setAttribute("aria-invalid", String(!valid));
        if (!valid) {
            allValid = false;
            continue;
        }
        values[key] = `#${raw.replace(/^#/, "").toUpperCase()}`;
    }

    if (!allValid) {
        if (editorState) editorState.validationMessage = "Confira os onze códigos de cor. Use seis dígitos hexadecimais, como #00E5FF.";
        return null;
    }

    values.custom_theme_direction = editorDialog.querySelector("#custom-theme-direction").value;
    values.custom_theme_background_type = editorDialog.querySelector("#custom-theme-background-type").value;
    values.custom_theme_background_source = editorDialog.querySelector("#custom-theme-background-source").value;
    values.custom_theme_background_dim = Number(editorDialog.querySelector("#custom-theme-background-dim").value);
    values.custom_theme_background_blur = Number(editorDialog.querySelector("#custom-theme-background-blur").value);
    values.custom_theme_background_position = editorDialog.querySelector("#custom-theme-background-position").value;
    values.custom_theme_background_zoom = Number(editorDialog.querySelector("#custom-theme-background-zoom").value);
    values.custom_theme_background_rotation = Number(editorDialog.querySelector("#custom-theme-background-rotation").value);
    values.custom_theme_background_flip_x = editorDialog.querySelector("#custom-theme-background-flip-x-value").value === "true";
    values.custom_theme_background_flip_y = editorDialog.querySelector("#custom-theme-background-flip-y-value").value === "true";
    values.custom_theme_background_offset_x = Number(editorDialog.querySelector("#custom-theme-background-offset-x").value);
    values.custom_theme_background_offset_y = Number(editorDialog.querySelector("#custom-theme-background-offset-y").value);
    const rawBackgroundUrl = editorDialog.querySelector("#custom-theme-background-url").value.trim();
    const previous = normalizeCustomThemeSettings(editorState?.draftSettings || getCachedCustomThemeSettings());

    if (values.custom_theme_background_source === "url") {
        if (values.custom_theme_background_type === "image") {
            const safeUrl = normalizeBackgroundImageUrl(rawBackgroundUrl);
            if (!safeUrl) {
                if (editorState) editorState.validationMessage = "Informe um endereço HTTPS válido para a imagem de fundo, ou escolha enviar uma imagem do dispositivo.";
                return null;
            }
            values.custom_theme_background_url = safeUrl;
        } else {
            values.custom_theme_background_url = normalizeBackgroundImageUrl(rawBackgroundUrl);
        }
        values.custom_theme_background_path = "";
    } else {
        values.custom_theme_background_url = "";
        values.custom_theme_background_path = previous.custom_theme_background_path || "";
    }

    return normalizeCustomThemeSettings(values);
}

function syncBackgroundControls() {
    const type = editorDialog.querySelector("#custom-theme-background-type").value;
    const source = editorDialog.querySelector("#custom-theme-background-source").value;
    const imageControls = editorDialog.querySelector("#custom-theme-background-image-controls");
    const urlControl = editorDialog.querySelector("#custom-theme-background-url-control");
    const fileControl = editorDialog.querySelector("#custom-theme-background-file-control");
    const adjustments = editorDialog.querySelector("#custom-theme-background-adjustments");
    const cropControls = editorDialog.querySelector("#custom-theme-background-custom-position-controls");
    const position = editorDialog.querySelector("#custom-theme-background-position").value;
    imageControls.hidden = type !== "image";
    urlControl.hidden = type !== "image" || source !== "url";
    fileControl.hidden = type !== "image" || source !== "upload";
    if (adjustments) adjustments.hidden = type !== "image";
    if (cropControls) cropControls.hidden = type !== "image" || position !== "custom";
    const sourceHelp = editorDialog.querySelector("#custom-theme-background-storage-help");
    if (sourceHelp) {
        sourceHelp.textContent = source === "upload"
            ? "Com login, a imagem fica no Storage privado da sua conta. Sem login, o arquivo fica somente neste navegador (IndexedDB). Máximo: 5 MB."
            : "Use um link HTTPS direto para uma imagem. O link é guardado nas suas preferências; a imagem continua hospedada no site de origem.";
    }
}

function loadFields(settings) {
    if (!editorDialog) return;
    const normalized = normalizeCustomThemeSettings(settings);
    if (editorState) editorState.draftSettings = { ...normalized };
    editorDialog.querySelector("#custom-theme-color-1-picker").value = normalized.custom_theme_color_1;
    editorDialog.querySelector("#custom-theme-color-1-hex").value = normalized.custom_theme_color_1;
    editorDialog.querySelector("#custom-theme-color-2-picker").value = normalized.custom_theme_color_2;
    editorDialog.querySelector("#custom-theme-color-2-hex").value = normalized.custom_theme_color_2;
    editorDialog.querySelector("#custom-theme-direction").value = normalized.custom_theme_direction;
    editorDialog.querySelector("#custom-theme-title-color-picker").value = normalized.custom_theme_title_color;
    editorDialog.querySelector("#custom-theme-title-color-hex").value = normalized.custom_theme_title_color;
    editorDialog.querySelector("#custom-theme-text-color-picker").value = normalized.custom_theme_text_color;
    editorDialog.querySelector("#custom-theme-text-color-hex").value = normalized.custom_theme_text_color;
    editorDialog.querySelector("#custom-theme-interactive-text-color-picker").value = normalized.custom_theme_interactive_text_color;
    editorDialog.querySelector("#custom-theme-interactive-text-color-hex").value = normalized.custom_theme_interactive_text_color;
    editorDialog.querySelector("#custom-theme-label-color-picker").value = normalized.custom_theme_label_color;
    editorDialog.querySelector("#custom-theme-label-color-hex").value = normalized.custom_theme_label_color;
    editorDialog.querySelector("#custom-theme-card-bg-color-picker").value = normalized.custom_theme_card_bg_color;
    editorDialog.querySelector("#custom-theme-card-bg-color-hex").value = normalized.custom_theme_card_bg_color;
    editorDialog.querySelector("#custom-theme-menu-bg-color-picker").value = normalized.custom_theme_menu_bg_color;
    editorDialog.querySelector("#custom-theme-menu-bg-color-hex").value = normalized.custom_theme_menu_bg_color;
    editorDialog.querySelector("#custom-theme-button-bg-color-picker").value = normalized.custom_theme_button_bg_color;
    editorDialog.querySelector("#custom-theme-button-bg-color-hex").value = normalized.custom_theme_button_bg_color;
    editorDialog.querySelector("#custom-theme-input-bg-color-picker").value = normalized.custom_theme_input_bg_color;
    editorDialog.querySelector("#custom-theme-input-bg-color-hex").value = normalized.custom_theme_input_bg_color;
    editorDialog.querySelector("#custom-theme-hover-color-picker").value = normalized.custom_theme_hover_color;
    editorDialog.querySelector("#custom-theme-hover-color-hex").value = normalized.custom_theme_hover_color;
    editorDialog.querySelector("#custom-theme-background-type").value = normalized.custom_theme_background_type;
    editorDialog.querySelector("#custom-theme-background-source").value = normalized.custom_theme_background_source;
    editorDialog.querySelector("#custom-theme-background-url").value = normalized.custom_theme_background_url;
    editorDialog.querySelector("#custom-theme-background-dim").value = String(normalized.custom_theme_background_dim);
    editorDialog.querySelector("#custom-theme-background-dim-value").textContent = `${normalized.custom_theme_background_dim}%`;
    editorDialog.querySelector("#custom-theme-background-blur").value = String(normalized.custom_theme_background_blur);
    editorDialog.querySelector("#custom-theme-background-blur-value").textContent = `${normalized.custom_theme_background_blur} px`;
    editorDialog.querySelector("#custom-theme-background-position").value = normalized.custom_theme_background_position;
    editorDialog.querySelector("#custom-theme-background-zoom").value = String(normalized.custom_theme_background_zoom);
    editorDialog.querySelector("#custom-theme-background-zoom-value").textContent = `${normalized.custom_theme_background_zoom}%`;
    editorDialog.querySelector("#custom-theme-background-rotation").value = String(normalized.custom_theme_background_rotation);
    editorDialog.querySelector("#custom-theme-background-rotation-value").textContent = `${normalized.custom_theme_background_rotation}°`;
    editorDialog.querySelector("#custom-theme-background-flip-x-value").value = String(normalized.custom_theme_background_flip_x);
    editorDialog.querySelector("#custom-theme-background-flip-y-value").value = String(normalized.custom_theme_background_flip_y);
    editorDialog.querySelector("#custom-theme-background-offset-x").value = String(normalized.custom_theme_background_offset_x);
    editorDialog.querySelector("#custom-theme-background-offset-y").value = String(normalized.custom_theme_background_offset_y);
    editorDialog.querySelector("#custom-theme-background-flip-x").setAttribute("aria-pressed", String(normalized.custom_theme_background_flip_x));
    editorDialog.querySelector("#custom-theme-background-flip-y").setAttribute("aria-pressed", String(normalized.custom_theme_background_flip_y));
    editorDialog.querySelector("#custom-theme-background-file").value = "";
    editorDialog.querySelector("#custom-theme-background-file-name").textContent = normalized.custom_theme_background_source === "upload" && normalized.custom_theme_background_path
        ? "Já existe uma imagem salva na sua conta. Selecione outro arquivo para substituí-la."
        : "Nenhum arquivo novo selecionado.";
    if (editorState) {
        editorState.pendingBackgroundFile = null;
        if (editorState.pendingBackgroundObjectUrl) URL.revokeObjectURL(editorState.pendingBackgroundObjectUrl);
        editorState.pendingBackgroundObjectUrl = "";
        editorState.clearBackgroundRequested = false;
    }
    for (const selector of [
        "#custom-theme-color-1-hex",
        "#custom-theme-color-2-hex",
        "#custom-theme-title-color-hex",
        "#custom-theme-text-color-hex",
        "#custom-theme-interactive-text-color-hex",
        "#custom-theme-label-color-hex",
        "#custom-theme-card-bg-color-hex",
        "#custom-theme-menu-bg-color-hex",
        "#custom-theme-button-bg-color-hex",
        "#custom-theme-input-bg-color-hex",
        "#custom-theme-hover-color-hex",
    ]) editorDialog.querySelector(selector).setAttribute("aria-invalid", "false");
    syncBackgroundControls();
    updatePreview({ markDirty: false });
}

function cssImageLayer(url) {
    if (typeof url !== "string" || !url) return "";
    try {
        const parsed = new URL(url);
        if (!["https:", "blob:"].includes(parsed.protocol)) return "";
        return `url("${parsed.href.replace(/"/g, "%22").replace(/[\r\n]/g, "")}")`;
    } catch {
        return "";
    }
}

function getPreviewBackgroundUrl(settings) {
    if (settings.custom_theme_background_type !== "image") return "";
    if (settings.custom_theme_background_source === "url") return normalizeBackgroundImageUrl(settings.custom_theme_background_url);
    if (editorState?.pendingBackgroundObjectUrl) return editorState.pendingBackgroundObjectUrl;
    return getResolvedCustomThemeBackgroundUrl();
}

function updatePreview({ markDirty = true } = {}) {
    const settings = fieldsToSettings();
    const saveButton = editorDialog.querySelector("#custom-theme-save");
    const preview = editorDialog.querySelector("#custom-theme-preview");
    if (!settings) {
        saveButton.disabled = true;
        if (markDirty && editorState) editorState.hasUnsavedChanges = true;
        showEditorMessage(editorState?.validationMessage || "Confira os códigos hexadecimais antes de salvar.", "error");
        return;
    }

    saveButton.disabled = false;
    if (editorState) editorState.draftSettings = { ...settings };
    applyCustomThemeSettings(settings);
    document.documentElement.dataset.theme = "personalizado";
    if (settings.custom_theme_background_type === "image" && editorState?.pendingBackgroundObjectUrl) {
        setCustomThemeBackgroundPreview(editorState.pendingBackgroundObjectUrl);
    }

    const gradient = `linear-gradient(${settings.custom_theme_direction === "vertical" ? "to bottom" : "to right"}, ${settings.custom_theme_color_1}, ${settings.custom_theme_color_2})`;
    const backgroundUrl = getPreviewBackgroundUrl(settings);
    const previewBackground = preview.querySelector(".custom-theme-preview-background");
    const previewBackgroundImage = preview.querySelector("#custom-theme-preview-background-image");
    const cropImage = editorDialog.querySelector("#custom-theme-background-crop-image");
    const cropPlaceholder = editorDialog.querySelector("#custom-theme-background-crop-placeholder");
    const cropViewport = editorDialog.querySelector("#custom-theme-background-crop-viewport");
    preview.style.backgroundImage = gradient;
    if (previewBackground) previewBackground.style.backgroundImage = gradient;
    const hasPreviewImage = settings.custom_theme_background_type === "image" && Boolean(backgroundUrl);
    const brightness = 1 - (settings.custom_theme_background_dim / 100);
    const fit = settings.custom_theme_background_position === "center"
        ? "none"
        : settings.custom_theme_background_position === "custom" ? "cover" : settings.custom_theme_background_position;
    const objectPosition = "50% 50%";
    const applyCropStyle = (image) => {
        if (!image) return;
        image.style.objectFit = fit;
        image.style.objectPosition = objectPosition;
        image.style.filter = `brightness(${brightness}) blur(${settings.custom_theme_background_blur}px)`;
        if (settings.custom_theme_background_position === "custom") {
            const box = image.parentElement?.getBoundingClientRect();
            const width = box?.width || image.clientWidth || window.innerWidth || 1280;
            const height = box?.height || image.clientHeight || window.innerHeight || 720;
            image.style.transform = getCustomThemeBackgroundTransform(settings, width, height);
            image.style.transformOrigin = "center center";
        } else {
            image.style.transform = "none";
        }
    };
    if (previewBackgroundImage) {
        previewBackgroundImage.hidden = !hasPreviewImage;
        if (hasPreviewImage) {
            if (previewBackgroundImage.getAttribute("src") !== backgroundUrl) previewBackgroundImage.src = backgroundUrl;
            applyCropStyle(previewBackgroundImage);
        } else {
            previewBackgroundImage.removeAttribute("src");
            previewBackgroundImage.style.filter = "none";
            previewBackgroundImage.style.transform = "none";
        }
    }
    if (cropImage) {
        cropImage.hidden = !hasPreviewImage;
        if (hasPreviewImage) {
            if (cropImage.getAttribute("src") !== backgroundUrl) cropImage.src = backgroundUrl;
            applyCropStyle(cropImage);
        } else {
            cropImage.removeAttribute("src");
            cropImage.style.filter = "none";
            cropImage.style.transform = "none";
        }
    }
    if (cropPlaceholder) cropPlaceholder.hidden = hasPreviewImage;
    if (cropViewport) cropViewport.setAttribute("aria-disabled", String(!hasPreviewImage));

    const previewTitle = preview.querySelector(".custom-theme-preview-title");
    const previewText = preview.querySelector(".custom-theme-preview-text");
    const previewButton = preview.querySelector(".custom-theme-preview-button");
    const previewCard = preview.querySelector(".custom-theme-preview-sample-card");
    const previewMenu = preview.querySelector(".custom-theme-preview-menu");
    if (previewTitle) previewTitle.style.color = settings.custom_theme_title_color;
    const previewLabel = preview.querySelector(".custom-theme-preview-label");
    if (previewLabel) previewLabel.style.color = settings.custom_theme_label_color;
    if (previewText) previewText.style.color = settings.custom_theme_text_color;
    if (previewCard) previewCard.style.backgroundColor = settings.custom_theme_card_bg_color;
    if (previewMenu) {
        previewMenu.style.backgroundColor = settings.custom_theme_menu_bg_color;
        previewMenu.style.color = settings.custom_theme_text_color;
    }
    if (previewButton) {
        previewButton.style.color = settings.custom_theme_interactive_text_color;
        previewButton.style.backgroundColor = settings.custom_theme_button_bg_color;
    }
    const previewInput = preview.querySelector(".custom-theme-preview-input");
    if (previewInput) {
        previewInput.style.backgroundColor = settings.custom_theme_input_bg_color;
        previewInput.style.color = settings.custom_theme_interactive_text_color;
    }
    refreshThemeLabel();
    if (markDirty && editorState) editorState.hasUnsavedChanges = true;
    showEditorMessage("Prévia atualizada. Salve para aplicar esta combinação.");
}

function ensureEditorDialog() {
    if (editorDialog) return editorDialog;

    editorDialog = document.createElement("dialog");
    editorDialog.className = "custom-theme-dialog";
    editorDialog.id = "custom-theme-dialog";
    editorDialog.setAttribute("aria-labelledby", "custom-theme-title");
    editorDialog.innerHTML = `
        <div class="custom-theme-dialog-inner">
            <div class="custom-theme-dialog-heading">
                <div>
                    <span class="eyebrow">APARÊNCIA</span>
                    <h2 id="custom-theme-title">Personalize seu tema</h2>
                    <p>Personalize o gradiente, os textos, os componentes e a cor dos realces ao passar o mouse. A prévia muda enquanto você edita.</p>
                </div>
                <button type="button" class="custom-theme-close" id="custom-theme-close" aria-label="Fechar editor">×</button>
            </div>

            <div class="custom-theme-colors">
                <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-color-1-title">
                    <div class="custom-theme-color-title" id="custom-theme-color-1-title">Primeira cor</div>
                    <div class="custom-theme-color-inputs">
                        <input type="color" id="custom-theme-color-1-picker" value="#00E5FF" aria-label="Selecionar primeira cor">
                        <label class="custom-theme-hex-label" for="custom-theme-color-1-hex">
                            <span>Código hexadecimal</span>
                            <input type="text" id="custom-theme-color-1-hex" value="#00E5FF" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da primeira cor">
                        </label>
                    </div>
                </div>

                <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-color-2-title">
                    <div class="custom-theme-color-title" id="custom-theme-color-2-title">Segunda cor</div>
                    <div class="custom-theme-color-inputs">
                        <input type="color" id="custom-theme-color-2-picker" value="#16002B" aria-label="Selecionar segunda cor">
                        <label class="custom-theme-hex-label" for="custom-theme-color-2-hex">
                            <span>Código hexadecimal</span>
                            <input type="text" id="custom-theme-color-2-hex" value="#16002B" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da segunda cor">
                        </label>
                    </div>
                </div>
            </div>

            <label class="custom-theme-direction-label" for="custom-theme-direction">
                <span><strong>Direção do gradiente</strong><small>Escolha como as duas cores se misturam.</small></span>
                <select id="custom-theme-direction">
                    <option value="horizontal">Horizontal — esquerda para direita</option>
                    <option value="vertical">Vertical — cima para baixo</option>
                </select>
            </label>

            <section class="custom-theme-typography" aria-labelledby="custom-theme-background-title">
                <div class="custom-theme-section-heading">
                    <h3 id="custom-theme-background-title">Fundo do site</h3>
                    <p>Use o gradiente ou escolha uma imagem por link HTTPS ou upload. Imagens enviadas por visitantes ficam neste navegador; usuários autenticados usam o Storage privado da própria conta.</p>
                </div>
                <label class="custom-theme-direction-label" for="custom-theme-background-type">
                    <span><strong>Tipo de fundo</strong><small>Escolha entre suas cores ou uma imagem.</small></span>
                    <select id="custom-theme-background-type">
                        <option value="gradient">Gradiente personalizado</option>
                        <option value="image">Imagem de fundo</option>
                    </select>
                </label>
                <div id="custom-theme-background-image-controls" class="custom-theme-background-controls" hidden>
                    <label class="custom-theme-direction-label" for="custom-theme-background-source">
                        <span><strong>Origem da imagem</strong><small>Escolha um link ou envie um arquivo.</small></span>
                        <select id="custom-theme-background-source">
                            <option value="url">Link de uma imagem na internet</option>
                            <option value="upload">Enviar imagem do dispositivo</option>
                        </select>
                    </label>
                    <div id="custom-theme-background-url-control" class="custom-theme-background-control">
                        <label class="custom-theme-background-label" for="custom-theme-background-url">Link direto da imagem (HTTPS)</label>
                        <input id="custom-theme-background-url" type="url" inputmode="url" placeholder="https://exemplo.com/meu-fundo.webp" autocomplete="url" spellcheck="false">
                        <small>O endereço precisa apontar para uma imagem que possa ser carregada pelo navegador.</small>
                    </div>
                    <div id="custom-theme-background-file-control" class="custom-theme-background-control" hidden>
                        <label class="custom-theme-background-label" for="custom-theme-background-file">Escolher imagem</label>
                        <input id="custom-theme-background-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif">
                        <small id="custom-theme-background-file-name">Nenhum arquivo novo selecionado.</small>
                        <small>Formatos permitidos: JPEG, PNG, WebP, AVIF ou GIF. Tamanho máximo: 5 MB.</small>
                    </div>
                    <p id="custom-theme-background-storage-help" class="custom-theme-background-help"></p>
                    <div id="custom-theme-background-adjustments" class="custom-theme-background-adjustments" hidden>
                        <div class="custom-theme-section-heading">
                            <h4>Ajustes da imagem</h4>
                            <p>Personalize a leitura e a forma como a imagem ocupa o fundo. Esses ajustes não alteram o arquivo original.</p>
                        </div>
                        <label class="custom-theme-range-control" for="custom-theme-background-dim">
                            <span><strong>Escurecimento</strong><output id="custom-theme-background-dim-value" for="custom-theme-background-dim">0%</output></span>
                            <input id="custom-theme-background-dim" type="range" min="0" max="80" step="5" value="0">
                            <small>Escurece a imagem para destacar textos e cartões.</small>
                        </label>
                        <label class="custom-theme-range-control" for="custom-theme-background-blur">
                            <span><strong>Desfoque</strong><output id="custom-theme-background-blur-value" for="custom-theme-background-blur">0 px</output></span>
                            <input id="custom-theme-background-blur" type="range" min="0" max="20" step="1" value="0">
                            <small>Aplica um desfoque somente na imagem de fundo.</small>
                        </label>
                        <label class="custom-theme-direction-label" for="custom-theme-background-position">
                            <span><strong>Posicionamento</strong><small>Escolha como a imagem ocupa o fundo do site.</small></span>
                            <select id="custom-theme-background-position">
                                <option value="center">Centralizar — tamanho original</option>
                                <option value="contain">Ajustar à tela — mostrar a imagem inteira</option>
                                <option value="cover">Preencher o espaço — pode cortar as bordas</option>
                                <option value="custom">Personalizado — escolher recorte</option>
                            </select>
                        </label>
                        <div id="custom-theme-background-custom-position-controls" class="custom-theme-crop-controls" hidden>
                            <div class="custom-theme-section-heading">
                                <h4>Enquadramento personalizado</h4>
                                <p>Arraste a imagem dentro do quadro para escolher a parte visível. Use zoom, rotação e espelhamento para ajustar como no editor de imagem do Discord.</p>
                            </div>
                            <div id="custom-theme-background-crop-viewport" class="custom-theme-crop-viewport" role="application" tabindex="0" aria-label="Arraste a imagem para ajustar o enquadramento">
                                <img id="custom-theme-background-crop-image" alt="" draggable="false" hidden>
                                <div class="custom-theme-crop-grid" aria-hidden="true"><span></span><span></span></div>
                                <div id="custom-theme-background-crop-placeholder" class="custom-theme-crop-placeholder">Escolha uma imagem para configurar o recorte.</div>
                            </div>
                            <small class="custom-theme-crop-help">Dica: arraste com o mouse ou com o dedo. A imagem original não será alterada; somente o enquadramento salvo será aplicado.</small>
                            <label class="custom-theme-range-control" for="custom-theme-background-zoom">
                                <span><strong>Zoom</strong><output id="custom-theme-background-zoom-value" for="custom-theme-background-zoom">100%</output></span>
                                <input id="custom-theme-background-zoom" type="range" min="100" max="300" step="5" value="100">
                            </label>
                            <div class="custom-theme-crop-rotation-row">
                                <span><strong>Rotação</strong><output id="custom-theme-background-rotation-value">0°</output></span>
                                <div class="custom-theme-crop-actions">
                                    <button type="button" class="secondary-button" id="custom-theme-background-rotate-left" aria-label="Girar imagem 90 graus para a esquerda">↶ Girar −90°</button>
                                    <button type="button" class="secondary-button" id="custom-theme-background-rotate-right" aria-label="Girar imagem 90 graus para a direita">↷ Girar +90°</button>
                                </div>
                            </div>
                            <div class="custom-theme-crop-actions custom-theme-crop-flips">
                                <button type="button" class="secondary-button" id="custom-theme-background-flip-x" aria-pressed="false">⇋ Inverter horizontalmente</button>
                                <button type="button" class="secondary-button" id="custom-theme-background-flip-y" aria-pressed="false">⇵ Inverter verticalmente</button>
                                <button type="button" class="secondary-button" id="custom-theme-background-crop-reset">Redefinir recorte</button>
                            </div>
                            <input type="hidden" id="custom-theme-background-rotation" value="0">
                            <input type="hidden" id="custom-theme-background-flip-x-value" value="false">
                            <input type="hidden" id="custom-theme-background-flip-y-value" value="false">
                            <input type="hidden" id="custom-theme-background-offset-x" value="0">
                            <input type="hidden" id="custom-theme-background-offset-y" value="0">
                        </div>
                    </div>
                    <button type="button" id="custom-theme-background-clear" class="secondary-button custom-theme-background-clear">Remover imagem salva e voltar ao gradiente</button>
                </div>
            </section>

            <section class="custom-theme-typography" aria-labelledby="custom-theme-typography-title">
                <div class="custom-theme-section-heading">
                    <h3 id="custom-theme-typography-title">Cores dos textos</h3>
                    <p>Escolha cores para títulos, textos gerais, elementos interativos e rótulos de seção, como BIBLIOTECA e OBRA.</p>
                </div>
                <div class="custom-theme-colors">
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-title-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-title-color-label">Cor dos títulos</div>
                        <p class="custom-theme-color-help">Títulos de páginas, histórias, episódios e seções.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-title-color-picker" value="#F4FBFF" aria-label="Selecionar cor dos títulos">
                            <label class="custom-theme-hex-label" for="custom-theme-title-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-title-color-hex" value="#F4FBFF" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da cor dos títulos">
                            </label>
                        </div>
                    </div>

                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-text-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-text-color-label">Cor do texto geral</div>
                        <p class="custom-theme-color-help">Descrições, conteúdo das histórias e textos informativos de cartões e menus.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-text-color-picker" value="#F4FBFF" aria-label="Selecionar cor do texto geral">
                            <label class="custom-theme-hex-label" for="custom-theme-text-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-text-color-hex" value="#F4FBFF" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da cor do texto geral">
                            </label>
                        </div>
                    </div>

                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-interactive-text-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-interactive-text-color-label">Cor do texto interativo</div>
                        <p class="custom-theme-color-help">Texto dos botões e conteúdo dos campos de escrita, pesquisa e formulários.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-interactive-text-color-picker" value="#F4FBFF" aria-label="Selecionar cor do texto interativo">
                            <label class="custom-theme-hex-label" for="custom-theme-interactive-text-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-interactive-text-color-hex" value="#F4FBFF" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da cor do texto interativo">
                            </label>
                        </div>
                    </div>
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-label-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-label-color-label">Cor dos rótulos</div>
                        <p class="custom-theme-color-help">Pequenos rótulos de seção, como BIBLIOTECA, PUBLICADAS, OBRA, EPISÓDIOS e FEEDBACK.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-label-color-picker" value="#A2BEC5" aria-label="Selecionar cor dos rótulos de seção">
                            <label class="custom-theme-hex-label" for="custom-theme-label-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-label-color-hex" value="#A2BEC5" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da cor dos rótulos">
                            </label>
                        </div>
                    </div>
                </div>
            </section>

            <section class="custom-theme-typography" aria-labelledby="custom-theme-component-colors-title">
                <div class="custom-theme-section-heading">
                    <h3 id="custom-theme-component-colors-title">Cores dos componentes</h3>
                    <p>Controle os fundos dos cards, menus, botões e campos de escrita, como caixas de texto e seletores.</p>
                </div>
                <div class="custom-theme-colors custom-theme-component-colors">
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-card-bg-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-card-bg-color-label">Fundo dos cards</div>
                        <p class="custom-theme-color-help">Cards de histórias, episódios e áreas de conteúdo.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-card-bg-color-picker" value="#0C1218" aria-label="Selecionar fundo dos cards">
                            <label class="custom-theme-hex-label" for="custom-theme-card-bg-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-card-bg-color-hex" value="#0C1218" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal do fundo dos cards">
                            </label>
                        </div>
                    </div>
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-menu-bg-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-menu-bg-color-label">Fundo dos menus</div>
                        <p class="custom-theme-color-help">Menus suspensos, abas e janelas interativas.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-menu-bg-color-picker" value="#111A22" aria-label="Selecionar fundo dos menus">
                            <label class="custom-theme-hex-label" for="custom-theme-menu-bg-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-menu-bg-color-hex" value="#111A22" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal do fundo dos menus">
                            </label>
                        </div>
                    </div>
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-button-bg-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-button-bg-color-label">Fundo dos botões</div>
                        <p class="custom-theme-color-help">Botões principais, secundários e controles de navegação.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-button-bg-color-picker" value="#16002B" aria-label="Selecionar fundo dos botões">
                            <label class="custom-theme-hex-label" for="custom-theme-button-bg-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-button-bg-color-hex" value="#16002B" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal do fundo dos botões">
                            </label>
                        </div>
                    </div>
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-input-bg-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-input-bg-color-label">Fundo dos campos de escrita</div>
                        <p class="custom-theme-color-help">Campos de texto, áreas de escrita, pesquisa, seletores e campos de formulário.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-input-bg-color-picker" value="#0C1218" aria-label="Selecionar fundo dos campos de escrita">
                            <label class="custom-theme-hex-label" for="custom-theme-input-bg-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-input-bg-color-hex" value="#0C1218" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal do fundo dos campos de escrita">
                            </label>
                        </div>
                    </div>
                    <div class="custom-theme-color-field" role="group" aria-labelledby="custom-theme-hover-color-label">
                        <div class="custom-theme-color-title" id="custom-theme-hover-color-label">Cor dos hovers</div>
                        <p class="custom-theme-color-help">Realces, contornos e círculos interativos ao passar o mouse por cards, links, botões e controles do site.</p>
                        <div class="custom-theme-color-inputs">
                            <input type="color" id="custom-theme-hover-color-picker" value="#00E5FF" aria-label="Selecionar cor dos efeitos de hover">
                            <label class="custom-theme-hex-label" for="custom-theme-hover-color-hex">
                                <span>Código hexadecimal</span>
                                <input type="text" id="custom-theme-hover-color-hex" value="#00E5FF" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código hexadecimal da cor dos hovers">
                            </label>
                        </div>
                    </div>
                </div>
            </section>

            <div class="custom-theme-preview-block">
                <span class="custom-theme-preview-caption">Prévia do fundo, textos, componentes e hover</span>
                <div id="custom-theme-preview" class="custom-theme-preview" role="group" aria-label="Prévia do gradiente, textos, componentes e efeitos de hover">
                    <div class="custom-theme-preview-background" aria-hidden="true">
                        <img id="custom-theme-preview-background-image" alt="" draggable="false">
                    </div>
                    <div class="custom-theme-preview-sample-card">
                        <span class="custom-theme-preview-label">BIBLIOTECA</span>
                        <strong class="custom-theme-preview-title">Universo dos Crias</strong>
                        <small class="custom-theme-preview-text">Prévia de um card de história.</small>
                        <div class="custom-theme-preview-menu">Menu interativo</div>
                        <input class="custom-theme-preview-input" type="text" value="Campo de escrita" readonly aria-label="Prévia de um campo de escrita">
                        <span class="custom-theme-preview-button">Botão de exemplo</span>
                    </div>
                </div>
            </div>

            <p id="custom-theme-status" class="custom-theme-status" role="status" aria-live="polite"></p>

            <div class="custom-theme-dialog-actions">
                <button type="button" id="custom-theme-use-preset" class="secondary-button">Voltar aos temas prontos</button>
                <div class="custom-theme-primary-actions">
                    <button type="button" id="custom-theme-cancel" class="secondary-button">Cancelar</button>
                    <button type="button" id="custom-theme-save" class="primary-button">Salvar tema</button>
                </div>
            </div>
        </div>`;
    document.body.append(editorDialog);
    window.addEventListener("resize", () => {
        if (editorDialog?.open) updatePreview({ markDirty: false });
    }, { passive: true });

    const pickerPairs = [
        ["#custom-theme-color-1-picker", "#custom-theme-color-1-hex"],
        ["#custom-theme-color-2-picker", "#custom-theme-color-2-hex"],
        ["#custom-theme-title-color-picker", "#custom-theme-title-color-hex"],
        ["#custom-theme-text-color-picker", "#custom-theme-text-color-hex"],
        ["#custom-theme-interactive-text-color-picker", "#custom-theme-interactive-text-color-hex"],
        ["#custom-theme-label-color-picker", "#custom-theme-label-color-hex"],
        ["#custom-theme-card-bg-color-picker", "#custom-theme-card-bg-color-hex"],
        ["#custom-theme-menu-bg-color-picker", "#custom-theme-menu-bg-color-hex"],
        ["#custom-theme-button-bg-color-picker", "#custom-theme-button-bg-color-hex"],
        ["#custom-theme-input-bg-color-picker", "#custom-theme-input-bg-color-hex"],
        ["#custom-theme-hover-color-picker", "#custom-theme-hover-color-hex"],
    ];
    for (const [pickerSelector, hexSelector] of pickerPairs) {
        const picker = editorDialog.querySelector(pickerSelector);
        const hex = editorDialog.querySelector(hexSelector);
        picker.addEventListener("input", () => {
            hex.value = picker.value.toUpperCase();
            hex.setAttribute("aria-invalid", "false");
            updatePreview();
        });
        hex.addEventListener("input", () => {
            const valid = /^#?[\da-fA-F]{6}$/.test(hex.value.trim());
            hex.setAttribute("aria-invalid", String(!valid));
            if (valid) {
                const normalized = `#${hex.value.trim().replace(/^#/, "").toUpperCase()}`;
                picker.value = normalized;
                updatePreview();
            } else {
                if (editorState) editorState.hasUnsavedChanges = true;
                editorDialog.querySelector("#custom-theme-save").disabled = true;
                showEditorMessage("Use seis dígitos hexadecimais, com ou sem #.", "error");
            }
        });
        hex.addEventListener("blur", () => {
            const valid = /^#?[\da-fA-F]{6}$/.test(hex.value.trim());
            if (valid) hex.value = `#${hex.value.trim().replace(/^#/, "").toUpperCase()}`;
        });
    }

    editorDialog.querySelector("#custom-theme-direction").addEventListener("change", () => updatePreview());
    editorDialog.querySelector("#custom-theme-background-type").addEventListener("change", () => {
        if (editorDialog.querySelector("#custom-theme-background-type").value === "image" && editorState) {
            editorState.clearBackgroundRequested = false;
        }
        syncBackgroundControls();
        updatePreview();
    });
    editorDialog.querySelector("#custom-theme-background-source").addEventListener("change", () => {
        const source = editorDialog.querySelector("#custom-theme-background-source").value;
        if (source === "url" && editorState?.pendingBackgroundFile) {
            editorState.pendingBackgroundFile = null;
            if (editorState.pendingBackgroundObjectUrl) URL.revokeObjectURL(editorState.pendingBackgroundObjectUrl);
            editorState.pendingBackgroundObjectUrl = "";
            editorDialog.querySelector("#custom-theme-background-file").value = "";
            editorDialog.querySelector("#custom-theme-background-file-name").textContent = "Nenhum arquivo novo selecionado.";
        }
        if (editorState) editorState.draftSettings = {
            ...(editorState.draftSettings || {}),
            custom_theme_background_source: source,
            custom_theme_background_path: source === "url" ? "" : (editorState.draftSettings?.custom_theme_background_path || ""),
        };
        syncBackgroundControls();
        updatePreview();
    });
    editorDialog.querySelector("#custom-theme-background-dim").addEventListener("input", (event) => {
        editorDialog.querySelector("#custom-theme-background-dim-value").textContent = `${event.target.value}%`;
        updatePreview();
    });
    editorDialog.querySelector("#custom-theme-background-blur").addEventListener("input", (event) => {
        editorDialog.querySelector("#custom-theme-background-blur-value").textContent = `${event.target.value} px`;
        updatePreview();
    });
    editorDialog.querySelector("#custom-theme-background-position").addEventListener("change", () => {
        syncBackgroundControls();
        updatePreview();
    });
    editorDialog.querySelector("#custom-theme-background-url").addEventListener("input", () => updatePreview());
    editorDialog.querySelector("#custom-theme-background-zoom").addEventListener("input", (event) => {
        editorDialog.querySelector("#custom-theme-background-zoom-value").textContent = `${event.target.value}%`;
        updatePreview();
    });
    const rotationInput = editorDialog.querySelector("#custom-theme-background-rotation");
    const rotateBy = (degrees) => {
        const current = Number(rotationInput.value) || 0;
        rotationInput.value = String(((current + degrees) % 360 + 360) % 360);
        editorDialog.querySelector("#custom-theme-background-rotation-value").textContent = `${rotationInput.value}°`;
        updatePreview();
    };
    editorDialog.querySelector("#custom-theme-background-rotate-left").addEventListener("click", () => rotateBy(-90));
    editorDialog.querySelector("#custom-theme-background-rotate-right").addEventListener("click", () => rotateBy(90));
    for (const [axis, buttonId, valueId] of [
        ["x", "#custom-theme-background-flip-x", "#custom-theme-background-flip-x-value"],
        ["y", "#custom-theme-background-flip-y", "#custom-theme-background-flip-y-value"],
    ]) {
        const button = editorDialog.querySelector(buttonId);
        const value = editorDialog.querySelector(valueId);
        button.addEventListener("click", () => {
            const flipped = value.value !== "true";
            value.value = String(flipped);
            button.setAttribute("aria-pressed", String(flipped));
            updatePreview();
        });
    }
    editorDialog.querySelector("#custom-theme-background-crop-reset").addEventListener("click", () => {
        editorDialog.querySelector("#custom-theme-background-zoom").value = "100";
        editorDialog.querySelector("#custom-theme-background-zoom-value").textContent = "100%";
        rotationInput.value = "0";
        editorDialog.querySelector("#custom-theme-background-rotation-value").textContent = "0°";
        editorDialog.querySelector("#custom-theme-background-flip-x-value").value = "false";
        editorDialog.querySelector("#custom-theme-background-flip-y-value").value = "false";
        editorDialog.querySelector("#custom-theme-background-flip-x").setAttribute("aria-pressed", "false");
        editorDialog.querySelector("#custom-theme-background-flip-y").setAttribute("aria-pressed", "false");
        editorDialog.querySelector("#custom-theme-background-offset-x").value = "0";
        editorDialog.querySelector("#custom-theme-background-offset-y").value = "0";
        updatePreview();
    });
    const cropViewport = editorDialog.querySelector("#custom-theme-background-crop-viewport");
    const cropOffsetX = editorDialog.querySelector("#custom-theme-background-offset-x");
    const cropOffsetY = editorDialog.querySelector("#custom-theme-background-offset-y");
    let cropDrag = null;
    cropViewport.addEventListener("pointerdown", (event) => {
        const image = editorDialog.querySelector("#custom-theme-background-crop-image");
        if (image.hidden || !image.getAttribute("src") || editorDialog.querySelector("#custom-theme-background-position").value !== "custom") return;
        if (event.button !== undefined && event.button !== 0) return;
        const rect = cropViewport.getBoundingClientRect();
        cropDrag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: Number(cropOffsetX.value) || 0,
            startOffsetY: Number(cropOffsetY.value) || 0,
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
        };
        cropViewport.classList.add("is-dragging");
        try { cropViewport.setPointerCapture(event.pointerId); } catch { /* alguns navegadores capturam o ponteiro implicitamente */ }
        event.preventDefault();
    });
    cropViewport.addEventListener("pointermove", (event) => {
        if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
        const dx = event.clientX - cropDrag.startX;
        const dy = event.clientY - cropDrag.startY;
        // Os deslocamentos são relativos ao quadro e limitados para evitar perder a imagem.
        cropOffsetX.value = String(Math.max(-50, Math.min(50, Math.round(cropDrag.startOffsetX - (dx / cropDrag.width) * 100))));
        cropOffsetY.value = String(Math.max(-50, Math.min(50, Math.round(cropDrag.startOffsetY - (dy / cropDrag.height) * 100))));
        event.preventDefault();
        updatePreview();
    });
    const endCropDrag = (event) => {
        if (!cropDrag || (event?.pointerId !== undefined && cropDrag.pointerId !== event.pointerId)) return;
        cropDrag = null;
        cropViewport.classList.remove("is-dragging");
    };
    cropViewport.addEventListener("pointerup", endCropDrag);
    cropViewport.addEventListener("pointercancel", endCropDrag);
    cropViewport.addEventListener("lostpointercapture", () => endCropDrag());
    editorDialog.querySelector("#custom-theme-background-file").addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (!file || !editorState) return;
        try {
            validateThemeBackgroundFile(file);
        } catch (error) {
            event.target.value = "";
            showEditorMessage(error.message || "Não foi possível usar essa imagem.", "error");
            return;
        }
        if (editorState.pendingBackgroundObjectUrl) URL.revokeObjectURL(editorState.pendingBackgroundObjectUrl);
        editorState.pendingBackgroundFile = file;
        editorState.pendingBackgroundObjectUrl = URL.createObjectURL(file);
        editorState.clearBackgroundRequested = false;
        editorDialog.querySelector("#custom-theme-background-type").value = "image";
        editorDialog.querySelector("#custom-theme-background-source").value = "upload";
        editorDialog.querySelector("#custom-theme-background-file-name").textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        if (editorState.draftSettings) {
            editorState.draftSettings.custom_theme_background_type = "image";
            editorState.draftSettings.custom_theme_background_source = "upload";
        }
        syncBackgroundControls();
        updatePreview();
    });
    editorDialog.querySelector("#custom-theme-background-clear").addEventListener("click", () => {
        if (!editorState) return;
        editorState.pendingBackgroundFile = null;
        if (editorState.pendingBackgroundObjectUrl) URL.revokeObjectURL(editorState.pendingBackgroundObjectUrl);
        editorState.pendingBackgroundObjectUrl = "";
        editorState.clearBackgroundRequested = true;
        editorDialog.querySelector("#custom-theme-background-type").value = "gradient";
        editorDialog.querySelector("#custom-theme-background-source").value = "url";
        editorDialog.querySelector("#custom-theme-background-url").value = "";
        editorDialog.querySelector("#custom-theme-background-file").value = "";
        editorDialog.querySelector("#custom-theme-background-file-name").textContent = "Nenhum arquivo selecionado. A imagem salva será removida ao salvar.";
        editorState.draftSettings = {
            ...(editorState.draftSettings || {}),
            custom_theme_background_type: "gradient",
            custom_theme_background_source: "url",
            custom_theme_background_url: "",
            custom_theme_background_path: "",
        };
        syncBackgroundControls();
        updatePreview();
        showEditorMessage("A imagem será removida quando você salvar o tema.");
    });
    editorDialog.querySelector("#custom-theme-close").addEventListener("click", () => editorDialog.close("cancel"));
    editorDialog.querySelector("#custom-theme-cancel").addEventListener("click", () => editorDialog.close("cancel"));

    editorDialog.querySelector("#custom-theme-save").addEventListener("click", async () => {
        const settings = fieldsToSettings();
        if (!settings) {
            showEditorMessage(editorState?.validationMessage || "Confira os códigos de cor antes de salvar.", "error");
            return;
        }

        const saveButton = editorDialog.querySelector("#custom-theme-save");
        const backgroundFile = settings.custom_theme_background_type === "image"
            && settings.custom_theme_background_source === "upload"
            ? editorState?.pendingBackgroundFile || null
            : null;
        const clearBackground = Boolean(editorState?.clearBackgroundRequested);
        saveButton.disabled = true;
        showEditorMessage("Salvando seu tema…");
        try {
            const result = await saveCustomThemePreferences(settings, { backgroundFile, clearBackground });
            const savedSettings = normalizeCustomThemeSettings(result.preferences || settings);
            setThemeLocally("personalizado");
            applyCustomThemeSettings(savedSettings);
            await resolveCustomThemeBackground(savedSettings);
            if (editorState) {
                if (editorState.pendingBackgroundObjectUrl) URL.revokeObjectURL(editorState.pendingBackgroundObjectUrl);
                editorState.pendingBackgroundObjectUrl = "";
                editorState.pendingBackgroundFile = null;
                editorState.clearBackgroundRequested = false;
                editorState.draftSettings = { ...savedSettings };
                editorState.baselineTheme = "personalizado";
                editorState.baselineSettings = { ...savedSettings };
                editorState.hasUnsavedChanges = false;
                editorDialog.querySelector("#custom-theme-background-file").value = "";
                editorDialog.querySelector("#custom-theme-background-file-name").textContent = savedSettings.custom_theme_background_source === "upload" && savedSettings.custom_theme_background_path
                    ? "Imagem salva na sua conta. Selecione outro arquivo para substituí-la."
                    : "Nenhum arquivo novo selecionado.";
                updatePreview({ markDirty: false });
            }
            const destination = result.savedTo === "account"
                ? "sua conta do Supabase"
                : result.savedTo === "indexeddb"
                    ? "este navegador (IndexedDB)"
                    : "este navegador (armazenamento local alternativo)";
            showEditorMessage(`Tema personalizado salvo em ${destination}.`, "success");
        } catch (error) {
            console.error("[Tema personalizado] Não foi possível salvar o tema:", {
                code: error?.code,
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
            });
            showEditorMessage(error?.message || "Não foi possível salvar. Confira a migração SQL do tema personalizado e tente novamente.", "error");
        } finally {
            saveButton.disabled = false;
        }
    });

    editorDialog.querySelector("#custom-theme-use-preset").addEventListener("click", async () => {
        // Volta a um tema conhecido; o botão global permite percorrer os demais temas prontos.
        try {
            const saved = await saveUserPreferencePatch({ theme: "neblina" });
            if (!saved) {
                setThemeLocally("neblina");
            }
            if (editorState) {
                editorState.baselineTheme = "neblina";
                editorState.hasUnsavedChanges = false;
            }
            document.querySelector("#account-theme")?.setAttribute("data-theme-editor-preset", "neblina");
            editorDialog.close("preset");
        } catch (error) {
            console.error("[Tema personalizado] Não foi possível voltar ao tema pronto:", error);
            showEditorMessage("Não foi possível salvar o tema pronto na conta. Tente novamente.", "error");
        }
    });

    editorDialog.addEventListener("close", () => {
        if (!editorState) return;
        const state = editorState;
        if (state.hasUnsavedChanges || currentTheme() !== state.baselineTheme) {
            setThemeLocally(state.baselineTheme);
            applyCustomThemeSettings(state.baselineSettings);
            void resolveCustomThemeBackground(state.baselineSettings);
            const themeSelect = document.querySelector("#account-theme");
            if (themeSelect) themeSelect.value = state.baselineTheme;
        }
        if (state.pendingBackgroundObjectUrl) URL.revokeObjectURL(state.pendingBackgroundObjectUrl);
        editorState = null;
    });

    return editorDialog;
}

export async function openCustomThemeEditor() {
    const dialog = ensureEditorDialog();
    if (dialog.open) {
        dialog.focus();
        return;
    }

    const root = document.documentElement;
    let baselineTheme = currentTheme();
    let settings = getCachedCustomThemeSettings();
    try {
        const synced = await syncUserPreferences();
        if (synced?.preferences) {
            baselineTheme = synced.preferences.theme;
            settings = normalizeCustomThemeSettings(synced.preferences);
        } else {
            baselineTheme = THEMES.includes(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : baselineTheme;
            settings = await readAnonymousCustomThemeSettings();
        }
    } catch (error) {
        console.warn("Não foi possível atualizar as preferências antes de abrir o editor:", error);
        if (!syncedThemeIsCustom(baselineTheme)) {
            // Use o cache local conhecido; salvar ainda exigirá sincronização se a conta estiver autenticada.
            settings = getCachedCustomThemeSettings();
        }
    }

    editorState = {
        baselineTheme: THEMES.includes(baselineTheme) ? baselineTheme : "neblina",
        baselineSettings: { ...settings },
        hasUnsavedChanges: false,
    };
    await resolveCustomThemeBackground(settings);
    loadFields(settings);
    applyCustomThemeSettings(settings);
    root.dataset.theme = "personalizado";
    refreshThemeLabel();
    dialog.showModal();
}

function syncedThemeIsCustom(theme) {
    return theme === "personalizado";
}

export function setupTheme() {
    let stored = "neblina";
    try { stored = localStorage.getItem(STORAGE_KEY) || "neblina"; } catch { /* use default */ }
    const saved = THEMES.includes(stored) ? stored : "neblina";
    document.documentElement.dataset.theme = saved;
    applyCustomThemeSettings(getCachedCustomThemeSettings());

    const button = document.querySelector("#theme-toggle");
    refreshThemeLabel = () => {
        if (!button) return;
        button.textContent = `Tema: ${themeLabel(currentTheme())}`;
    };
    refreshThemeLabel();

    if (button && !button.dataset.themeHandlerAttached) {
        button.dataset.themeHandlerAttached = "true";
        button.addEventListener("click", () => {
            const current = currentTheme();
            if (current === "personalizado") {
                openCustomThemeEditor().catch((error) => console.error("Não foi possível abrir o editor de gradiente:", error));
                return;
            }
            const index = PRESET_THEMES.indexOf(current);
            const next = PRESET_THEMES[(Math.max(index, -1) + 1) % PRESET_THEMES.length];
            if (current === "ciano") {
                openCustomThemeEditor().catch((error) => console.error("Não foi possível abrir o editor de gradiente:", error));
                return;
            }
            setThemeLocally(next);
            saveUserPreferencePatch({ theme: next }).catch((error) => {
                console.warn("Não foi possível sincronizar o tema com a conta:", error);
            });
        });
    }

    const accountTheme = document.querySelector("#account-theme");
    if (accountTheme && !accountTheme.dataset.customThemeHandlerAttached) {
        accountTheme.dataset.customThemeHandlerAttached = "true";
        accountTheme.addEventListener("change", (event) => {
            if (event.target.value !== "personalizado") return;
            event.stopImmediatePropagation();
            accountTheme.value = currentTheme();
            openCustomThemeEditor().catch((error) => console.error("Não foi possível abrir o editor de gradiente:", error));
        }, true);
    }

    window.addEventListener("hdc-user-preferences-applied", (event) => {
        const remoteTheme = event.detail?.preferences?.theme;
        if (!THEMES.includes(remoteTheme)) return;
        document.documentElement.dataset.theme = remoteTheme;
        if (event.detail?.preferences) applyCustomThemeSettings(event.detail.preferences);
        refreshThemeLabel();
    });

    // Visitantes recuperam o gradiente do IndexedDB; usuários autenticados recebem o tema do Supabase.
    syncUserPreferences().then(async (synced) => {
        if (synced?.preferences) return;
        const anonymous = await readAnonymousCustomThemeSettings();
        applyCustomThemeSettings(anonymous);
        await resolveCustomThemeBackground(anonymous);
        if (currentTheme() === "personalizado") refreshThemeLabel();
    }).catch((error) => {
        console.warn("Não foi possível carregar as preferências de tema:", error);
    });
}
