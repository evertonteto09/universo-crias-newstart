const STORAGE_KEY = "universo-crias:reading-bookmarks:v1";
const MAX_ANCHOR_LENGTH = 12000;
const CONTEXT_LENGTH = 120;

function readAllBookmarks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }

        return parsed;
    } catch (error) {
        console.warn("Não foi possível ler os marcadores locais de leitura.", error);
        return {};
    }
}

export function getReadingBookmark(storyId) {
    if (storyId === null || storyId === undefined || storyId === "") {
        return null;
    }

    const bookmark = readAllBookmarks()[String(storyId)];
    if (!bookmark || typeof bookmark !== "object" || Array.isArray(bookmark)) {
        return null;
    }

    if (!bookmark.chapterId || !bookmark.anchorText) {
        return null;
    }

    return bookmark;
}

export function saveReadingBookmark(bookmark) {
    if (!bookmark?.storyId || !bookmark?.chapterId || !bookmark?.anchorText) {
        return false;
    }

    const all = readAllBookmarks();
    all[String(bookmark.storyId)] = {
        version: 1,
        storyId: String(bookmark.storyId),
        chapterId: String(bookmark.chapterId),
        chapterTitle: String(bookmark.chapterTitle ?? ""),
        storySlug: String(bookmark.storySlug ?? ""),
        seasonNumber: Number(bookmark.seasonNumber ?? 1),
        episodeNumber: Number(bookmark.episodeNumber ?? 1),
        anchorText: String(bookmark.anchorText).slice(0, MAX_ANCHOR_LENGTH),
        previousText: String(bookmark.previousText ?? "").slice(-CONTEXT_LENGTH),
        nextText: String(bookmark.nextText ?? "").slice(0, CONTEXT_LENGTH),
        paragraphIndex: Math.max(0, Number(bookmark.paragraphIndex) || 0),
        savedAt: bookmark.savedAt || new Date().toISOString(),
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        return true;
    } catch (error) {
        console.warn("Não foi possível salvar o marcador local de leitura.", error);
        return false;
    }
}

export function removeReadingBookmark(storyId) {
    if (storyId === null || storyId === undefined || storyId === "") {
        return false;
    }

    const all = readAllBookmarks();
    delete all[String(storyId)];

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        return true;
    } catch (error) {
        console.warn("Não foi possível remover o marcador local de leitura.", error);
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
    if (!bookmark || !blocks.length) {
        return { status: "stale", element: null, index: -1 };
    }

    const savedText = normalizeText(bookmark.anchorText);
    if (!savedText) {
        return { status: "stale", element: null, index: -1 };
    }

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
            let contextSignals = 0;

            if (bookmark.previousText) {
                contextSignals += 1;
                if (index > 0 && textMatchesPrevious(currentTexts[index - 1], bookmark.previousText)) {
                    score += 1;
                }
            }

            if (bookmark.nextText) {
                contextSignals += 1;
                if (index < currentTexts.length - 1 && textMatchesNext(currentTexts[index + 1], bookmark.nextText)) {
                    score += 1;
                }
            }

            return { index, score, contextSignals };
        }).sort((a, b) => b.score - a.score);

        if (scored[0].score > 0 && scored[0].score > scored[1].score) {
            const index = scored[0].index;
            return { status: "exact", element: blocks[index], index };
        }

        return { status: "stale", element: null, index: -1 };
    }

    // Se o texto marcado foi editado, somente sugerimos um ponto aproximado
    // quando os dois parágrafos vizinhos ainda delimitam exatamente um bloco.
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
                const between = nextIndex - previousIndex - 1;
                if (between === 1) possible.add(previousIndex + 1);
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

function renderToolbar(toolbar, { bookmark, chapter, match, otherChapter }) {
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
        message.textContent = "Marque o ponto onde você parou usando o quadradinho ao lado de qualquer parágrafo.";
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

/**
 * Adiciona controles de marcador aos blocos de texto de um episódio.
 * O texto de âncora vem da fonte original, não do texto filtrado exibido.
 */
export function setupReadingBookmarkUI({ root, toolbar, story, season, chapter }) {
    if (!root || !toolbar || !story?.id || !chapter?.id) {
        return () => {};
    }

    const refresh = () => {
        const bookmark = getReadingBookmark(story.id);
        const blocks = getReadingBlocks(root);
        const isSameChapter = bookmark && String(bookmark.chapterId) === String(chapter.id);
        const match = isSameChapter
            ? findBookmarkMatch(blocks, bookmark)
            : { status: "none", element: null, index: -1 };

        blocks.forEach((block, index) => {
            block.classList.add("reading-bookmarkable");
            block.classList.remove("reading-bookmark-active", "reading-bookmark-suggestion");
            block.dataset.readingIndex = String(index);
            block.querySelectorAll(":scope > .reading-bookmark-action").forEach((button) => button.remove());

            const isActive = match.status === "exact" && match.element === block;
            const isSuggestion = match.status === "approximate" && match.element === block;
            if (isActive) block.classList.add("reading-bookmark-active");
            if (isSuggestion) block.classList.add("reading-bookmark-suggestion");

            const label = isActive
                ? "Este é seu ponto de leitura salvo. Clique novamente para remover o marcador."
                : isSuggestion
                    ? "Este trecho é uma sugestão aproximada para o ponto de leitura. Clique para confirmar."
                    : "Marcar este trecho como ponto de leitura";
            const action = makeButton(
                `reading-bookmark-action${isActive ? " is-active" : ""}${isSuggestion ? " is-suggestion" : ""}`,
                label,
                "",
            );
            action.setAttribute("aria-pressed", String(isActive));
            action.addEventListener("click", () => {
                const freshBlocks = getReadingBlocks(root);
                const freshIndex = freshBlocks.indexOf(block);
                if (freshIndex < 0) return;

                // O quadradinho selecionado funciona como alternância:
                // clicar nele novamente remove o marcador desta história.
                if (isActive) {
                    const removed = removeReadingBookmark(story.id);
                    if (!removed) {
                        setStorageError();
                        return;
                    }
                    refresh();
                    return;
                }

                saveFromBlock(block, freshBlocks, freshIndex);
            });
            block.prepend(action);
        });

        renderToolbar(toolbar, {
            bookmark,
            chapter,
            match,
            otherChapter: bookmark && !isSameChapter,
        });

        toolbar.querySelector('[data-reading-bookmark-action="remove"]')?.addEventListener("click", () => {
            const removed = removeReadingBookmark(story.id);
            if (!removed) {
                setStorageError();
                return;
            }
            refresh();
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

        toolbar.querySelector('[data-reading-bookmark-action="confirm-approximate"]')?.addEventListener("click", () => {
            if (match.element) {
                const freshBlocks = getReadingBlocks(root);
                const freshIndex = freshBlocks.indexOf(match.element);
                if (freshIndex >= 0) saveFromBlock(match.element, freshBlocks, freshIndex);
            }
        });

        return { bookmark, match };
    };

    const setStorageError = () => {
        toolbar.replaceChildren();
        const message = document.createElement("p");
        message.className = "reading-bookmark-message is-warning";
        message.textContent = "Não foi possível acessar o armazenamento local deste navegador. O ponto de leitura não foi alterado.";
        toolbar.append(message);
    };

    const saveFromBlock = (block, blocks, index) => {
        const anchorText = blockText(block);
        if (!anchorText) return;

        const previousText = index > 0 ? blockText(blocks[index - 1]).slice(-CONTEXT_LENGTH) : "";
        const nextText = index < blocks.length - 1 ? blockText(blocks[index + 1]).slice(0, CONTEXT_LENGTH) : "";
        const saved = saveReadingBookmark({
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
            setStorageError();
            return;
        }

        refresh();
    };

    refresh();
    return refresh;
}
