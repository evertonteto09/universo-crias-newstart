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
} from "../services/story-universe.service.js?v=20261107-story-universe-covers-2";

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

function bindUniverseCoverSource(scope) {
    const source = scope.querySelector("[data-universe-cover-source]");
    const fileGroup = scope.querySelector("[data-universe-cover-file-group]");
    const linkGroup = scope.querySelector("[data-universe-cover-link-group]");
    if (!source || !fileGroup || !linkGroup) return;

    const update = () => {
        const useFile = source.value === "upload";
        fileGroup.hidden = !useFile;
        linkGroup.hidden = useFile;
    };
    source.addEventListener("change", update);
    update();
}

function bindUniverseCoverPreview(scope) {
    const input = scope.querySelector("[data-universe-cover-file]");
    const preview = scope.querySelector("[data-universe-cover-preview]");
    if (!input || !preview) return;
    let objectUrl = null;
    input.addEventListener("change", () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        const file = input.files?.[0];
        if (!file) return;
        objectUrl = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${objectUrl}" alt="Prévia da nova capa do universo">`;
    });
    scope.addEventListener("close", () => {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
    });
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

export async function initStoryUniverseDashboard({ writer, stories = [] }) {
    const universeGrid = document.querySelector("#writer-universe-grid");
    const requestsSection = document.querySelector("#universe-requests-section");
    const requestsList = document.querySelector("#universe-requests-list");
    const newUniverseButton = document.querySelector("#new-universe-button");
    if (!universeGrid || !requestsSection || !requestsList || !newUniverseButton) return;

    let universes = [];
    let activeUniverseId = null;
    let managerFeedback = null;

    const createDialog = document.createElement("dialog");
    createDialog.className = "writer-dialog universe-dialog";
    createDialog.innerHTML = `
        <form id="create-universe-form" class="review-form">
            <div class="section-heading"><div><span class="eyebrow">NOVO UNIVERSO</span><h2>Criar universo</h2></div></div>
            <p class="muted">Escolha uma história sua para ser a obra principal. Depois você poderá adicionar outras histórias e convidar escritores.</p>
            <label>Nome do universo<input id="new-universe-name" minlength="2" maxlength="100" required placeholder="Ex.: O Outro Lado"></label>
            <label>Descrição<textarea id="new-universe-description" maxlength="1200" rows="4" placeholder="Conte o que conecta essas histórias."></textarea></label>
            <label>Origem da capa<select id="new-universe-cover-source" data-universe-cover-source><option value="upload">Enviar arquivo do dispositivo</option><option value="link">Usar link externo HTTPS</option></select></label>
            <div data-universe-cover-file-group>
                <label>Capa do universo (até 5 MB)<input id="new-universe-cover-file" data-universe-cover-file type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"></label>
                <small class="muted">Formatos aceitos: JPG, PNG, WEBP, GIF e AVIF. Você também pode adicionar a capa depois.</small>
            </div>
            <div data-universe-cover-link-group hidden><label>Link HTTPS da capa<input id="new-universe-cover" type="url" placeholder="https://exemplo.com/capa.jpg"></label></div>
            <div class="universe-cover-preview" data-universe-cover-preview><span class="muted">Nenhuma capa selecionada.</span></div>
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
                        <label>Origem da capa<select id="manage-universe-cover-source" data-universe-cover-source><option value="upload" ${(universe.cover_path || !universe.cover_url) ? "selected" : ""}>Enviar arquivo do dispositivo</option><option value="link" ${universe.cover_url ? "selected" : ""}>Usar link externo HTTPS</option></select></label>
                        <div data-universe-cover-file-group>
                            <label>Enviar nova capa (até 5 MB)<input id="manage-universe-cover-file" data-universe-cover-file type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"></label>
                            <small class="muted">Formatos aceitos: JPG, PNG, WEBP, GIF e AVIF. Se não selecionar outro arquivo, a capa atual será mantida.</small>
                        </div>
                        <div data-universe-cover-link-group hidden><label>Link HTTPS da capa<input id="manage-universe-cover" type="url" value="${escapeHtml(universe.cover_url || "")}" placeholder="https://exemplo.com/capa.jpg"></label></div>
                        <div class="universe-cover-preview" data-universe-cover-preview>${universe.cover_display_url ? `<img src="${escapeHtml(universe.cover_display_url)}" alt="Prévia da capa do universo">` : `<span class="muted">Nenhuma imagem definida.</span>`}</div>
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
        bindUniverseCoverSource(managerDialog);
        bindUniverseCoverPreview(managerDialog);

        managerDialog.querySelector("#universe-details-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const feedback = managerDialog.querySelector("#universe-details-feedback");
            const button = event.currentTarget.querySelector('button[type="submit"]');
            button.disabled = true;
            feedback.textContent = "Salvando informações...";
            let uploadedPath = null;
            try {
                const source = managerDialog.querySelector("#manage-universe-cover-source").value;
                const selectedFile = source === "upload" ? managerDialog.querySelector("#manage-universe-cover-file").files?.[0] : null;
                const previousPath = universe.cover_path || null;
                let coverUrl = universe.cover_url || null;

                if (source === "link") {
                    coverUrl = managerDialog.querySelector("#manage-universe-cover").value.trim() || null;
                } else if (selectedFile) {
                    uploadedPath = await uploadStoryUniverseCover(universe.id, selectedFile);
                    // Preserva a URL externa antiga até que o RPC grave o novo caminho.
                    // setStoryUniverseCoverPath limpa cover_url ao confirmar o upload.
                }

                await updateStoryUniverseDetails(universe.id, {
                    name: managerDialog.querySelector("#manage-universe-name").value,
                    description: managerDialog.querySelector("#manage-universe-description").value,
                    coverUrl,
                });

                if (source === "link") {
                    await setStoryUniverseCoverPath(universe.id, null);
                } else if (uploadedPath) {
                    await setStoryUniverseCoverPath(universe.id, uploadedPath);
                }

                if (previousPath && (source === "link" || uploadedPath) && previousPath !== uploadedPath) {
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

    bindUniverseCoverSource(createDialog);
    bindUniverseCoverPreview(createDialog);
    newUniverseButton.addEventListener("click", () => {
        createDialog.querySelector("#create-universe-form").reset();
        createDialog.querySelector("#create-universe-feedback").textContent = "";
        createDialog.querySelector("[data-universe-cover-preview]").innerHTML = `<span class="muted">Nenhuma capa selecionada.</span>`;
        renderCreateOptions();
        createDialog.querySelector("#new-universe-cover-source").value = "upload";
        createDialog.querySelector("#new-universe-cover-source").dispatchEvent(new Event("change"));
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
            const source = createDialog.querySelector("#new-universe-cover-source").value;
            const file = source === "upload" ? createDialog.querySelector("#new-universe-cover-file").files?.[0] : null;
            createdId = await createStoryUniverse({
                storyId: createDialog.querySelector("#new-universe-main-story").value,
                name: createDialog.querySelector("#new-universe-name").value,
                description: createDialog.querySelector("#new-universe-description").value,
                coverUrl: source === "link" ? createDialog.querySelector("#new-universe-cover").value : null,
            });

            let coverWarning = null;
            if (file) {
                let uploadedPath = null;
                try {
                    uploadedPath = await uploadStoryUniverseCover(createdId, file);
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
