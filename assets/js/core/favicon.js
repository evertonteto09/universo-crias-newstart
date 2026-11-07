import { EMOJI_CATALOG } from "./emoji-picker.js?v=20261107-tab-icons-1";

const SITE_IMAGE_DIRECTORY = new URL("../../img/favicons/", import.meta.url);
const EMOJI_DIRECTORY = new URL("../../emojis/", import.meta.url);
const ICON_VERSION = "20261107-tab-icons-1";
const EMOJI_BY_ID = new Map(EMOJI_CATALOG.map((emoji) => [emoji.id, emoji]));
const SITE_ICON_FILES = Object.freeze({
    normal: "icon.png",
    preto: "icon-black.png",
    branco: "icon-white.png",
});
const DARK_THEMES = new Set(["preto", "vermelho", "ciano"]);
const LIGHT_THEMES = new Set(["branco", "amarelo", "roxo"]);

let fallbackHref = "";
let storyOverrideHref = "";

function ensureFaviconLink() {
    let link = document.querySelector('link[data-universo-favicon="true"]')
        || document.querySelector('link[rel~="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.append(link);
    }
    link.dataset.universoFavicon = "true";
    return link;
}

function updateFaviconLink(href) {
    if (!href) return;
    const link = ensureFaviconLink();
    const isSvg = href.startsWith("data:image/svg+xml");
    link.type = isSvg ? "image/svg+xml" : "image/png";
    if (isSvg) link.removeAttribute("sizes");
    else link.sizes = "any";
    link.href = href;
}

function siteVariantForTheme(theme, customVariant = "normal") {
    if (theme === "personalizado") {
        return Object.hasOwn(SITE_ICON_FILES, customVariant) ? customVariant : "normal";
    }
    if (DARK_THEMES.has(theme)) return "branco";
    if (LIGHT_THEMES.has(theme)) return "preto";
    // Neblina é o tema intermediário/neutro e preserva o símbolo colorido.
    return "normal";
}

export function getSiteFaviconUrl(theme = "neblina", customVariant = "normal") {
    const variant = siteVariantForTheme(theme, customVariant);
    const url = new URL(SITE_ICON_FILES[variant], SITE_IMAGE_DIRECTORY);
    url.searchParams.set("v", ICON_VERSION);
    return url.href;
}

export function applySiteFavicon(theme = "neblina", customVariant = "normal") {
    fallbackHref = getSiteFaviconUrl(theme, customVariant);
    if (!storyOverrideHref) updateFaviconLink(fallbackHref);
    return fallbackHref;
}

function isSingleNativeEmoji(value) {
    const emoji = String(value ?? "").trim();
    if (!emoji || emoji.length > 64 || /\s/u.test(emoji)) return false;

    if (typeof Intl?.Segmenter === "function") {
        const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(emoji)];
        if (graphemes.length !== 1) return false;
    } else if ([...emoji].length > 16) {
        return false;
    }

    return /\p{Extended_Pictographic}/u.test(emoji)
        || /\p{Regional_Indicator}{2}/u.test(emoji)
        || /^(?:[#*0-9])\uFE0F?\u20E3$/u.test(emoji);
}

export function normalizeStoryFavicon(value) {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;

    const siteMatch = raw.match(/^site:(\d{16,20})$/);
    if (siteMatch && EMOJI_BY_ID.has(siteMatch[1])) return `site:${siteMatch[1]}`;

    if (raw.startsWith("unicode:")) {
        const emoji = raw.slice("unicode:".length).trim();
        if (isSingleNativeEmoji(emoji)) return `unicode:${emoji}`;
    }
    return null;
}

function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
    })[character]);
}

export function getStoryFaviconUrl(value) {
    const normalized = normalizeStoryFavicon(value);
    if (!normalized) return "";

    if (normalized.startsWith("site:")) {
        const emoji = EMOJI_BY_ID.get(normalized.slice("site:".length));
        if (!emoji) return "";
        const url = new URL(emoji.file, EMOJI_DIRECTORY);
        url.searchParams.set("v", ICON_VERSION);
        return url.href;
    }

    const emoji = normalized.slice("unicode:".length);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><text x="50%" y="53%" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="52">${escapeXml(emoji)}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function setStoryFavicon(value) {
    const normalized = normalizeStoryFavicon(value);
    storyOverrideHref = normalized ? getStoryFaviconUrl(normalized) : "";
    updateFaviconLink(storyOverrideHref || fallbackHref || getSiteFaviconUrl());
    return Boolean(storyOverrideHref);
}
