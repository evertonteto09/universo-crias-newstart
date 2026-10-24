import { supabase } from "../core/supabase.js";

export async function getCurrentUser() {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error) {
        throw error;
    }

    return user;
}

export async function signIn(email, password) {
    const { data, error } =
        await supabase.auth.signInWithPassword({
            email,
            password,
        });

    if (error) {
        throw error;
    }

    return data;
}

export async function signOut() {
    const { error } =
        await supabase.auth.signOut();

    if (error) {
        throw error;
    }
}


/** Entrar ou criar uma conta de usuário utilizando OAuth do Discord. */
export async function signInWithDiscord(redirectTo = window.location.href) {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
            redirectTo,
            scopes: "identify email",
        },
    });

    if (error) throw error;
}

/**
 * Vincula o Discord à sessão atualmente autenticada. Para escritores existentes,
 * isso mantém o mesmo auth.users.id usado em writer_accounts.
 */
export async function linkDiscordIdentity(redirectTo = window.location.href) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData?.session?.user) {
        throw new Error("Entre primeiro com sua conta atual de escritor para vincular o Discord.");
    }

    const { data, error } = await supabase.auth.linkIdentity({
        provider: "discord",
        options: {
            redirectTo,
            scopes: "identify email",
        },
    });

    if (error) throw error;
    return data;
}

export async function getCurrentUserIdentities() {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    return data?.identities ?? [];
}

/**
 * Desvincula uma identidade Discord que pertence ao usuário autenticado atual.
 * Recebe apenas o ID da identidade (não aceita um objeto arbitrário do navegador),
 * relê a lista no servidor e verifica que a identidade é do usuário atual.
 */
export async function unlinkDiscordIdentity(identityId) {
    if (typeof identityId !== "string" || !identityId.trim()) {
        throw new Error("Identidade inválida. Atualize a página e tente novamente.");
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const user = userData?.user;
    if (!user) {
        throw new Error("Sua sessão expirou. Entre novamente antes de gerenciar as identidades.");
    }

    const { data: identitiesData, error: identitiesError } = await supabase.auth.getUserIdentities();
    if (identitiesError) throw identitiesError;

    const identities = identitiesData?.identities ?? [];
    if (identities.length <= 1) {
        const error = new Error("Esta conta precisa manter pelo menos uma identidade de login. Adicione outro método de acesso antes de desvincular o Discord.");
        error.code = "single_identity_not_deletable";
        throw error;
    }

    const identity = identities.find((item) => item.id === identityId);
    if (!identity || identity.provider !== "discord" || identity.user_id !== user.id) {
        const error = new Error("Essa identidade Discord não pertence à sessão atual. Atualize a página e tente novamente.");
        error.code = "identity_not_found";
        throw error;
    }

    const { data, error } = await supabase.auth.unlinkIdentity(identity);
    if (error) throw error;
    return data;
}
