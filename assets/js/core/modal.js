let activeModal = null;

function buildModal(content, options = {}) {
    const {
        title = "Janela",
        eyebrow = "",
        closeLabel = "Fechar",
        width = "620px",
    } = options;

    const dialog = document.createElement("dialog");
    dialog.className = "site-modal";
    dialog.style.setProperty("--modal-width", width);

    dialog.innerHTML = `
        <div class="site-modal-card">
            <div class="site-modal-head">
                <div>
                    ${
                        eyebrow
                            ? `<span class="eyebrow">${eyebrow}</span>`
                            : ""
                    }
                    <h2>${title}</h2>
                </div>

                <button
                    type="button"
                    class="modal-close-button"
                    data-modal-close
                    aria-label="${closeLabel}"
                >
                    ×
                </button>
            </div>

            <div class="site-modal-body">
                ${content}
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const close = () => {
        if (dialog.open) {
            dialog.close();
        }
        dialog.remove();
        if (activeModal === dialog) {
            activeModal = null;
        }
    };

    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close();
    });

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            close();
        }
    });

    dialog
        .querySelectorAll("[data-modal-close]")
        .forEach((button) => {
            button.addEventListener("click", close);
        });

    dialog.showModal();
    activeModal = dialog;

    return {
        dialog,
        body: dialog.querySelector(".site-modal-body"),
        close,
    };
}

export function closeActiveModal() {
    if (!activeModal) return;
    activeModal.close();
    activeModal.remove();
    activeModal = null;
}

export function openFormModal({
    title,
    eyebrow,
    width,
    html,
    onSubmit,
}) {
    const modal = buildModal(
        `
            <form class="modal-form" data-modal-form>
                ${html}

                <div
                    class="modal-feedback"
                    data-modal-feedback
                    role="alert"
                    aria-live="polite"
                ></div>

                <div class="modal-actions">
                    <button
                        type="button"
                        class="secondary-button"
                        data-modal-close
                    >
                        Cancelar
                    </button>

                    <button
                        type="submit"
                        class="primary-button"
                    >
                        Confirmar
                    </button>
                </div>
            </form>
        `,
        {
            title,
            eyebrow,
            width,
        },
    );

    const form =
        modal.body.querySelector(
            "[data-modal-form]"
        );

    const feedback =
        modal.body.querySelector(
            "[data-modal-feedback]"
        );

    const closeButtons =
        modal.body.querySelectorAll(
            "[data-modal-close]"
        );

    closeButtons.forEach((button) => {
        button.addEventListener(
            "click",
            modal.close,
        );
    });

    form.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            const submitButton =
                form.querySelector(
                    'button[type="submit"]'
                );

            submitButton.disabled = true;

            feedback.className =
                "modal-feedback";

            feedback.textContent =
                "Processando...";

            try {
                const shouldClose =
                    await onSubmit(
                        form,
                        feedback,
                    );

                if (shouldClose !== false) {
                    modal.close();
                }
            } catch (error) {
                feedback.className =
                    "modal-feedback error";

                feedback.textContent =
                    error?.message ||
                    "Não foi possível concluir a ação.";

                submitButton.disabled =
                    false;
            }
        },
    );

    requestAnimationFrame(() => {
        form.querySelector(
            "input, textarea, select, button"
        )?.focus();
    });

    return modal;
}


export function openConfirmModal({
    title,
    eyebrow = "CONFIRMAÇÃO",
    message,
    details = "",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = true,
    onConfirm,
}) {
    const buttonClass =
        danger ? "danger-button" : "primary-button";

    const modal = buildModal(
        `
            <div class="modal-confirm">
                <div class="modal-confirm-icon ${danger ? "danger" : "accent"}">
                    ${danger ? "!" : "✓"}
                </div>

                <div class="modal-confirm-copy">
                    <p class="modal-confirm-message">
                        ${message}
                    </p>

                    ${
                        details
                            ? `<div class="modal-confirm-details">${details}</div>`
                            : ""
                    }
                </div>
            </div>

            <div class="modal-feedback" data-confirm-feedback role="alert" aria-live="polite"></div>

            <div class="modal-actions">
                <button
                    type="button"
                    class="secondary-button"
                    data-modal-close
                >
                    ${cancelLabel}
                </button>

                <button
                    type="button"
                    class="${buttonClass}"
                    data-confirm-action
                >
                    ${confirmLabel}
                </button>
            </div>
        `,
        {
            title,
            eyebrow,
            width: "620px",
        },
    );

    const feedback =
        modal.body.querySelector(
            "[data-confirm-feedback]",
        );

    const confirmButton =
        modal.body.querySelector(
            "[data-confirm-action]",
        );

    modal.body
        .querySelectorAll("[data-modal-close]")
        .forEach((button) => {
            button.addEventListener(
                "click",
                modal.close,
            );
        });

    confirmButton.addEventListener(
        "click",
        async () => {
            confirmButton.disabled = true;
            feedback.className =
                "modal-feedback";
            feedback.textContent =
                "Processando...";

            try {
                const shouldClose =
                    await onConfirm();

                if (shouldClose !== false) {
                    modal.close();
                }
            } catch (error) {
                confirmButton.disabled = false;
                feedback.className =
                    "modal-feedback error";
                feedback.textContent =
                    error?.message ||
                    "Não foi possível concluir a exclusão.";
            }
        },
    );

    return modal;
}

export function showInfoModal({
    title,
    eyebrow,
    html,
    actionLabel = "Fechar",
}) {
    return buildModal(
        `
            <div class="modal-info">
                ${html}
            </div>

            <div class="modal-actions">
                <button
                    type="button"
                    class="primary-button"
                    data-modal-close
                >
                    ${actionLabel}
                </button>
            </div>
        `,
        {
            title,
            eyebrow,
        },
    );
}
