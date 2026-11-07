import { escapeHtml } from "../core/utils.js";
import { openConfirmModal } from "../core/modal.js";
import {
    getMyStoryUniverses,
    getIncomingStoryUniverseRequests,
    searchPublishedStoriesForUniverse,
    createStoryUniverse,
    updateStoryUniverseDetails,
    deleteStoryUniverse,
    addStoryToUniverse,
    respondToStoryUniverseRequest,
    removeStoryFromUniverse,
    moveStoryInUniverse,
    setStoryUniverseMain,
    uploadStoryUniverseCover,
    setStoryUniverseCoverPath,
    removeStoryUniverseCover,
} from "../services/story-universe.service.js?v=20261107-story-universe-covers-3";

const RELATION_LABELS = {
    main: "Obra principal",
    spin_off: "Spin-off",
    complementary: "História complementar",
};

const STATUS_LABELS = {
    approved: "Aprovada",
    pending: "Aguardando aprovação",
    rejected: "Recusada",
};

function feedbackMarkup(message, type = "") {
    if (!message) return "";
    return `<p class="form-message ${type === "error" ? "error" : type === "success" ? "success" : ""}" role="status" aria-live="polite">${escapeHtml(message)}</p>`;
}

function renderUniverseCoverCropControls() {
    return `
        <button type="button" class="secondary-button story-cover-crop-toggle" data-universe-cover-crop-toggle hidden aria-expanded="false">
            Personalizar enquadramento da capa
        </button>
        <p class="muted story-cover-crop-intro" data-universe-cover-crop-intro hidden>
            Ajuste o recorte antes de salvar. A capa final usa proporção vertical 3:4.
        </p>
        <section class="story-cover-crop-controls" data-universe-cover-crop-controls hidden aria-label="Personalizar enquadramento da capa">
            <div>
                <span class="eyebrow">ENQUADRAMENTO</span>
                <h4>Escolha o que aparece na capa</h4>
                <p class="muted">Arraste a imagem, ajuste o zoom, gire ou espelhe. O recorte final usa proporção vertical 3:4.</p>
            </div>
            <div class="story-cover-crop-viewport" data-universe-cover-crop-viewport role="application" tabindex="0" aria-label="Área de recorte. Arraste a imagem para reposicionar.">
                <div class="story-cover-crop-layer" data-universe-cover-crop-layer>
                    <img data-universe-cover-crop-image alt="Prévia da capa do universo" draggable="false" hidden>
                </div>
                <div class="story-cover-crop-grid" aria-hidden="true"><span></span><span></span></div>
                <p class="story-cover-crop-placeholder" data-universe-cover-crop-placeholder>Selecione um arquivo ou informe um link HTTPS válido para ajustar a capa.</p>
            </div>
            <label class="story-cover-crop-zoom-label">
                <span>Zoom <output data-universe-cover-crop-zoom-output>100%</output></span>
                <input data-universe-cover-crop-zoom type="range" min="100" max="300" step="5" value="100">
            </label>
            <div class="story-cover-crop-actions">
                <button type="button" class="secondary-button" data-universe-cover-crop-rotate="-90">Girar à esquerda</button>
                <button type="button" class="secondary-button" data-universe-cover-crop-rotate="90">Girar à direita</button>
                <button type="button" class="secondary-button" data-universe-cover-crop-flip-x aria-pressed="false">Espelhar horizontal</button>
                <button type="button" class="secondary-button" data-universe-cover-crop-flip-y aria-pressed="false">Espelhar vertical</button>
                <button type="button" class="secondary-button" data-universe-cover-crop-reset>Redefinir recorte</button>
            </div>
            <p class="form-message" data-universe-cover-crop-message role="status" aria-live="polite"></p>
        </section>
    `;
}

function bindUniverseCoverEditor(scope, currentUniverse = {}, { persistent = false } = {}) {
    const source = scope.querySelector('[data-universe-cover-source]');
    const fileGroup = scope.querySelector('[data-universe-cover-file-group]');
    const linkGroup = scope.querySelector('[data-universe-cover-link-group]');
    const fileInput = scope.querySelector('[data-universe-cover-file]');
    const linkInput = scope.querySelector('[data-universe-cover-link]');
    const preview = scope.querySelector('[data-universe-cover-preview]');
    const cropToggle = scope.querySelector('[data-universe-cover-crop-toggle]');
    const cropIntro = scope.querySelector('[data-universe-cover-crop-intro]');
    const cropControls = scope.querySelector('[data-universe-cover-crop-controls]');
    const cropViewport = scope.querySelector('[data-universe-cover-crop-viewport]');
    const cropLayer = scope.querySelector('[data-universe-cover-crop-layer]');
    const cropImage = scope.querySelector('[data-universe-cover-crop-image]');
    const cropPlaceholder = scope.querySelector('[data-universe-cover-crop-placeholder]');
    const cropZoom = scope.querySelector('[data-universe-cover-crop-zoom]');
    const cropZoomOutput = scope.querySelector('[data-universe-cover-crop-zoom-output]');
    const cropMessage = scope.querySelector('[data-universe-cover-crop-message]');
    const flipXButton = scope.querySelector('[data-universe-cover-crop-flip-x]');
    const flipYButton = scope.querySelector('[data-universe-cover-crop-flip-y]');

    if (!source || !fileGroup || !linkGroup || !fileInput || !linkInput || !preview) {
        return {
            getSource: () => source?.value || 'none',
            getLink: () => linkInput?.value?.trim() || '',
            getSelectedFile: () => fileInput?.files?.[0] || null,
            isCropOpen: () => false,
            createCroppedFile: async () => { throw new Error('Editor de capa indisponível.'); },
            reset() {},
            cleanup() {},
        };
    }

    const cropState = { zoom: 1, rotation: 0, flipX: false, flipY: false, offsetX: 0, offsetY: 0 };
    let cropSourceKey = '';
    let cropSourceError = null;
    let cropObjectUrl = null;
    let previewObjectUrl = null;
    let cropDrag = null;
    let urlCropDebounce = null;
    let disposed = false;

    function setCropMessage(text = '', type = '') {
        if (!cropMessage) return;
        cropMessage.className = `form-message${type ? ` ${type}` : ''}`;
        cropMessage.textContent = text;
    }

    function normalizeRotation(value) {
        return ((Number(value) % 360) + 360) % 360;
    }

    function validHttpsUrl(value) {
        try {
            const parsed = new URL(String(value || '').trim());
            return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null;
        } catch {
            return null;
        }
    }

    function getSourceDescriptor() {
        if (source.value === 'upload') {
            const file = fileInput.files?.[0] || null;
            if (file) return { key: `file:${file.name}:${file.size}:${file.lastModified}`, file, url: '' };
            if (currentUniverse.cover_path && currentUniverse.cover_display_url) {
                return { key: `stored:${currentUniverse.cover_path}`, file: null, url: currentUniverse.cover_display_url };
            }
            return null;
        }
        if (source.value === 'link') {
            const url = validHttpsUrl(linkInput.value);
            return url ? { key: `url:${url}`, file: null, url } : null;
        }
        return null;
    }

    function showPreview(url = '') {
        if (!url) {
            preview.innerHTML = '<span class="muted">Nenhuma capa selecionada.</span>';
            return;
        }
        preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Prévia da capa do universo">`;
    }

    function clampCropOffsets() {
        if (!cropImage?.naturalWidth || !cropViewport?.clientWidth || !cropViewport?.clientHeight) return;
        const vw = cropViewport.clientWidth;
        const vh = cropViewport.clientHeight;
        const rotation = normalizeRotation(cropState.rotation);
        const rotatedWidth = rotation % 180 === 0 ? cropImage.naturalWidth : cropImage.naturalHeight;
        const rotatedHeight = rotation % 180 === 0 ? cropImage.naturalHeight : cropImage.naturalWidth;
        const fit = Math.max(vw / rotatedWidth, vh / rotatedHeight);
        const maxX = Math.max(0, (rotatedWidth * fit * cropState.zoom - vw) / (2 * vw));
        const maxY = Math.max(0, (rotatedHeight * fit * cropState.zoom - vh) / (2 * vh));
        cropState.offsetX = Math.max(-maxX, Math.min(maxX, cropState.offsetX));
        cropState.offsetY = Math.max(-maxY, Math.min(maxY, cropState.offsetY));
    }

    function updateCropPreview() {
        if (!cropImage?.naturalWidth || !cropViewport) return;
        const vw = cropViewport.clientWidth;
        const vh = cropViewport.clientHeight;
        if (!vw || !vh) return;
        const rotation = normalizeRotation(cropState.rotation);
        const rotatedWidth = rotation % 180 === 0 ? cropImage.naturalWidth : cropImage.naturalHeight;
        const rotatedHeight = rotation % 180 === 0 ? cropImage.naturalHeight : cropImage.naturalWidth;
        const fit = Math.max(vw / rotatedWidth, vh / rotatedHeight);
        cropLayer.style.width = `${cropImage.naturalWidth * fit}px`;
        cropLayer.style.height = `${cropImage.naturalHeight * fit}px`;
        clampCropOffsets();
        cropLayer.style.transform = `translate(calc(-50% + ${cropState.offsetX * vw}px), calc(-50% + ${cropState.offsetY * vh}px)) rotate(${rotation}deg) scale(${cropState.zoom}) scaleX(${cropState.flipX ? -1 : 1}) scaleY(${cropState.flipY ? -1 : 1})`;
        cropZoom.value = String(Math.round(cropState.zoom * 100));
        cropZoomOutput.value = `${Math.round(cropState.zoom * 100)}%`;
        flipXButton?.setAttribute('aria-pressed', String(cropState.flipX));
        flipYButton?.setAttribute('aria-pressed', String(cropState.flipY));
    }

    async function loadCropSource(force = false) {
        const descriptor = getSourceDescriptor();
        if (!descriptor) {
            cropSourceError = new Error('Selecione uma imagem ou informe um link HTTPS válido antes de personalizar o recorte.');
            cropPlaceholder.hidden = false;
            cropImage.hidden = true;
            cropLayer.style.width = '0';
            cropLayer.style.height = '0';
            setCropMessage(cropSourceError.message, 'error');
            return false;
        }
        if (!force && descriptor.key === cropSourceKey && cropImage.complete && cropImage.naturalWidth > 0 && !cropSourceError) {
            updateCropPreview();
            return true;
        }

        cropSourceError = null;
        setCropMessage('Carregando imagem para recorte…');
        cropPlaceholder.hidden = true;
        cropImage.hidden = false;
        let nextObjectUrl = null;
        let src = descriptor.url;
        if (descriptor.file) {
            nextObjectUrl = URL.createObjectURL(descriptor.file);
            src = nextObjectUrl;
        }

        try {
            await new Promise((resolve, reject) => {
                const onLoad = () => { cropImage.removeEventListener('load', onLoad); cropImage.removeEventListener('error', onError); resolve(); };
                const onError = () => { cropImage.removeEventListener('load', onLoad); cropImage.removeEventListener('error', onError); reject(new Error('Não foi possível carregar a imagem para recorte. Links externos precisam permitir acesso à imagem pelo navegador (CORS); se necessário, envie o arquivo diretamente.')); };
                cropImage.addEventListener('load', onLoad, { once: true });
                cropImage.addEventListener('error', onError, { once: true });
                if (/^https:\/\//i.test(src)) cropImage.crossOrigin = 'anonymous';
                else cropImage.removeAttribute('crossorigin');
                cropImage.src = src;
                if (cropImage.complete && cropImage.naturalWidth > 0) onLoad();
            });
            if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
            cropObjectUrl = nextObjectUrl;
            cropSourceKey = descriptor.key;
            Object.assign(cropState, { zoom: 1, rotation: 0, flipX: false, flipY: false, offsetX: 0, offsetY: 0 });
            updateCropPreview();
            cropPlaceholder.hidden = true;
            cropViewport.setAttribute('aria-disabled', 'false');
            setCropMessage('Arraste a imagem ou use os controles para ajustar o recorte.', 'success');
            return true;
        } catch (error) {
            if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
            cropSourceError = error;
            cropSourceKey = '';
            cropImage.hidden = true;
            cropPlaceholder.hidden = false;
            cropPlaceholder.textContent = 'Não foi possível preparar a imagem para recorte. Tente outro link ou envie o arquivo.';
            cropViewport.setAttribute('aria-disabled', 'true');
            setCropMessage(error.message, 'error');
            return false;
        }
    }

    function updateControls({ refreshPreview = false } = {}) {
        const value = source.value;
        fileGroup.hidden = value !== 'upload';
        linkGroup.hidden = value !== 'link';
        if (cropToggle) cropToggle.hidden = value === 'none';
        if (cropIntro) cropIntro.hidden = value === 'none';
        if (value === 'none') {
            if (cropControls) cropControls.hidden = true;
            if (cropToggle) { cropToggle.textContent = 'Personalizar enquadramento da capa'; cropToggle.setAttribute('aria-expanded', 'false'); }
            showPreview('');
        } else if (refreshPreview) {
            const file = value === 'upload' ? fileInput.files?.[0] : null;
            if (file && previewObjectUrl) showPreview(previewObjectUrl);
            else if (value === 'upload' && currentUniverse.cover_path && currentUniverse.cover_display_url) showPreview(currentUniverse.cover_display_url);
            else if (value === 'link' && validHttpsUrl(linkInput.value)) showPreview(validHttpsUrl(linkInput.value));
            else showPreview('');
        }
        if (cropToggle) cropToggle.disabled = value === 'none' || !getSourceDescriptor();
    }

    source.addEventListener('change', async () => {
        updateControls({ refreshPreview: true });
        if (cropControls && !cropControls.hidden) await loadCropSource(true);
    });

    fileInput.addEventListener('change', async () => {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
        const file = fileInput.files?.[0];
        if (file) {
            previewObjectUrl = URL.createObjectURL(file);
            showPreview(previewObjectUrl);
        } else {
            updateControls({ refreshPreview: true });
        }
        updateControls();
        if (cropControls && !cropControls.hidden) await loadCropSource(true);
    });

    linkInput.addEventListener('input', () => {
        const url = validHttpsUrl(linkInput.value);
        showPreview(url || '');
        updateControls();
        if (cropControls && !cropControls.hidden) {
            clearTimeout(urlCropDebounce);
            urlCropDebounce = setTimeout(() => loadCropSource(true), 450);
        }
    });

    cropToggle?.addEventListener('click', async () => {
        if (cropControls.hidden) {
            cropControls.hidden = false;
            cropToggle.textContent = 'Ocultar ajustes de enquadramento';
            cropToggle.setAttribute('aria-expanded', 'true');
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await loadCropSource(true);
        } else {
            cropControls.hidden = true;
            cropToggle.textContent = 'Personalizar enquadramento da capa';
            cropToggle.setAttribute('aria-expanded', 'false');
        }
    });

    cropZoom?.addEventListener('input', () => {
        cropState.zoom = Number(cropZoom.value) / 100;
        updateCropPreview();
    });
    scope.querySelectorAll('[data-universe-cover-crop-rotate]').forEach((button) => button.addEventListener('click', () => {
        cropState.rotation = normalizeRotation(cropState.rotation + Number(button.dataset.universeCoverCropRotate));
        updateCropPreview();
    }));
    flipXButton?.addEventListener('click', () => { cropState.flipX = !cropState.flipX; updateCropPreview(); });
    flipYButton?.addEventListener('click', () => { cropState.flipY = !cropState.flipY; updateCropPreview(); });
    scope.querySelector('[data-universe-cover-crop-reset]')?.addEventListener('click', () => {
        Object.assign(cropState, { zoom: 1, rotation: 0, flipX: false, flipY: false, offsetX: 0, offsetY: 0 });
        updateCropPreview();
        setCropMessage('Enquadramento redefinido.', 'success');
    });

    cropViewport?.addEventListener('pointerdown', (event) => {
        if (!cropImage.naturalWidth || cropImage.hidden || cropControls.hidden) return;
        event.preventDefault();
        cropDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: cropState.offsetX, offsetY: cropState.offsetY };
        cropViewport.classList.add('is-dragging');
        cropViewport.setPointerCapture(event.pointerId);
    });
    cropViewport?.addEventListener('pointermove', (event) => {
        if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
        const width = Math.max(1, cropViewport.clientWidth);
        const height = Math.max(1, cropViewport.clientHeight);
        cropState.offsetX = cropDrag.offsetX + (event.clientX - cropDrag.x) / width;
        cropState.offsetY = cropDrag.offsetY + (event.clientY - cropDrag.y) / height;
        updateCropPreview();
    });
    function stopCropDrag(event) {
        if (!cropDrag || (event && cropDrag.pointerId !== event.pointerId)) return;
        cropDrag = null;
        cropViewport?.classList.remove('is-dragging');
    }
    cropViewport?.addEventListener('pointerup', stopCropDrag);
    cropViewport?.addEventListener('pointercancel', stopCropDrag);
    cropViewport?.addEventListener('lostpointercapture', stopCropDrag);

    const onResize = () => { if (cropControls && !cropControls.hidden) updateCropPreview(); };
    window.addEventListener('resize', onResize, { passive: true });

    async function createCroppedFile() {
        if (!cropControls || cropControls.hidden) throw new Error('Abra os ajustes de enquadramento antes de gerar o recorte.');
        const loaded = await loadCropSource();
        if (!loaded || !cropImage.naturalWidth || cropImage.hidden || cropSourceError) {
            throw cropSourceError || new Error('Carregue a imagem no editor de recorte antes de salvar.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 1200;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('Não foi possível preparar o recorte da capa neste navegador.');
        const naturalWidth = cropImage.naturalWidth;
        const naturalHeight = cropImage.naturalHeight;
        const rotation = normalizeRotation(cropState.rotation);
        const rotatedWidth = rotation % 180 === 0 ? naturalWidth : naturalHeight;
        const rotatedHeight = rotation % 180 === 0 ? naturalHeight : naturalWidth;
        const fit = Math.max(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.translate(canvas.width / 2 + cropState.offsetX * canvas.width, canvas.height / 2 + cropState.offsetY * canvas.height);
        context.rotate(rotation * Math.PI / 180);
        context.scale(cropState.flipX ? -1 : 1, cropState.flipY ? -1 : 1);
        context.scale(fit * cropState.zoom, fit * cropState.zoom);
        context.drawImage(cropImage, -naturalWidth / 2, -naturalHeight / 2, naturalWidth, naturalHeight);
        const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Não foi possível gerar a imagem recortada.')), 'image/webp', 0.92));
        if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem recortada excedeu o limite de 5 MB. Reduza o zoom ou use outra imagem.');
        return new File([blob], 'capa-universo-personalizada.webp', { type: blob.type || 'image/webp', lastModified: Date.now() });
    }

    function releaseObjectUrls() {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
        previewObjectUrl = null;
        cropObjectUrl = null;
    }

    function cleanup() {
        if (persistent) {
            clearTimeout(urlCropDebounce);
            releaseObjectUrls();
            return;
        }
        if (disposed) return;
        disposed = true;
        clearTimeout(urlCropDebounce);
        window.removeEventListener('resize', onResize);
        releaseObjectUrls();
        scope.removeEventListener('close', onClose);
    }
    function onClose() {
        if (persistent) releaseObjectUrls();
        else cleanup();
    }
    scope.addEventListener('close', onClose);

    function reset() {
        if (disposed) {
            disposed = false;
            window.addEventListener('resize', onResize, { passive: true });
            scope.addEventListener('close', onClose);
        }
        releaseObjectUrls();
        previewObjectUrl = null;
        cropObjectUrl = null;
        cropSourceKey = '';
        cropSourceError = null;
        Object.assign(cropState, { zoom: 1, rotation: 0, flipX: false, flipY: false, offsetX: 0, offsetY: 0 });
        cropControls.hidden = true;
        cropImage.hidden = true;
        cropImage.removeAttribute('src');
        cropLayer.style.width = '0';
        cropLayer.style.height = '0';
        cropPlaceholder.hidden = false;
        cropPlaceholder.textContent = 'Selecione um arquivo ou informe um link HTTPS válido para ajustar a capa.';
        if (cropZoom) cropZoom.value = '100';
        if (cropZoomOutput) cropZoomOutput.value = '100%';
        flipXButton?.setAttribute('aria-pressed', 'false');
        flipYButton?.setAttribute('aria-pressed', 'false');
        cropToggle.textContent = 'Personalizar enquadramento da capa';
        cropToggle.setAttribute('aria-expanded', 'false');
        updateControls({ refreshPreview: true });
    }

    updateControls();
    return {
        getSource: () => source.value,
        getLink: () => linkInput.value.trim(),
        getSelectedFile: () => fileInput.files?.[0] || null,
        isCropOpen: () => Boolean(cropControls && !cropControls.hidden),
        createCroppedFile,
        reset,
        cleanup,
    };
}

function relationshipOptions(selected = "spin_off") {
    return `
        <option value="spin_off" ${selected === "spin_off" ? "selected" : ""}>Spin-off</option>
        <option value="complementary" ${selected === "complementary" ? "selected" : ""}>História complementar</option>
    `;
}

function renderUniverseCard(universe) {
    const members = universe.story_universe_stories ?? [];
    const approved = members.filter((entry) => entry.status === "approved").length;
    const pending = members.filter((entry) => entry.status === "pending").length;
    const displayUrl = universe.cover_display_url || (String(universe.cover_url || "").startsWith("https://") ? universe.cover_url : null);
    const cover = displayUrl
        ? `<img src="${escapeHtml(displayUrl)}" alt="" loading="lazy">`
        : `<div class="universe-admin-cover-placeholder" aria-hidden="true">🌌</div>`;

    return `
        <article class="universe-admin-card">
            <div class="universe-admin-card-cover">${cover}</div>
            <div class="universe-admin-card-copy">
                <span class="eyebrow">UNIVERSO</span>
                <h3>${escapeHtml(universe.name)}</h3>
                <p>${escapeHtml(universe.description || "Sem descrição.")}</p>
                <div class="universe-admin-card-meta">
                    <span>${approved} ${approved === 1 ? "história aprovada" : "histórias aprovadas"}</span>
                    ${pending ? `<span>${pending} ${pending === 1 ? "solicitação pendente" : "solicitações pendentes"}</span>` : ""}
                </div>
                <button type="button" class="secondary-button" data-manage-universe="${Number(universe.id)}">Gerenciar universo</button>
            </div>
        </article>
    `;
}

function renderRequestCard(request) {
    const universe = request.story_universes ?? {};
    const story = request.stories ?? {};
    const writer = story.writers ?? {};
    const relationship = RELATION_LABELS[request.relationship_type] || "História complementar";
    return `
        <article class="universe-request-card" data-universe-request="${Number(request.universe_id)}:${Number(request.story_id)}">
            <div>
                <span class="eyebrow">SOLICITAÇÃO DE UNIVERSO</span>
                <h3>${escapeHtml(story.title || "História")}</h3>
                <p>O universo <strong>${escapeHtml(universe.name || "Universo")}</strong> deseja incluir esta obra como <strong>${escapeHtml(relationship)}</strong>.</p>
                <small class="muted">Solicitação enviada pelo responsável pelo universo.</small>
            </div>
            <div class="universe-request-actions">
                <button type="button" class="primary-button" data-approve-universe-request="${Number(request.universe_id)}:${Number(request.story_id)}">Aceitar</button>
                <button type="button" class="danger-button" data-reject-universe-request="${Number(request.universe_id)}:${Number(request.story_id)}">Recusar</button>
            </div>
        </article>
    `;
}

function sortUniverseMembers(entries = []) {
    const statusWeight = { approved: 0, pending: 1, rejected: 2 };
    return [...entries].sort((a, b) => {
        const statusDiff = (statusWeight[a.status] ?? 3) - (statusWeight[b.status] ?? 3);
        if (statusDiff) return statusDiff;
        return Number(a.reading_order) - Number(b.reading_order)
            || String(a.stories?.title ?? "").localeCompare(String(b.stories?.title ?? ""), "pt-BR");
    });
}

function renderMemberRow(entry, index, approvedEntries) {
    const story = entry.stories ?? {};
    const writer = story.writers ?? {};
    const status = STATUS_LABELS[entry.status] || entry.status;
    const relation = RELATION_LABELS[entry.relationship_type] || "História complementar";
    const approved = entry.status === "approved";
    const position = approvedEntries.findIndex((item) => Number(item.story_id) === Number(entry.story_id));
    const canMove = approved && position >= 0;

    return `
        <article class="universe-member-row" data-universe-member="${Number(entry.story_id)}">
            <div class="universe-member-order">${approved ? position + 1 : "—"}</div>
            <div class="universe-member-copy">
                <strong>${escapeHtml(story.title || `História #${entry.story_id}`)}</strong>
                <span>${escapeHtml(relation)} · ${escapeHtml(writer.name || writer.username || "Escritor")}</span>
                <small class="${entry.status === "pending" ? "universe-pending-status" : entry.status === "rejected" ? "universe-rejected-status" : "muted"}">${escapeHtml(status)}</small>
            </div>
            <div class="universe-member-actions">
                ${canMove ? `
                    <button type="button" class="secondary-button universe-move-button" data-move-story="${Number(entry.story_id)}" data-direction="up" ${position === 0 ? "disabled" : ""} aria-label="Mover ${escapeHtml(story.title || "história")} para cima">↑</button>
                    <button type="button" class="secondary-button universe-move-button" data-move-story="${Number(entry.story_id)}" data-direction="down" ${position === approvedEntries.length - 1 ? "disabled" : ""} aria-label="Mover ${escapeHtml(story.title || "história")} para baixo">↓</button>
                    ${entry.relationship_type !== "main" ? `<button type="button" class="secondary-button universe-set-main-button" data-set-universe-main="${Number(entry.story_id)}">Definir como principal</button>` : `<span class="status-pill published">Principal</span>`}
                ` : ""}
                <button type="button" class="danger-button universe-remove-member-button" data-remove-story="${Number(entry.story_id)}" data-story-title="${escapeHtml(story.title || "esta história")}">Remover</button>
            </div>
        </article>
    `;
}

function renderUniverseCoverFields(prefix, universe = null) {
    const source = universe?.cover_path ? 'upload' : universe?.cover_url ? 'link' : 'none';
    const displayUrl = universe?.cover_display_url || (String(universe?.cover_url || '').startsWith('https://') ? universe.cover_url : null);
    return `
        <label>Origem da capa
            <select id="${prefix}-cover-source" data-universe-cover-source>
                <option value="none" ${source === 'none' ? 'selected' : ''}>Sem imagem</option>
                <option value="link" ${source === 'link' ? 'selected' : ''}>Link da internet</option>
                <option value="upload" ${source === 'upload' ? 'selected' : ''}>Upload do dispositivo</option>
            </select>
        </label>
        <label data-universe-cover-link-group ${source === 'link' ? '' : 'hidden'}>
            Link da imagem
            <input id="${prefix}-cover-link" data-universe-cover-link type="url" placeholder="https://..." value="${escapeHtml(universe?.cover_url || '')}">
            <small class="muted">Prefira links HTTPS diretos para imagens.</small>
        </label>
        <div data-universe-cover-file-group ${source === 'upload' ? '' : 'hidden'}>
            <label>Escolher imagem (até 5 MB)
                <input id="${prefix}-cover-file" data-universe-cover-file type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif">
            </label>
            <small class="muted">Formatos aceitos: JPG, PNG, WEBP, GIF e AVIF.</small>
        </div>
        <div class="universe-cover-preview" data-universe-cover-preview>
            ${displayUrl ? `<img src="${escapeHtml(displayUrl)}" alt="Prévia da capa do universo">` : '<span class="muted">Nenhuma capa selecionada.</span>'}
        </div>
        ${renderUniverseCoverCropControls()}
    `;
}

export async function initStoryUniverseDashboard({ writer, stories = [] }) {
    const universeGrid = document.querySelector("#writer-universe-grid");
    const requestsSection = document.querySelector("#universe-requests-section");
    const requestsList = document.querySelector("#universe-requests-list");
    const newUniverseButton = document.querySelector("#new-universe-button");
    if (!universeGrid || !requestsSection || !requestsList || !newUniverseButton) return;

    let universes = [];
    let activeUniverseId = null;
    let managerFeedback = null;
    let createCoverEditor = null;
    let managerCoverEditor = null;

    const createDialog = document.createElement("dialog");
    createDialog.className = "writer-dialog universe-dialog";
    createDialog.innerHTML = `
        <form id="create-universe-form" class="universe-create-form">
            <div class="section-heading"><div><span class="eyebrow">NOVO UNIVERSO</span><h2>Criar universo</h2></div></div>
            <p class="muted">Escolha uma história sua para ser a obra principal. Depois você poderá adicionar outras histórias e convidar escritores.</p>
            <label>Nome do universo<input id="new-universe-name" minlength="2" maxlength="100" required placeholder="Ex.: O Outro Lado"></label>
            <label>Descrição<textarea id="new-universe-description" maxlength="1200" rows="4" placeholder="Conte o que conecta essas histórias."></textarea></label>
            ${renderUniverseCoverFields('new-universe')}
            <label>Obra principal<select id="new-universe-main-story" required></select></label>
            <div class="main-nav"><button type="button" class="secondary-button" data-close-create-universe>Cancelar</button><button type="submit" class="primary-button">Criar universo</button></div>
            <p id="create-universe-feedback" class="form-message" role="status" aria-live="polite"></p>
        </form>
    `;

    const managerDialog = document.createElement("dialog");
    managerDialog.className = "writer-dialog universe-manager-dialog";
    document.body.append(createDialog, managerDialog);

    function renderCreateOptions() {
        const select = createDialog.querySelector("#new-universe-main-story");
        const ownStories = stories.filter((story) => story.collaboration_role === "owner");
        select.innerHTML = ownStories.length
            ? `<option value="">Selecione a obra principal</option>${ownStories.map((story) => `<option value="${Number(story.id)}">${escapeHtml(story.title)}</option>`).join("")}`
            : `<option value="">Você precisa ter uma história de autoria principal</option>`;
        createDialog.querySelector('button[type="submit"]').disabled = !ownStories.length;
    }

    async function loadUniverses() {
        universeGrid.innerHTML = `<article class="loading-card">Carregando universos...</article>`;
        try {
            universes = await getMyStoryUniverses();
            universeGrid.innerHTML = universes.length
                ? universes.map(renderUniverseCard).join("")
                : `<article class="empty-card">Você ainda não criou nenhum universo. Comece agrupando uma história sua e adicione outras obras depois.</article>`;
            universeGrid.querySelectorAll("[data-manage-universe]").forEach((button) => {
                button.addEventListener("click", () => openManager(Number(button.dataset.manageUniverse)));
            });
        } catch (error) {
            console.error("[Universos] Não foi possível carregar os universos:", error);
            universeGrid.innerHTML = `<article class="error-card">Não foi possível carregar os universos. Confira se a migração SQL do sistema de universos foi executada. Detalhe: ${escapeHtml(error?.message || "erro desconhecido")}</article>`;
        }
    }

    async function loadRequests() {
        try {
            const requests = await getIncomingStoryUniverseRequests();
            requestsSection.hidden = !requests.length;
            requestsList.innerHTML = requests.map(renderRequestCard).join("");
            requestsList.querySelectorAll("[data-approve-universe-request], [data-reject-universe-request]").forEach((button) => {
                button.addEventListener("click", async () => {
                    const [universeId, storyId] = String(button.dataset.approveUniverseRequest || button.dataset.rejectUniverseRequest).split(":").map(Number);
                    const approve = Boolean(button.dataset.approveUniverseRequest);
                    if (!Number.isSafeInteger(universeId) || !Number.isSafeInteger(storyId)) return;
                    button.disabled = true;
                    try {
                        await respondToStoryUniverseRequest(universeId, storyId, approve);
                        await loadRequests();
                        if (approve) await loadUniverses();
                    } catch (error) {
                        console.error("[Universos] Falha ao responder à solicitação:", error);
                        button.disabled = false;
                        const message = error?.message || "Não foi possível responder à solicitação.";
                        requestsList.insertAdjacentHTML("afterbegin", feedbackMarkup(message, "error"));
                    }
                });
            });
        } catch (error) {
            console.error("[Universos] Não foi possível carregar as solicitações:", error);
            requestsSection.hidden = false;
            requestsList.innerHTML = `<article class="error-card">Não foi possível carregar as solicitações de universo. Confira a migração SQL. ${escapeHtml(error?.message || "")}</article>`;
        }
    }

    async function openManager(universeId, feedback = null) {
        managerCoverEditor?.cleanup();
        managerCoverEditor = null;
        activeUniverseId = universeId;
        managerFeedback = feedback;
        try {
            await loadUniverses();
            const universe = universes.find((item) => Number(item.id) === Number(universeId));
            if (!universe) throw new Error("Universo não encontrado ou sem permissão de gerenciamento.");
            const entries = sortUniverseMembers(universe.story_universe_stories ?? []);
            const approvedEntries = entries.filter((entry) => entry.status === "approved");
            const linkedIds = new Set(entries.map((entry) => String(entry.story_id)));
            const availableOwnStories = stories.filter((item) => item.collaboration_role === "owner" && !linkedIds.has(String(item.id)));
            const membersMarkup = entries.length
                ? entries.map((entry, index) => renderMemberRow(entry, index, approvedEntries)).join("")
                : `<article class="empty-card">Este universo ainda não possui histórias vinculadas.</article>`;

            managerDialog.innerHTML = `
                <div class="universe-manager-content">
                    <div class="section-heading"><div><span class="eyebrow">GERENCIAR UNIVERSO</span><h2>${escapeHtml(universe.name)}</h2></div><button type="button" class="secondary-button" data-close-universe-manager aria-label="Fechar">×</button></div>
                    ${feedbackMarkup(managerFeedback?.message, managerFeedback?.type)}
                    <form id="universe-details-form" class="review-form">
                        <h3>Informações do universo</h3>
                        <label>Nome<input id="manage-universe-name" minlength="2" maxlength="100" required value="${escapeHtml(universe.name)}"></label>
                        <label>Descrição<textarea id="manage-universe-description" maxlength="1200" rows="3">${escapeHtml(universe.description || "")}</textarea></label>
                        ${renderUniverseCoverFields('manage-universe', universe)}
                        <div class="main-nav"><button type="submit" class="primary-button">Salvar informações</button><button type="button" class="secondary-button" data-remove-universe-cover ${(universe.cover_url || universe.cover_path) ? "" : "disabled"}>Remover imagem</button></div>
                        <p id="universe-details-feedback" class="form-message" role="status" aria-live="polite"></p>
                    </form>

                    <section class="universe-manager-section">
                        <div class="section-heading"><div><span class="eyebrow">ORDEM DE LEITURA</span><h3>Histórias deste universo</h3></div><span class="muted">Use ↑ e ↓ para organizar.</span></div>
                        <div class="universe-member-list">${membersMarkup}</div>
                    </section>

                    <section class="universe-manager-section">
                        <span class="eyebrow">ADICIONAR OBRA</span><h3>Adicionar uma história sua</h3>
                        <form id="add-own-universe-story-form" class="review-form">
                            <label>História<select id="universe-own-story" ${availableOwnStories.length ? "required" : "disabled"}>${availableOwnStories.length ? `<option value="">Selecione uma história</option>${availableOwnStories.map((item) => `<option value="${Number(item.id)}">${escapeHtml(item.title)}</option>`).join("")}` : `<option value="">Nenhuma história própria disponível</option>`}</select></label>
                            <label>Relação com a obra principal<select id="universe-own-relationship">${relationshipOptions()}</select></label>
                            <button type="submit" class="primary-button" ${availableOwnStories.length ? "" : "disabled"}>Adicionar história</button>
                            <p id="universe-add-own-feedback" class="form-message" role="status" aria-live="polite"></p>
                        </form>
                    </section>

                    <section class="universe-manager-section">
                        <span class="eyebrow">OUTROS ESCRITORES</span><h3>Convidar uma história de outro autor</h3>
                        <p class="muted">A história precisa estar publicada. O autor principal receberá uma solicitação e deverá aprovar a participação antes que ela apareça como parte do universo.</p>
                        <form id="search-universe-stories-form" class="universe-search-form">
                            <label for="universe-external-search">Pesquisar por título</label>
                            <div class="universe-search-row"><input id="universe-external-search" minlength="2" maxlength="160" placeholder="Digite pelo menos 2 caracteres"><button type="submit" class="secondary-button">Buscar</button></div>
                            <label>Relação proposta<select id="universe-external-relationship">${relationshipOptions()}</select></label>
                        </form>
                        <div id="universe-external-results" class="universe-external-results"></div>
                    </section>

                    <section class="universe-danger-zone">
                        <div><span class="eyebrow danger-eyebrow">ZONA DE PERIGO</span><h3>Excluir universo</h3><p class="muted">Isso remove o universo e todos os vínculos, mas não exclui nenhuma história nem seus episódios.</p></div>
                        <button type="button" class="danger-button" data-delete-universe="${Number(universe.id)}">Excluir universo</button>
                    </section>
                    <div class="main-nav universe-manager-footer"><button type="button" class="secondary-button" data-close-universe-manager>Fechar</button></div>
                </div>
            `;

            bindManager(universe);
            if (!managerDialog.open) managerDialog.showModal();
        } catch (error) {
            console.error("[Universos] Falha ao abrir o gerenciador:", error);
            managerDialog.innerHTML = `<div class="universe-manager-content"><h2>Não foi possível abrir o universo</h2><p class="form-message error">${escapeHtml(error?.message || "Erro desconhecido")}</p><button type="button" class="secondary-button" data-close-universe-manager>Fechar</button></div>`;
            if (!managerDialog.open) managerDialog.showModal();
            managerDialog.querySelectorAll("[data-close-universe-manager]").forEach((button) => button.addEventListener("click", () => managerDialog.close()));
        }
    }

    function bindManager(universe) {
        managerDialog.querySelectorAll("[data-close-universe-manager]").forEach((button) => button.addEventListener("click", () => managerDialog.close()));
        managerCoverEditor = bindUniverseCoverEditor(managerDialog, universe);

        managerDialog.querySelector("#universe-details-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const feedback = managerDialog.querySelector("#universe-details-feedback");
            const button = event.currentTarget.querySelector('button[type="submit"]');
            button.disabled = true;
            feedback.textContent = "Salvando informações...";
            let uploadedPath = null;
            try {
                const source = managerCoverEditor.getSource();
                const selectedFile = managerCoverEditor.getSelectedFile();
                const previousPath = universe.cover_path || null;
                let coverUrl = null;
                let nextCoverPath = source === "upload" ? previousPath : null;

                if (source === "link") {
                    coverUrl = managerCoverEditor.getLink();
                    if (!/^https:\/\//i.test(coverUrl)) throw new Error("Informe um link HTTPS direto para a capa.");
                } else if (source === "upload") {
                    if (managerCoverEditor.isCropOpen()) {
                        const croppedFile = await managerCoverEditor.createCroppedFile();
                        uploadedPath = await uploadStoryUniverseCover(universe.id, croppedFile);
                        nextCoverPath = uploadedPath;
                    } else if (selectedFile) {
                        uploadedPath = await uploadStoryUniverseCover(universe.id, selectedFile);
                        nextCoverPath = uploadedPath;
                    } else if (!previousPath) {
                        throw new Error("Selecione uma imagem para enviar ou escolha outra origem para a capa.");
                    }
                } else {
                    nextCoverPath = null;
                }

                await updateStoryUniverseDetails(universe.id, {
                    name: managerDialog.querySelector("#manage-universe-name").value,
                    description: managerDialog.querySelector("#manage-universe-description").value,
                    coverUrl,
                });

                if (source !== "upload" || uploadedPath) {
                    await setStoryUniverseCoverPath(universe.id, nextCoverPath);
                }

                if (previousPath && previousPath !== nextCoverPath) {
                    try { await removeStoryUniverseCover(previousPath); }
                    catch (cleanupError) { console.warn("[Universos] A capa anterior não pôde ser removida do Storage:", cleanupError); }
                }

                await loadUniverses();
                await openManager(universe.id, { message: "Informações do universo atualizadas.", type: "success" });
            } catch (error) {
                if (uploadedPath) {
                    try { await removeStoryUniverseCover(uploadedPath); } catch (cleanupError) { console.warn("[Universos] Não foi possível limpar o upload incompleto:", cleanupError); }
                }
                feedback.textContent = error?.message || "Não foi possível salvar as informações.";
                feedback.className = "form-message error";
                button.disabled = false;
            }
        });

        managerDialog.querySelector("[data-remove-universe-cover]")?.addEventListener("click", async (event) => {
            event.currentTarget.disabled = true;
            try {
                await updateStoryUniverseDetails(universe.id, {
                    name: managerDialog.querySelector("#manage-universe-name").value,
                    description: managerDialog.querySelector("#manage-universe-description").value,
                    coverUrl: null,
                });
                await setStoryUniverseCoverPath(universe.id, null);
                if (universe.cover_path) {
                    try { await removeStoryUniverseCover(universe.cover_path); }
                    catch (cleanupError) { console.warn("[Universos] A capa removida do banco permaneceu no Storage:", cleanupError); }
                }
                await openManager(universe.id, { message: "Imagem removida.", type: "success" });
            } catch (error) {
                const feedback = managerDialog.querySelector("#universe-details-feedback");
                if (feedback) {
                    feedback.textContent = error?.message || "Não foi possível remover a imagem.";
                    feedback.className = "form-message error";
                }
                event.currentTarget.disabled = false;
            }
        });

        managerDialog.querySelector("#add-own-universe-story-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const feedback = managerDialog.querySelector("#universe-add-own-feedback");
            const button = event.currentTarget.querySelector('button[type="submit"]');
            const storyId = Number(managerDialog.querySelector("#universe-own-story").value);
            if (!Number.isSafeInteger(storyId) || storyId <= 0) return;
            button.disabled = true;
            feedback.textContent = "Adicionando história...";
            try {
                await addStoryToUniverse(universe.id, storyId, managerDialog.querySelector("#universe-own-relationship").value);
                await openManager(universe.id, { message: "História adicionada ao universo.", type: "success" });
            } catch (error) {
                feedback.textContent = error?.message || "Não foi possível adicionar a história.";
                feedback.className = "form-message error";
                button.disabled = false;
            }
        });

        managerDialog.querySelector("#search-universe-stories-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const resultContainer = managerDialog.querySelector("#universe-external-results");
            const query = managerDialog.querySelector("#universe-external-search").value.trim();
            if (query.length < 2) {
                resultContainer.innerHTML = feedbackMarkup("Digite pelo menos 2 caracteres para pesquisar.", "error");
                return;
            }
            resultContainer.innerHTML = `<p class="muted">Pesquisando histórias publicadas...</p>`;
            try {
                const results = await searchPublishedStoriesForUniverse(query, writer.writer_id);
                const memberIds = new Set((universe.story_universe_stories ?? []).map((entry) => String(entry.story_id)));
                const available = results.filter((result) => !memberIds.has(String(result.id)));
                resultContainer.innerHTML = available.length
                    ? available.map((result) => `
                        <article class="universe-search-result">
                            <div><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(result.writers?.name || result.writers?.username || "Escritor")}${result.writers?.username ? ` · @${escapeHtml(result.writers.username)}` : ""}</small></div>
                            <button type="button" class="secondary-button" data-request-universe-story="${Number(result.id)}">Solicitar inclusão</button>
                        </article>
                    `).join("")
                    : `<article class="empty-card">Nenhuma história publicada disponível foi encontrada.</article>`;
                resultContainer.querySelectorAll("[data-request-universe-story]").forEach((button) => {
                    button.addEventListener("click", async () => {
                        const targetId = Number(button.dataset.requestUniverseStory);
                        button.disabled = true;
                        try {
                            await addStoryToUniverse(universe.id, targetId, managerDialog.querySelector("#universe-external-relationship").value);
                            await openManager(universe.id, { message: "Solicitação enviada. A história será adicionada quando o autor principal aprovar.", type: "success" });
                        } catch (error) {
                            button.disabled = false;
                            resultContainer.insertAdjacentHTML("afterbegin", feedbackMarkup(error?.message || "Não foi possível enviar a solicitação.", "error"));
                        }
                    });
                });
            } catch (error) {
                resultContainer.innerHTML = feedbackMarkup(error?.message || "Não foi possível pesquisar histórias.", "error");
            }
        });

        managerDialog.querySelectorAll("[data-set-universe-main]").forEach((button) => {
            button.addEventListener("click", async () => {
                const targetId = Number(button.dataset.setUniverseMain);
                button.disabled = true;
                try {
                    await setStoryUniverseMain(universe.id, targetId);
                    await openManager(universe.id, { message: "Obra principal atualizada.", type: "success" });
                } catch (error) {
                    button.disabled = false;
                    await openManager(universe.id, { message: error?.message || "Não foi possível definir a obra principal.", type: "error" });
                }
            });
        });

        managerDialog.querySelectorAll("[data-move-story]").forEach((button) => {
            button.addEventListener("click", async () => {
                const targetId = Number(button.dataset.moveStory);
                const direction = button.dataset.direction;
                button.disabled = true;
                try {
                    await moveStoryInUniverse(universe.id, targetId, direction);
                    await openManager(universe.id);
                } catch (error) {
                    button.disabled = false;
                    await openManager(universe.id, { message: error?.message || "Não foi possível alterar a ordem.", type: "error" });
                }
            });
        });

        managerDialog.querySelectorAll("[data-remove-story]").forEach((button) => {
            button.addEventListener("click", () => {
                const targetId = Number(button.dataset.removeStory);
                const title = button.dataset.storyTitle || "esta história";
                openConfirmModal({
                    eyebrow: "UNIVERSO",
                    title: "Remover história?",
                    message: `Remover <strong>${escapeHtml(title)}</strong> deste universo?`,
                    details: "A história, suas temporadas e seus episódios continuarão existindo normalmente.",
                    confirmLabel: "Remover do universo",
                    onConfirm: async () => {
                        await removeStoryFromUniverse(universe.id, targetId);
                        await openManager(universe.id, { message: "História removida do universo.", type: "success" });
                    },
                });
            });
        });

        managerDialog.querySelector("[data-delete-universe]")?.addEventListener("click", () => {
            openConfirmModal({
                eyebrow: "ZONA DE PERIGO",
                title: "Excluir este universo?",
                message: `Excluir permanentemente <strong>${escapeHtml(universe.name)}</strong>?`,
                details: "Somente o agrupamento será excluído. As histórias e os episódios não serão apagados.",
                confirmLabel: "Excluir universo",
                danger: true,
                onConfirm: async () => {
                    await deleteStoryUniverse(universe.id);
                    if (universe.cover_path) {
                        try { await removeStoryUniverseCover(universe.cover_path); }
                        catch (cleanupError) { console.warn("[Universos] O universo foi excluído, mas a capa permaneceu no Storage:", cleanupError); }
                    }
                    managerDialog.close();
                    await loadUniverses();
                    await loadRequests();
                },
            });
        });
    }

    newUniverseButton.disabled = !stories.some((story) => story.collaboration_role === "owner");
    newUniverseButton.title = newUniverseButton.disabled
        ? "Você precisa ter uma história de autoria principal para iniciar um universo."
        : "Criar um universo começando por uma das suas histórias.";
    renderCreateOptions();

    createCoverEditor = bindUniverseCoverEditor(createDialog, {}, { persistent: true });
    newUniverseButton.addEventListener("click", () => {
        createDialog.querySelector("#create-universe-form").reset();
        createDialog.querySelector("#create-universe-feedback").textContent = "";
        createCoverEditor.reset();
        createDialog.querySelector("#new-universe-cover-source").value = "none";
        createDialog.querySelector("#new-universe-cover-source").dispatchEvent(new Event("change"));
        renderCreateOptions();
        createDialog.showModal();
    });

    createDialog.querySelector("[data-close-create-universe]").addEventListener("click", () => createDialog.close());
    createDialog.querySelector("#create-universe-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const feedback = createDialog.querySelector("#create-universe-feedback");
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        feedback.textContent = "Criando universo...";
        let createdId = null;
        try {
            const source = createCoverEditor.getSource();
            const selectedFile = createCoverEditor.getSelectedFile();
            let coverUrl = null;
            let uploadFile = null;
            if (source === "link") {
                coverUrl = createCoverEditor.getLink();
                if (!/^https:\/\//i.test(coverUrl)) throw new Error("Informe um link HTTPS direto para a capa.");
            } else if (source === "upload") {
                if (createCoverEditor.isCropOpen()) uploadFile = await createCoverEditor.createCroppedFile();
                else if (selectedFile) uploadFile = selectedFile;
                else throw new Error("Selecione uma imagem para enviar ou escolha outra origem para a capa.");
            }

            createdId = await createStoryUniverse({
                storyId: createDialog.querySelector("#new-universe-main-story").value,
                name: createDialog.querySelector("#new-universe-name").value,
                description: createDialog.querySelector("#new-universe-description").value,
                coverUrl,
            });

            let coverWarning = null;
            if (uploadFile) {
                let uploadedPath = null;
                try {
                    uploadedPath = await uploadStoryUniverseCover(createdId, uploadFile);
                    await setStoryUniverseCoverPath(createdId, uploadedPath);
                } catch (uploadError) {
                    if (uploadedPath) {
                        try { await removeStoryUniverseCover(uploadedPath); } catch (cleanupError) { console.warn("[Universos] Não foi possível limpar a capa após falha:", cleanupError); }
                    }
                    coverWarning = `O universo foi criado, mas a capa não pôde ser enviada: ${uploadError?.message || "erro no upload"}`;
                }
            }

            createDialog.close();
            await loadUniverses();
            await openManager(createdId, coverWarning
                ? { message: coverWarning, type: "error" }
                : { message: "Universo criado com sua obra principal.", type: "success" });
        } catch (error) {
            feedback.textContent = error?.message || "Não foi possível criar o universo.";
            feedback.className = "form-message error";
            button.disabled = false;
        }
    });

    await Promise.all([loadUniverses(), loadRequests()]);
}
