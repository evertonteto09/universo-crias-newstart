import { escapeHtml } from "./utils.js";
import { getChapterImageUrl } from "../services/storage.service.js";

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

    // Restauramos código e spoilers somente depois das demais marcações.
    return restoreTokens(text, protectedParts);
}

function renderNormalParagraph(lines) {
    if (!lines.length) return "";

    const content = lines
        .map((line) => renderDynamicInlineText(line))
        .join("<br>");

    return `<p>${content}</p>`;
}

function renderHeading(line) {
    const match = line.match(/^[\s]*(#{1,3})\s+(.+?)\s*$/);

    if (!match) return null;

    const level = match[1].length;
    const content = renderDynamicInlineText(match[2]);

    return `
        <div
            class="dynamic-heading dynamic-heading-${level}"
            role="heading"
            aria-level="${level + 1}"
        >
            ${content}
        </div>
    `;
}

async function renderImage(line) {
    const match = line.match(
        /^\s*\[\[image:([^\]\n|]+)(?:\|([^\]\n]*))?\]\]\s*$/i,
    );

    if (!match) return null;

    const source =
        String(match[1] ?? "").trim();

    const alt =
        String(match[2] ?? "Imagem da cena").trim() ||
        "Imagem da cena";

    if (!source) return null;

    let url = source;

    if (!/^https?:\/\//i.test(source)) {
        if (!source.startsWith("chapters/")) {
            return `
                <p class="dynamic-image-error" role="status">
                    Imagem da cena indisponível.
                </p>
            `;
        }

        try {
            url = await getChapterImageUrl(source);
        } catch (error) {
            console.warn(
                "Não foi possível gerar a URL da imagem da cena.",
                error,
            );
            return `
                <p class="dynamic-image-error" role="status">
                    Imagem da cena indisponível.
                </p>
            `;
        }
    }

    if (!url) {
        return `
            <p class="dynamic-image-error" role="status">
                Imagem da cena indisponível.
            </p>
        `;
    }

    let safeUrl = "";

    try {
        const parsed = new URL(url, location.href);

        if (!/^https?:$/i.test(parsed.protocol)) {
            return null;
        }

        safeUrl = parsed.href;
    } catch {
        return null;
    }

    return `
        <figure class="dynamic-scene-image">
            <img
                src="${escapeHtml(safeUrl)}"
                alt="${escapeHtml(alt)}"
                loading="lazy"
                decoding="async"
            >
        </figure>
    `;
}

function renderQuote(lines) {
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

    return `
        <blockquote class="dynamic-quote">
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
export async function renderDynamicContent(value) {
    const normalized = String(value ?? "").replaceAll("\r\n", "\n");
    const lines = normalized.split("\n");

    const output = [];
    let paragraph = [];
    let quote = null;

    const flushParagraph = () => {
        if (paragraph.length) {
            output.push(renderNormalParagraph(paragraph));
            paragraph = [];
        }
    };

    const flushQuote = () => {
        if (quote && quote.length) {
            output.push(renderQuote(quote));
        }
        quote = null;
    };

    for (const rawLine of lines) {
        const line = rawLine;
        const trimmed = line.trim();

        const image = await renderImage(line);

        if (image) {
            flushParagraph();
            output.push(image);
            continue;
        }

        if (quote) {
            quote.push(line);

            if (trimmed.endsWith(">")) {
                flushQuote();
            }

            continue;
        }

        // Uma linha iniciada por < abre um bloco destacado.
        if (/^\s*</.test(line)) {
            flushParagraph();
            quote = [line];

            if (trimmed.endsWith(">")) {
                flushQuote();
            }

            continue;
        }

        const heading = renderHeading(line);

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
            ".dynamic-spoiler",
        );

        if (!spoiler || !root.contains(spoiler)) {
            return;
        }

        const revealed =
            spoiler.classList.toggle("is-revealed");

        spoiler.setAttribute(
            "aria-expanded",
            String(revealed),
        );
    });
}
