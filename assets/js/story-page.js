import { supabase } from "./supabase-client.js";
import { setupTheme, coverForStory, escapeHtml } from "./ui.js";

window.__supabase = supabase;
setupTheme();

const page = document.querySelector("#story-page");
const slug = new URLSearchParams(location.search).get("slug");

function notFound() {
    page.innerHTML = `
        <section class="empty-state">
            <span class="eyebrow">404</span>
            <h1>História não encontrada</h1>
            <a class="primary-button" href="./index.html">Voltar</a>
        </section>
    `;
}

async function loadStory() {
    if (!slug) return notFound();

    const { data: story, error: storyError } = await supabase
        .from("stories")
        .select(`
            id,
            title,
            slug,
            description,
            cover_type,
            cover_url,
            cover_path,
            seasons (
                id,
                number,
                title,
                chapters (
                    id,
                    number,
                    title,
                    status
                )
            )
        `)
        .eq("slug", slug)
        .single();

    if (storyError || !story) return notFound();

    const seasons = (story.seasons || [])
        .sort((a, b) => a.number - b.number)
        .map((season) => {
            const chapters = (season.chapters || [])
                .filter((chapter) => chapter.status === "published")
                .sort((a, b) => a.number - b.number)
                .map((chapter) => `
                    <a class="chapter-row" href="./episodio.html?slug=${encodeURIComponent(slug)}&season=${season.number}&episode=${chapter.number}">
                        <span class="chapter-number">${chapter.number === 0 ? "Piloto" : `Ep. ${chapter.number}`}</span>
                        <span>${escapeHtml(chapter.title)}</span>
                    </a>
                `)
                .join("");

            return `
                <section class="season-card">
                    <div class="season-heading">
                        <span class="eyebrow">TEMPORADA ${season.number}</span>
                        <h2>${escapeHtml(season.title)}</h2>
                    </div>
                    <div class="chapter-list">
                        ${chapters || `<p class="muted">Nenhum episódio publicado.</p>`}
                    </div>
                </section>
            `;
        })
        .join("");

    page.innerHTML = `
        <section class="story-hero">
            <img class="story-hero-cover" src="${coverForStory(story)}" alt="Capa de ${escapeHtml(story.title)}">
            <div>
                <span class="eyebrow">HISTÓRIA</span>
                <h1>${escapeHtml(story.title)}</h1>
                <p>${escapeHtml(story.description || "Sem descrição disponível.")}</p>
                <div class="rating-summary">
                    <span>☆ ☆ ☆ ☆ ☆</span>
                    <span class="muted">Ainda sem resumo de avaliações</span>
                </div>
            </div>
        </section>

        <section>
            <div class="section-heading">
                <div>
                    <span class="eyebrow">EPISÓDIOS</span>
                    <h2>Temporadas</h2>
                </div>
            </div>
            <div class="season-stack">
                ${seasons || `<article class="empty-card">Ainda não existem episódios publicados.</article>`}
            </div>
        </section>
    `;
}

loadStory();
