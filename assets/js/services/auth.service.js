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
