import { supabase } from "../core/supabase.js";

function createServerClock(rows, requestStartedAt, responseReceivedAt) {
    const serverNowMs = Date.parse(rows?.[0]?.server_now ?? "");
    if (!Number.isFinite(serverNowMs)) return null;

    // Usa o relógio monotônico do navegador apenas para medir o tempo decorrido
    // desde a resposta. A referência inicial vem sempre do PostgreSQL.
    const roundTripMs = Math.max(0, responseReceivedAt - requestStartedAt);
    return {
        serverNowAtReceiptMs: serverNowMs + (roundTripMs / 2),
        monotonicAtReceipt: responseReceivedAt,
    };
}

function requestStarted() {
    return typeof performance !== "undefined" ? performance.now() : 0;
}

function requestFinished() {
    return typeof performance !== "undefined" ? performance.now() : 0;
}

/** Estima o horário atual do servidor usando uma amostra do banco + tempo monotônico. */
export function estimateServerNowMs(clock) {
    if (
        !clock ||
        !Number.isFinite(clock.serverNowAtReceiptMs) ||
        !Number.isFinite(clock.monotonicAtReceipt) ||
        typeof performance === "undefined"
    ) {
        return Number.NaN;
    }

    return clock.serverNowAtReceiptMs + Math.max(0, performance.now() - clock.monotonicAtReceipt);
}

export function formatPremiereCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");

    if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    if (minutes > 0) return `${pad(minutes)}m ${pad(seconds)}s`;
    return `${pad(seconds)}s`;
}

/** Formata datas públicas sempre no fuso de Brasília, independente do PC do leitor. */
export function formatBrasiliaDate(value) {
    if (value === null || value === undefined || value === "") return "Horário indisponível";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Horário indisponível";

    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

/**
 * Retorna somente metadados de pré-estreias públicas e uma amostra do relógio
 * do PostgreSQL. O conteúdo do episódio nunca é solicitado por esta função.
 */
export async function getPublicScheduledChapterPreviews(storyId) {
    const normalizedStoryId = Number(storyId);
    if (!Number.isSafeInteger(normalizedStoryId) || normalizedStoryId <= 0) {
        return { items: [], serverClock: null };
    }

    const startedAt = requestStarted();
    const { data, error } = await supabase.rpc(
        "get_public_scheduled_chapter_previews_v2",
        { target_story_id: normalizedStoryId },
    );
    const finishedAt = requestFinished();

    if (error) throw error;

    const items = Array.isArray(data) ? data : [];
    return {
        items,
        serverClock: createServerClock(items, startedAt, finishedAt),
    };
}

/**
 * Consulta o estado público de um episódio agendado sem retornar seu conteúdo.
 * O servidor informa quando o Cron realmente concluiu a publicação.
 */
export async function getPublicChapterPremiereStatus(storyId, seasonNumber, chapterNumber) {
    const normalizedStoryId = Number(storyId);
    const normalizedSeasonNumber = Number(seasonNumber);
    const normalizedChapterNumber = Number(chapterNumber);

    if (
        !Number.isSafeInteger(normalizedStoryId) || normalizedStoryId <= 0 ||
        !Number.isSafeInteger(normalizedSeasonNumber) || normalizedSeasonNumber < 0 ||
        !Number.isSafeInteger(normalizedChapterNumber) || normalizedChapterNumber < 0
    ) {
        return null;
    }

    const startedAt = requestStarted();
    const { data, error } = await supabase.rpc(
        "get_public_chapter_premiere_status",
        {
            target_story_id: normalizedStoryId,
            target_season_number: normalizedSeasonNumber,
            target_chapter_number: normalizedChapterNumber,
        },
    );
    const finishedAt = requestFinished();

    if (error) throw error;

    const items = Array.isArray(data) ? data : [];
    if (!items.length) return null;

    return {
        premiere: items[0],
        serverClock: createServerClock(items, startedAt, finishedAt),
    };
}
