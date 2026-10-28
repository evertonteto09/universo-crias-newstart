import { escapeHtml } from "./utils.js";
import {
    getChapterImageUrl,
    getStoryNewsImageUrl,
} from "../services/storage.service.js?v=20261028-spoiler-news-images-1";

const TOKEN_PREFIX = "@@@HDC_DYN_";

function protectMatches(text, regex, render) {
    const tokens = [];

    const replaced = text.replace(regex, (...args) => {
        const match = args[0];
        const inner = args[1] ?? "";
        const index = tokens.length;

        tokens.push(render(inner));

        return `${TOKEN_PREFIX}${index}@@@`;
    });

    return { replaced, tokens };
}

function restoreTokens(text, tokens) {
    return text.replace(
        /@@@HDC_DYN_(\d+)@@@/g,
        (_, index) => tokens[Number(index)] ?? "",
    );
}

/**
 * Renderiza as marcações inline do texto salvo no banco.
 *
 * As marcações podem ser combinadas. Exemplos:
 *  **texto**
 *  __texto__
 *  ||**texto**||
 *  **||texto||**
 *  ||__texto__||
 *  **`texto`**
 *
 * HTML enviado pelo escritor é sempre escapado antes da transformação.
 */
export function renderDynamicInlineText(value) {
    let text = escapeHtml(value);

    const protectedParts = [];

    // Código é atômico: a sintaxe dentro de `...` não é interpretada.
    let protectedResult = protectMatches(
        text,
        /`([^`\n]+?)`/g,
        (inner) =>
            `<code class="dynamic-inline-box">${inner}</code>`,
    );

    text = protectedResult.replaced;
    protectedParts.push(...protectedResult.tokens);

    // Spoiler continua protegido do parser externo, mas seu conteúdo
    // passa novamente pelo parser inline para permitir combinações.
    protectedResult = protectMatches(
        text,
        /\|\|([^|\n]+?)\|\|/g,
        (inner) => {
            const renderedInner = renderDynamicInlineText(inner);

            return `
                <button
                    type="button"
                    class="dynamic-spoiler"
                    aria-expanded="false"
                    title="Clique para revelar"
                >
                    <span class="dynamic-spoiler-text">${renderedInner}</span>
                </button>
            `;
        },
    );

    text = protectedResult.replaced;
    protectedParts.push(...protectedResult.tokens);

    // Formatações inline. Como código e spoiler estão protegidos,
    // as marcações restantes podem ser aplicadas normalmente.
    text = text.replace(
        /\*\*([^*\n]+?)\*\*/g,
        "<strong>$1</strong>",
    );

    text = text.replace(
        /__([^_\n]+?)__/g,
        "<u>$1</u>",
    );

    text = text.replace(
        /\*([^*\n]+?)\*/g,
        "<em>$1</em>",
    );

    // Restauramos código e spoilers somente depois das demais marcações.
    return restoreTokens(text, protectedParts);
}

function readingAnchorText(value) {
    return String(value ?? "")
        .replace(/^\s*#{1,3}\s+/gm, "")
        .replace(/^\s*</gm, "")
        .replace(/>\s*$/gm, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\|\|/g, "")
        .replace(/\*\*|__/g, "")
        .replace(/\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function renderNormalParagraph(lines, anchorLines = lines) {
    if (!lines.length) return "";

    const content = lines
        .map((line) => renderDynamicInlineText(line))
        .join("<br>");
    const anchor = readingAnchorText(anchorLines.join(" "));

    return `<p data-reading-text="${escapeHtml(anchor)}">${content}</p>`;
}

function renderHeading(line, anchorLine = line) {
    const match = line.match(/^[\s]*(#{1,3})\s+(.+?)\s*$/);

    if (!match) return null;

    const level = match[1].length;
    const content = renderDynamicInlineText(match[2]);
    const anchorMatch = String(anchorLine ?? "").match(/^[\s]*#{1,3}\s+(.+?)\s*$/);
    const anchor = readingAnchorText(anchorMatch?.[1] ?? match[2]);

    return `
        <div
            class="dynamic-heading dynamic-heading-${level}"
            role="heading"
            aria-level="${level + 1}"
            data-reading-text="${escapeHtml(anchor)}"
        >
            ${content}
        </div>
    `;
}

async function renderImage(line, { ignoreSpoiler = false } = {}) {
    const match = String(line ?? "").match(
        /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/i,
    );
    if (!match) return null;

    const source = String(match[1] ?? "").trim();
    const metadata = String(match[2] ?? "").split("|");
    const alt = String(metadata[0] ?? "Imagem da cena").trim() || "Imagem da cena";
    const isSpoiler = !ignoreSpoiler && metadata
        .slice(1)
        .some((item) => item.trim().toLowerCase() === "spoiler");

    if (!source) return null;

    let url = source;
    if (!/^https?:\/\//i.test(source)) {
        try {
            if (source.startsWith("chapters/")) {
                url = await getChapterImageUrl(source);
            } else if (/^stories\/\d+\/news\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(source)) {
                url = await getStoryNewsImageUrl(source);
            } else {
                return `
                    <p class="dynamic-image-error" role="status">
                        Imagem indisponível.
                    </p>
                `;
            }
        } catch (error) {
            console.warn("Não foi possível gerar a URL da imagem.", error);
            return `
                <p class="dynamic-image-error" role="status">
                    Imagem indisponível.
                </p>
            `;
        }
    }

    if (!url) {
        return `
            <p class="dynamic-image-error" role="status">
                Imagem indisponível.
            </p>
        `;
    }

    let safeUrl = "";
    try {
        const parsed = new URL(url, location.href);
        if (!/^https?:$/i.test(parsed.protocol)) return null;
        safeUrl = parsed.href;
    } catch {
        return null;
    }

    const image = `
        <img
            src="${escapeHtml(safeUrl)}"
            alt="${escapeHtml(alt)}"
            loading="lazy"
            decoding="async"
        >
    `;

    if (isSpoiler) {
        return `
            <figure class="dynamic-scene-image dynamic-scene-image-spoiler">
                <button
                    type="button"
                    class="dynamic-image-spoiler"
                    aria-expanded="false"
                    aria-label="Imagem marcada como spoiler. Clique para revelar."
                    title="Clique para revelar a imagem"
                >
                    ${image}
                    <span class="dynamic-image-spoiler-label" aria-hidden="true">SPOILER · clique para revelar</span>
                </button>
            </figure>
        `;
    }

    return `
        <figure class="dynamic-scene-image">
            ${image}
        </figure>
    `;
}

function renderQuote(lines, anchorLines = lines) {
    if (!lines.length) return "";

    const first = lines[0].replace(/^\s*</, "");
    const lastIndex = lines.length - 1;
    const last = lines[lastIndex].replace(/>\s*$/, "");

    const normalized = lines.slice();
    normalized[0] = first;
    normalized[lastIndex] = last;

    const content = normalized
        .map((line) =>
            line === ""
                ? ""
                : renderDynamicInlineText(line),
        )
        .join("<br>");
    const anchor = readingAnchorText(anchorLines.join(" "));

    return `
        <blockquote class="dynamic-quote" data-reading-text="${escapeHtml(anchor)}">
            ${content}
        </blockquote>
    `;
}

/**
 * Mantém os parágrafos separados por linhas vazias, adicionando suporte a:
 *  - # / ## / ### no início da linha;
 *  - < ... > para blocos com linha lateral;
 *  - marcações inline via renderDynamicInlineText().
 */
export async function renderDynamicContent(value, anchorValue = value, options = {}) {
    const normalized = String(value ?? "").replaceAll("\r\n", "\n");
    const anchorNormalized = String(anchorValue ?? value ?? "").replaceAll("\r\n", "\n");
    const lines = normalized.split("\n");
    const anchorLines = anchorNormalized.split("\n");
    const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);
    const firstNonEmptyLineIsImage = firstNonEmptyLineIndex >= 0 &&
        /^\s*\[\[image:[^\]\n|]+(?:\|[^\]\n]*)?\]\]\s*$/i.test(lines[firstNonEmptyLineIndex]);
    const episodeCoverLineIndex = options.episodeCover && firstNonEmptyLineIsImage
        ? firstNonEmptyLineIndex
        : -1;

    const output = [];
    let paragraph = [];
    let paragraphAnchor = [];
    let quote = null;
    let quoteAnchor = null;

    const flushParagraph = () => {
        if (paragraph.length) {
            output.push(renderNormalParagraph(paragraph, paragraphAnchor));
            paragraph = [];
            paragraphAnchor = [];
        }
    };

    const flushQuote = () => {
        if (quote && quote.length) {
            output.push(renderQuote(quote, quoteAnchor ?? quote));
        }
        quote = null;
        quoteAnchor = null;
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const anchorLine = anchorLines[lineIndex] ?? line;
        const trimmed = line.trim();

        const image = await renderImage(line, { ignoreSpoiler: lineIndex === episodeCoverLineIndex });

        if (image) {
            flushParagraph();
            output.push(image);
            continue;
        }

        if (quote) {
            quote.push(line);
            quoteAnchor.push(anchorLine);

            if (trimmed.endsWith(">")) {
                flushQuote();
            }

            continue;
        }

        // Uma linha iniciada por < abre um bloco destacado.
        if (/^\s*</.test(line)) {
            flushParagraph();
            quote = [line];
            quoteAnchor = [anchorLine];

            if (trimmed.endsWith(">")) {
                flushQuote();
            }

            continue;
        }

        const heading = renderHeading(line, anchorLine);

        if (heading) {
            flushParagraph();
            output.push(heading);
            continue;
        }

        if (trimmed === "") {
            flushParagraph();
            continue;
        }

        paragraph.push(line);
        paragraphAnchor.push(anchorLine);
    }

    flushParagraph();
    flushQuote();

    return output.join("");
}

/**
 * Usa delegação de eventos para os spoilers, evitando registrar um listener
 * em cada elemento após cada troca de conteúdo.
 */
export function bindDynamicText(root) {
    if (!root || root.dataset.dynamicTextBound === "true") {
        return;
    }

    root.dataset.dynamicTextBound = "true";

    root.addEventListener("click", (event) => {
        const spoiler = event.target.closest(
            ".dynamic-spoiler, .dynamic-image-spoiler",
        );

        if (!spoiler || !root.contains(spoiler)) return;

        const revealed = spoiler.classList.toggle("is-revealed");
        spoiler.setAttribute("aria-expanded", String(revealed));
        if (spoiler.classList.contains("dynamic-image-spoiler")) {
            spoiler.setAttribute(
                "aria-label",
                revealed ? "Imagem revelada. Clique para ocultar novamente." : "Imagem marcada como spoiler. Clique para revelar.",
            );
        }
    });
}
