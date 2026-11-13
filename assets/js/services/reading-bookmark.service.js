import { supabase } from "../core/supabase.js";

const STORAGE_KEY = "universo-crias:reading-bookmarks:v1";
const TABLE_NAME = "reading_bookmarks";
const MAX_ANCHOR_LENGTH = 12000;
const CONTEXT_LENGTH = 120;

let cachedUserId = null;
let cachedUserBookmarks = new Map();
let userBookmarksLoaded = false;
let userBookmarksLoading = null;

function normalizeBookmark(bookmark, storyIdOverride = null) {
    if (!bookmark || typeof bookmark !== "object" || Array.isArray(bookmark)) return null;

    const storyId = String(storyIdOverride ?? bookmark.storyId ?? "");
    const chapterId = String(bookmark.chapterId ?? "");
    const anchorText = String(bookmark.anchorText ?? "").slice(0, MAX_ANCHOR_LENGTH);
    if (!storyId || !chapterId || !anchorText.trim()) return null;

    const savedAt = typeof bookmark.savedAt === "string" && Number.isFinite(Date.parse(bookmark.savedAt))
        ? new Date(bookmark.savedAt).toISOString()
        : new Date(0).toISOString();
    const rawSeasonNumber = Number(bookmark.seasonNumber ?? 1);
    const rawEpisodeNumber = Number(bookmark.episodeNumber ?? 1);

    return {
        version: 1,
        storyId,
        chapterId,
        chapterTitle: String(bookmark.chapterTitle ?? "").slice(0, 300),
        storySlug: String(bookmark.storySlug ?? "").slice(0, 200),
        seasonNumber: Number.isFinite(rawSeasonNumber) && rawSeasonNumber >= 0 ? rawSeasonNumber : 1,
        episodeNumber: Number.isFinite(rawEpisodeNumber) && rawEpisodeNumber >= 0 ? rawEpisodeNumber : 1,
        anchorText,
        previousText: String(bookmark.previousText ?? "").slice(-CONTEXT_LENGTH),
        nextText: String(bookmark.nextText ?? "").slice(0, CONTEXT_LENGTH),
        paragraphIndex: Math.max(0, Number(bookmark.paragraphIndex) || 0),
        savedAt,
    };
}

function readAllLocalBookmarks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed;
    } catch (error) {
        console.warn("Não foi possível ler os marcadores locais de leitura.", error);
        return {};
    }
}

function writeAllLocalBookmarks(bookmarks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
        return true;
    } catch (error) {
        console.warn("Não foi possível salvar os marcadores locais de leitura.", error);
        return false;
    }
}

function getLocalBookmark(storyId) {
    const raw = readAllLocalBookmarks()[String(storyId)];
    return normalizeBookmark(raw, storyId);
}

function saveLocalBookmark(bookmark) {
    const all = readAllLocalBookmarks();
    all[String(bookmark.storyId)] = bookmark;
    return writeAllLocalBookmarks(all);
}

function removeLocalBookmark(storyId) {
    const all = readAllLocalBookmarks();
    delete all[String(storyId)];
    return writeAllLocalBookmarks(all);
}

function bookmarkTime(bookmark) {
    const value = Date.parse(bookmark?.savedAt ?? "");
    return Number.isFinite(value) ? value : 0;
}

async function getSignedInUser() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session?.user ?? null;
}

function resetUserBookmarkCache(userId) {
    cachedUserId = userId;
    cachedUserBookmarks = new Map();
    userBookmarksLoaded = false;
    userBookmarksLoading = null;
}

async function ensureUserBookmarksLoaded(user) {
    if (cachedUserId !== user.id) resetUserBookmarkCache(user.id);
    if (userBookmarksLoaded) return;
    if (userBookmarksLoading) return userBookmarksLoading;

    userBookmarksLoading = (async () => {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select("story_id, bookmark, updated_at")
            .eq("user_id", user.id);

        if (error) throw error;

        const merged = new Map();
        for (const row of data ?? []) {
            const bookmark = normalizeBookmark(row.bookmark, row.story_id);
            if (bookmark) merged.set(String(row.story_id), bookmark);
        }

        const localBookmarks = readAllLocalBookmarks();
        const pendingUpserts = [];

        for (const [storyId, rawBookmark] of Object.entries(localBookmarks)) {
            const localBookmark = normalizeBookmark(rawBookmark, storyId);
            if (!localBookmark) continue;

            const cloudBookmark = merged.get(String(storyId));
            if (!cloudBookmark || bookmarkTime(localBookmark) > bookmarkTime(cloudBookmark)) {
                merged.set(String(storyId), localBookmark);
                pendingUpserts.push({
                    user_id: user.id,
                    story_id: String(storyId),
                    bookmark: localBookmark,
                    updated_at: localBookmark.savedAt,
                });
            }
        }

        if (pendingUpserts.length) {
            const { error: upsertError } = await supabase
                .from(TABLE_NAME)
                .upsert(pendingUpserts, { onConflict: "user_id,story_id" });
            if (upsertError) throw upsertError;
        }

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (storageError) {
            console.warn("Os marcadores foram sincronizados, mas o cache local não pôde ser limpo.", storageError);
        }

        cachedUserBookmarks = merged;
        userBookmarksLoaded = true;
    })();

    try {
        await userBookmarksLoading;
    } finally {
        userBookmarksLoading = null;
    }
}

export async function getReadingBookmark(storyId) {
    if (storyId === null || storyId === undefined || storyId === "") return null;

    const user = await getSignedInUser();
    if (!user) return getLocalBookmark(storyId);

    await ensureUserBookmarksLoaded(user);
    return cachedUserBookmarks.get(String(storyId)) ?? null;
}

export async function saveReadingBookmark(bookmark) {
    const normalized = normalizeBookmark(bookmark);
    if (!normalized) return false;

    try {
        const user = await getSignedInUser();
        if (!user) return saveLocalBookmark(normalized);

        await ensureUserBookmarksLoaded(user);
        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert({
                user_id: user.id,
                story_id: normalized.storyId,
                bookmark: normalized,
                updated_at: normalized.savedAt,
            }, { onConflict: "user_id,story_id" });

        if (error) throw error;
        cachedUserBookmarks.set(normalized.storyId, normalized);
        return true;
    } catch (error) {
        console.warn("Não foi possível salvar o marcador de leitura na conta.", error);
        return false;
    }
}

export async function removeReadingBookmark(storyId) {
    if (storyId === null || storyId === undefined || storyId === "") return false;

    try {
        const user = await getSignedInUser();
        if (!user) return removeLocalBookmark(storyId);

        await ensureUserBookmarksLoaded(user);
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq("user_id", user.id)
            .eq("story_id", String(storyId));

        if (error) throw error;
        cachedUserBookmarks.delete(String(storyId));
        return true;
    } catch (error) {
        console.warn("Não foi possível remover o marcador de leitura da conta.", error);
        return false;
    }
}

function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function blockText(block) {
    return normalizeText(block?.dataset?.readingText || "");
}

function getReadingBlocks(root) {
    if (!root) return [];

    return [...root.querySelectorAll(
        'p[data-reading-text], .dynamic-heading[data-reading-text], blockquote.dynamic-quote[data-reading-text]',
    )].filter((block) => blockText(block).length > 0);
}

function textMatchesPrevious(currentText, savedText) {
    return !savedText || currentText.endsWith(normalizeText(savedText));
}

function textMatchesNext(currentText, savedText) {
    return !savedText || currentText.startsWith(normalizeText(savedText));
}

function findBookmarkMatch(blocks, bookmark) {
    if (!bookmark || !blocks.length) return { status: "stale", element: null, index: -1 };

    const savedText = normalizeText(bookmark.anchorText);
    if (!savedText) return { status: "stale", element: null, index: -1 };

    const currentTexts = blocks.map(blockText);
    const exactIndices = [];

    currentTexts.forEach((text, index) => {
        const exact = text === savedText ||
            (savedText.length >= MAX_ANCHOR_LENGTH && text.startsWith(savedText));
        if (exact) exactIndices.push(index);
    });

    if (exactIndices.length === 1) {
        const index = exactIndices[0];
        return { status: "exact", element: blocks[index], index };
    }

    if (exactIndices.length > 1) {
        const scored = exactIndices.map((index) => {
            let score = 0;
            if (bookmark.previousText && index > 0 && textMatchesPrevious(currentTexts[index - 1], bookmark.previousText)) score += 1;
            if (bookmark.nextText && index < currentTexts.length - 1 && textMatchesNext(currentTexts[index + 1], bookmark.nextText)) score += 1;
            return { index, score };
        }).sort((a, b) => b.score - a.score);

        if (scored[0].score > 0 && scored[0].score > scored[1].score) {
            const index = scored[0].index;
            return { status: "exact", element: blocks[index], index };
        }
        return { status: "stale", element: null, index: -1 };
    }

    if (bookmark.previousText && bookmark.nextText) {
        const previousIndices = currentTexts
            .map((text, index) => textMatchesPrevious(text, bookmark.previousText) ? index : -1)
            .filter((index) => index >= 0);
        const nextIndices = currentTexts
            .map((text, index) => textMatchesNext(text, bookmark.nextText) ? index : -1)
            .filter((index) => index >= 0);

        const possible = new Set();
        for (const previousIndex of previousIndices) {
            for (const nextIndex of nextIndices) {
                if (nextIndex <= previousIndex) continue;
                if (nextIndex - previousIndex - 1 === 1) possible.add(previousIndex + 1);
            }
        }

        if (possible.size === 1) {
            const index = [...possible][0];
            return { status: "approximate", element: blocks[index], index };
        }
    }

    return { status: "stale", element: null, index: -1 };
}

function makeButton(className, label, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    return button;
}

function renderToolbar(toolbar, { bookmark, chapter, match }) {
    if (!toolbar) return;
    toolbar.replaceChildren();

    const message = document.createElement("p");
    message.className = "reading-bookmark-message";

    const addRemoveButton = () => {
        const removeButton = makeButton(
            "secondary-button reading-bookmark-remove",
            "Remover ponto de leitura salvo nesta história",
            "Remover marcador",
        );
        removeButton.dataset.readingBookmarkAction = "remove";
        toolbar.append(removeButton);
    };

    const addJumpButton = (targetMatch) => {
        if (!targetMatch?.element) return;
        const isApproximate = targetMatch.status === "approximate";
        const jumpButton = makeButton(
            "primary-button reading-bookmark-jump",
            isApproximate
                ? "Ir até a sugestão aproximada do ponto de leitura"
                : "Ir até o ponto de leitura salvo",
            isApproximate ? "Ver sugestão" : "Ir para marcação",
        );
        jumpButton.dataset.readingBookmarkAction = "jump";
        toolbar.append(jumpButton);
    };

    if (!bookmark) {
        message.textContent = "Marque o ponto onde você parou clicando diretamente no parágrafo desejado.";
        toolbar.append(message);
        return;
    }

    if (String(bookmark.chapterId) !== String(chapter.id)) {
        message.textContent = `Seu ponto atual está salvo em outro episódio${bookmark.chapterTitle ? ` (${bookmark.chapterTitle})` : ""}. Marcar um trecho aqui substituirá o marcador anterior desta história.`;
        toolbar.append(message);
        addRemoveButton();
        return;
    }

    if (match.status === "exact") {
        message.textContent = "Seu ponto de leitura está marcado neste trecho. Ele acompanha o texto mesmo quando outros parágrafos são adicionados.";
        toolbar.append(message);
        addJumpButton(match);
        addRemoveButton();
        return;
    }

    if (match.status === "approximate" && match.element) {
        message.textContent = "O parágrafo marcado foi alterado. Encontramos um ponto próximo pelos trechos ao redor; confira antes de confirmar.";
        toolbar.append(message);
        const confirm = makeButton(
            "primary-button reading-bookmark-confirm",
            "Confirmar o ponto de leitura aproximado sugerido",
            "Usar ponto aproximado",
        );
        confirm.dataset.readingBookmarkAction = "confirm-approximate";
        toolbar.append(confirm);
        addJumpButton(match);
        addRemoveButton();
        return;
    }

    message.textContent = "O trecho marcado foi alterado ou removido e não encontramos uma posição segura. Escolha outro parágrafo para criar um novo ponto ou remova este marcador.";
    message.classList.add("is-warning");
    toolbar.append(message);
    addRemoveButton();
}

export async function setupReadingBookmarkUI({ root, toolbar, story, season, chapter }) {
    if (!root || !toolbar || !story?.id || !chapter?.id) return async () => null;

    let operationInFlight = false;
    let refreshGeneration = 0;

    const isInteractiveTarget = (target, block) => {
        if (!(target instanceof Element)) return false;
        const interactive = target.closest(
            'button, a, input, select, textarea, summary, [contenteditable="true"], [data-reading-bookmark-ignore]',
        );
        return Boolean(interactive && interactive !== block);
    };

    const setStorageError = (messageText = "Não foi possível sincronizar o marcador de leitura. Verifique sua conexão e tente novamente.") => {
        toolbar.replaceChildren();
        const message = document.createElement("p");
        message.className = "reading-bookmark-message is-warning";
        message.textContent = messageText;
        toolbar.append(message);
    };

    const refresh = async () => {
        const generation = ++refreshGeneration;
        let bookmark;
        try {
            bookmark = await getReadingBookmark(story.id);
        } catch (error) {
            console.warn("Não foi possível carregar o marcador de leitura.", error);
            if (generation === refreshGeneration) {
                setStorageError("Não foi possível carregar seu marcador de leitura da conta. Verifique sua conexão e tente novamente.");
            }
            return null;
        }
        if (generation !== refreshGeneration) return null;

        const blocks = getReadingBlocks(root);
        const isSameChapter = bookmark && String(bookmark.chapterId) === String(chapter.id);
        const match = isSameChapter
            ? findBookmarkMatch(blocks, bookmark)
            : { status: "none", element: null, index: -1 };

        blocks.forEach((block, index) => {
            block.classList.add("reading-bookmarkable");
            block.classList.remove("reading-bookmark-active", "reading-bookmark-suggestion");
            block.dataset.readingIndex = String(index);

            const isActive = match.status === "exact" && match.element === block;
            const isSuggestion = match.status === "approximate" && match.element === block;
            if (isActive) block.classList.add("reading-bookmark-active");
            if (isSuggestion) block.classList.add("reading-bookmark-suggestion");

            const label = isActive
                ? "Este é seu ponto de leitura salvo. Ative novamente para remover o marcador."
                : isSuggestion
                    ? "Sugestão aproximada para seu ponto de leitura. Ative para confirmar este parágrafo."
                    : "Marcar este parágrafo como ponto de leitura";

            const hasInteractiveDescendant = Boolean(block.querySelector(
                'button, a, input, select, textarea, summary, [contenteditable="true"]',
            ));
            if (hasInteractiveDescendant) {
                block.removeAttribute("role");
                block.removeAttribute("tabindex");
                block.removeAttribute("aria-pressed");
                block.removeAttribute("aria-label");
            } else {
                block.setAttribute("role", "button");
                block.setAttribute("tabindex", "0");
                block.setAttribute("aria-pressed", String(isActive));
                block.setAttribute("aria-label", label);
            }
        });

        renderToolbar(toolbar, { bookmark, chapter, match });

        toolbar.querySelector('[data-reading-bookmark-action="remove"]')?.addEventListener("click", async () => {
            if (operationInFlight) return;
            operationInFlight = true;
            try {
                const removed = await removeReadingBookmark(story.id);
                if (!removed) {
                    setStorageError("Não foi possível remover o marcador da conta. Tente novamente.");
                    return;
                }
                await refresh();
            } finally {
                operationInFlight = false;
            }
        });

        toolbar.querySelector('[data-reading-bookmark-action="jump"]')?.addEventListener("click", () => {
            if (!match.element) return;
            const target = match.element;
            const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
            target.classList.remove("reading-bookmark-jump-highlight");
            window.requestAnimationFrame(() => target.classList.add("reading-bookmark-jump-highlight"));
            window.setTimeout(() => target.classList.remove("reading-bookmark-jump-highlight"), 1700);
        });

        toolbar.querySelector('[data-reading-bookmark-action="confirm-approximate"]')?.addEventListener("click", async () => {
            if (!match.element || operationInFlight) return;
            operationInFlight = true;
            try {
                const freshBlocks = getReadingBlocks(root);
                const freshIndex = freshBlocks.indexOf(match.element);
                if (freshIndex >= 0) await saveFromBlock(match.element, freshBlocks, freshIndex);
            } finally {
                operationInFlight = false;
            }
        });

        return { bookmark, match };
    };

    const saveFromBlock = async (block, blocks, index) => {
        const anchorText = blockText(block);
        if (!anchorText) return;

        const previousText = index > 0 ? blockText(blocks[index - 1]).slice(-CONTEXT_LENGTH) : "";
        const nextText = index < blocks.length - 1 ? blockText(blocks[index + 1]).slice(0, CONTEXT_LENGTH) : "";
        const saved = await saveReadingBookmark({
            storyId: story.id,
            chapterId: chapter.id,
            chapterTitle: chapter.title || (Number(chapter.number) === 0 ? "Piloto" : `Episódio ${chapter.number}`),
            storySlug: story.slug || "",
            seasonNumber: Number(season?.number ?? 1),
            episodeNumber: Number(chapter.number ?? 1),
            anchorText,
            previousText,
            nextText,
            paragraphIndex: index,
            savedAt: new Date().toISOString(),
        });

        if (!saved) {
            setStorageError("Não foi possível salvar o marcador. Confira sua conexão e tente novamente.");
            return;
        }
        await refresh();
    };

    const activateBlock = async (block) => {
        if (operationInFlight) return;
        operationInFlight = true;
        try {
            const freshBlocks = getReadingBlocks(root);
            const freshIndex = freshBlocks.indexOf(block);
            if (freshIndex < 0) return;

            const currentBookmark = await getReadingBookmark(story.id);
            const currentMatch = currentBookmark && String(currentBookmark.chapterId) === String(chapter.id)
                ? findBookmarkMatch(freshBlocks, currentBookmark)
                : { status: "none", element: null, index: -1 };

            if (currentMatch.status === "exact" && currentMatch.element === block) {
                const removed = await removeReadingBookmark(story.id);
                if (!removed) {
                    setStorageError("Não foi possível remover o marcador. Confira sua conexão e tente novamente.");
                    return;
                }
                await refresh();
                return;
            }

            await saveFromBlock(block, freshBlocks, freshIndex);
        } catch (error) {
            console.warn("Não foi possível atualizar o marcador de leitura.", error);
            setStorageError();
        } finally {
            operationInFlight = false;
        }
    };

    if (root.dataset.readingBookmarkEventsBound !== "true") {
        root.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            const block = target?.closest("[data-reading-text].reading-bookmarkable");
            if (!block || !root.contains(block) || isInteractiveTarget(target, block)) return;
            void activateBlock(block);
        });

        root.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            const block = target.closest("[data-reading-text].reading-bookmarkable");
            if (!block || target !== block || !root.contains(block)) return;
            event.preventDefault();
            block.click();
        });

        root.dataset.readingBookmarkEventsBound = "true";
    }

    await refresh();
    return refresh;
}