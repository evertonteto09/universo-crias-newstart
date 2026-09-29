import { supabase } from "./supabase-client.js";
import { setupTheme, escapeHtml, ratingStars } from "./ui.js";

setupTheme();

const page = document.querySelector("#chapter-page");
const params = new URLSearchParams(location.search);
const slug = params.get("slug");
const seasonNumber = Number(params.get("season"));
const episodeNumber = Number(params.get("episode"));

function notFound(message = "Episódio não encontrado") {
    page.innerHTML = `
        <section class="empty-state">
            <span class="eyebrow">LEITURA</span>
            <h1>${escapeHtml(message)}</h1>
            <a class="primary-button" href="./index.html">Voltar</a>
        </section>
    `;
}

function renderContent(text) {
    return escapeHtml(text)
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
        .join("");
}

async function loadChapter() {
    if (!slug || Number.isNaN(seasonNumber) || Number.isNaN(episodeNumber)) {
        return notFound("Parâmetros inválidos");
    }

    const { data: story, error: storyError } = await supabase
        .from("stories")
        .select(`
            id,
            title,
            slug,
            seasons (
                id,
                number,
                title,
                chapters (
                    id,
                    number,
                    title,
                    content,
                    status
                )
            )
        `)
        .eq("slug", slug)
        .single();

    if (storyError || !story) return notFound();

    const season = (story.seasons || []).find((item) => item.number === seasonNumber);
    const chapter = season?.chapters?.find(
        (item) => item.number === episodeNumber && item.status === "published"
    );

    // Segurança adicional no front, embora a proteção real de rascunhos deva estar no RLS.
    if (!chapter) return notFound();

    page.innerHTML = `
        <article class="reader-page">
            <div class="reader-header">
                <a class="text-link" href="./historia.html?slug=${encodeURIComponent(slug)}">← ${escapeHtml(story.title)}</a>
                <span class="eyebrow">${escapeHtml(season.title)}</span>
                <h1>${escapeHtml(chapter.title)}</h1>
                <p class="muted">${chapter.number === 0 ? "Piloto" : `Episódio ${chapter.number}`}</p>
            </div>

            <section class="reader-content">
                ${renderContent(chapter.content)}
            </section>

            <section class="review-section">
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">FEEDBACK</span>
                        <h2>Avaliações deste episódio</h2>
                    </div>
                </div>

                <form id="review-form" class="review-form">
                    <label>
                        Seu nome
                        <input id="reader-name" maxlength="80" required>
                    </label>
                    <label>
                        Nota
                        <select id="reader-rating" required>
                            <option value="5">5 estrelas</option>
                            <option value="4">4 estrelas</option>
                            <option value="3">3 estrelas</option>
                            <option value="2">2 estrelas</option>
                            <option value="1">1 estrela</option>
                        </select>
                    </label>
                    <label>
                        Sua avaliação
                        <textarea id="reader-content" maxlength="3000" rows="6" required></textarea>
                    </label>
                    <button class="primary-button" type="submit">Publicar avaliação</button>
                    <p id="review-message" class="form-message" role="alert"></p>
                </form>

                <div id="review-list" class="review-list">
                    <article class="loading-card">Carregando avaliações...</article>
                </div>
            </section>
        </article>
    `;

    const reviewForm = document.querySelector("#review-form");
    const reviewMessage = document.querySelector("#review-message");
    const reviewList = document.querySelector("#review-list");

    async function loadReviews() {
        const { data, error } = await supabase
            .from("reviews")
            .select("id, reader_name, rating, content, created_at")
            .eq("chapter_id", chapter.id)
            .eq("status", "published")
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
                        <span title="${review.rating}/5">${ratingStars(review.rating)}</span>
                    </div>
                    <p>${escapeHtml(review.content)}</p>
                </article>
            `).join("")
            : `<article class="empty-card">Ainda não há avaliações neste episódio.</article>`;
    }

    reviewForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        reviewMessage.textContent = "Enviando...";
        reviewMessage.className = "form-message";

        const { error } = await supabase
            .from("reviews")
            .insert({
                story_id: story.id,
                chapter_id: chapter.id,
                reader_name: document.querySelector("#reader-name").value.trim(),
                rating: Number(document.querySelector("#reader-rating").value),
                content: document.querySelector("#reader-content").value.trim(),
                status: "published",
            });

        if (error) {
            reviewMessage.textContent = "Não foi possível enviar sua avaliação.";
            reviewMessage.classList.add("error");
            return;
        }

        reviewMessage.textContent = "Avaliação enviada!";
        reviewMessage.classList.add("success");
        reviewForm.reset();
        await loadReviews();
    });

    await loadReviews();
}

loadChapter();
