import { supabase } from "./supabase-client.js";
import { setupTheme, coverForStory, escapeHtml, ratingStars } from "./ui.js";

window.__supabase = supabase;
setupTheme();

const name = document.querySelector("#writer-name");
const grid = document.querySelector("#writer-story-grid");
const reviewList = document.querySelector("#review-list");

async function requireWriter() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        location.href = "./login.html";
        return null;
    }

    name.textContent = user.email || "Escritor";
    return user;
}

async function loadStories() {
    const { data, error } = await supabase
        .from("stories")
        .select("id, title, slug, description, cover_type, cover_url, cover_path")
        .order("title");

    if (error) {
        grid.innerHTML = `<article class="error-card">Não foi possível carregar suas histórias.</article>`;
        return;
    }

    grid.innerHTML = data.length
        ? data.map((story) => `
            <article class="writer-story-card" data-story-id="${story.id}">
                <img class="story-cover" src="${coverForStory(story)}" alt="">
                <div>
                    <span class="eyebrow">OBRA</span>
                    <h3>${escapeHtml(story.title)}</h3>
                    <p>${escapeHtml(story.description || "Sem descrição.")}</p>
                    <button class="secondary-button review-button" type="button">Ver avaliações</button>
                </div>
            </article>
        `).join("")
        : `<article class="empty-card">Você ainda não possui histórias.</article>`;

    document.querySelectorAll(".review-button").forEach((button) => {
        button.addEventListener("click", async (event) => {
            const storyId = Number(event.target.closest("[data-story-id]").dataset.storyId);
            await loadReviews(storyId);
        });
    });
}

async function loadReviews(storyId) {
    const { data, error } = await supabase
        .from("reviews")
        .select("id, reader_name, rating, content, chapter_id, status, created_at")
        .eq("story_id", storyId)
        .order("created_at", { ascending: false });

    if (error) {
        reviewList.innerHTML = `<article class="error-card">Não foi possível carregar as avaliações.</article>`;
        return;
    }

    reviewList.innerHTML = data.length
        ? data.map((review) => `
            <article class="review-card">
                <div class="review-meta">
                    <strong>${escapeHtml(review.reader_name)}</strong>
                    <span>${ratingStars(review.rating)}</span>
                </div>
                <p>${escapeHtml(review.content)}</p>
                <small class="muted">${review.chapter_id ? "Episódio específico" : "Obra completa"} · ${escapeHtml(review.status)}</small>
            </article>
        `).join("")
        : `<article class="empty-card">Essa história ainda não recebeu avaliações.</article>`;
}

document.querySelector("#logout-button").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.href = "./login.html";
});

document.querySelector("#new-story-button").addEventListener("click", () => {
    alert("Editor de nova história será conectado na próxima etapa.");
});

const user = await requireWriter();
if (user) {
    await loadStories();
}
