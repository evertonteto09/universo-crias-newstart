import { supabase } from "./supabase-client.js";
import { setupTheme, coverForStory, escapeHtml, ratingStars } from "./ui.js?v=20261027-custom-background-crop-1";

window.__supabase = supabase;
setupTheme();

const grid = document.querySelector("#story-grid");
const count = document.querySelector("#story-count");

async function storyCard(story) {
    const cover = await coverForStory(story);
    const average = story.average_rating ?? 0;
    const reviews = story.review_count ?? 0;

    return `
        <a class="story-card" href="./historia.html?slug=${encodeURIComponent(story.slug)}">
            <img class="story-cover" src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(story.title)}">
            <div class="story-card-body">
                <span class="eyebrow">OBRA</span>
                <h3>${escapeHtml(story.title)}</h3>
                <p>${escapeHtml(story.description || "Sem descrição disponível.")}</p>
                <div class="rating-line">
                    <span>${ratingStars(Math.round(average))}</span>
                    <span class="muted">${average.toFixed(1)} · ${reviews} avaliações</span>
                </div>
            </div>
        </a>
    `;
}

async function loadStories() {
    const { data, error } = await supabase
        .from("stories")
        .select(`
            id,
            title,
            slug,
            description,
            status,
            cover_type,
            cover_url,
            cover_path
        `)
        .eq("status", "published")
        .order("title");

    if (error) {
        grid.innerHTML = `<article class="error-card">Não foi possível carregar as histórias.</article>`;
        console.error(error);
        return;
    }

    count.textContent = `${data.length} ${data.length === 1 ? "obra" : "obras"}`;

    if (!data.length) {
        grid.innerHTML = `<article class="empty-card">Ainda não existem histórias publicadas.</article>`;
        return;
    }

    // A média será ligada depois por uma view/RPC dedicada.
    const cards = await Promise.all(
        data.map((story) => storyCard({ ...story, average_rating: 0, review_count: 0 }))
    );
    grid.innerHTML = cards.join("");
}

loadStories();
