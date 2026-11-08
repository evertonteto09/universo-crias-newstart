-- Universo dos Crias — coautoria de gestão dos universos.
--
-- O proprietário original continua sendo o único usuário que pode:
--   - adicionar/remover coautores;
--   - excluir o universo.
--
-- Coautores podem gerir dados, capa, histórias, convites e ordem de leitura.
-- Esta migração não altera Edge Functions nem torna buckets públicos.

BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.story_universes') IS NULL
       OR to_regclass('public.story_universe_stories') IS NULL
       OR to_regclass('public.writer_accounts') IS NULL
       OR to_regclass('public.writers') IS NULL
       OR to_regclass('public.stories') IS NULL
       OR to_regclass('storage.objects') IS NULL THEN
        RAISE EXCEPTION 'Coautoria de universos: tabelas-base ausentes. Aplique primeiro as migrações do sistema de universos e das capas.';
    END IF;

    IF to_regprocedure('public.is_story_universe_owner(bigint)') IS NULL
       OR to_regprocedure('public.is_primary_author_of_story(bigint)') IS NULL
       OR to_regprocedure('public.story_universe_has_public_story(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Coautoria de universos: funções-base de autorização ausentes.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'story-universe-covers') THEN
        RAISE EXCEPTION 'Coautoria de universos: o bucket story-universe-covers não existe.';
    END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------
-- 1. Tabela de coautores
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.story_universe_collaborators (
    universe_id bigint NOT NULL
        REFERENCES public.story_universes(id) ON DELETE CASCADE,
    writer_id bigint NOT NULL
        REFERENCES public.writers(id) ON DELETE CASCADE,
    added_by_auth_user_id uuid
        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT story_universe_collaborators_pkey PRIMARY KEY (universe_id, writer_id)
);

CREATE INDEX IF NOT EXISTS story_universe_collaborators_writer_id_idx
    ON public.story_universe_collaborators(writer_id);

ALTER TABLE public.story_universe_collaborators ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. Helpers de autorização
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_story_universe_collaborator(target_universe_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT COALESCE(
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.story_universe_collaborators AS uc
            JOIN public.writer_accounts AS wa
              ON wa.writer_id = uc.writer_id
            JOIN public.writers AS w
              ON w.id = uc.writer_id
            WHERE uc.universe_id = target_universe_id
              AND wa.auth_user_id = auth.uid()
              AND COALESCE(w.active, true) = true
        ),
        false
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_story_universe(target_universe_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT COALESCE(
        auth.uid() IS NOT NULL
        AND (
            EXISTS (
                SELECT 1
                FROM public.story_universes AS u
                WHERE u.id = target_universe_id
                  AND u.created_by = auth.uid()
            )
            OR public.is_story_universe_collaborator(target_universe_id)
        ),
        false
    );
$function$;

-- Evita uma referência circular entre a política de leitura das histórias e
-- a política dos vínculos: consulta as associações com RLS desativado dentro
-- deste helper SECURITY DEFINER, mantendo a checagem pelo usuário atual.
CREATE OR REPLACE FUNCTION public.is_story_linked_to_managed_universe(target_story_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT COALESCE(
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.story_universe_stories AS us
            WHERE us.story_id = target_story_id
              AND public.can_manage_story_universe(us.universe_id)
        ),
        false
    );
$function$;

-- Também garante que os objetos de capa permaneçam no diretório do criador
-- original, mesmo quando um coautor envia ou substitui a imagem.
CREATE OR REPLACE FUNCTION public.can_manage_story_universe_cover(
    p_owner_uid text,
    p_universe_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_universe_id bigint;
    v_owner_uid text;
BEGIN
    IF p_universe_id IS NULL OR p_universe_id !~ '^[0-9]{1,15}$' THEN
        RETURN false;
    END IF;

    v_universe_id := p_universe_id::bigint;

    SELECT u.created_by::text
      INTO v_owner_uid
    FROM public.story_universes AS u
    WHERE u.id = v_universe_id;

    RETURN COALESCE(
        v_owner_uid IS NOT NULL
        AND lower(v_owner_uid) = lower(COALESCE(p_owner_uid, ''))
        AND public.can_manage_story_universe(v_universe_id),
        false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_story_universe_collaborator(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_story_universe(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_story_linked_to_managed_universe(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_story_universe_cover(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_story_universe_collaborator(bigint) TO authenticated;
-- can_manage_story_universe aparece na política de SELECT pública. Para anon,
-- auth.uid() será NULL e a função sempre retornará false.
GRANT EXECUTE ON FUNCTION public.can_manage_story_universe(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_story_linked_to_managed_universe(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_story_universe_cover(text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS: universo e associações visíveis aos gestores
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS story_universes_select ON public.story_universes;
CREATE POLICY story_universes_select
ON public.story_universes
FOR SELECT
TO anon, authenticated
USING (
    created_by = auth.uid()
    OR public.can_manage_story_universe(id)
    OR public.story_universe_has_public_story(id)
    OR EXISTS (
        SELECT 1
        FROM public.story_universe_stories AS us
        WHERE us.universe_id = story_universes.id
          AND public.is_primary_author_of_story(us.story_id)
    )
);

DROP POLICY IF EXISTS story_universe_stories_select ON public.story_universe_stories;
CREATE POLICY story_universe_stories_select
ON public.story_universe_stories
FOR SELECT
TO anon, authenticated
USING (
    public.can_manage_story_universe(universe_id)
    OR public.is_primary_author_of_story(story_id)
    OR (
        status = 'approved'
        AND EXISTS (
            SELECT 1
            FROM public.stories AS s
            WHERE s.id = story_universe_stories.story_id
              AND s.status = 'published'
        )
    )
);

-- Um gestor de universo precisa ler títulos e metadados das obras vinculadas,
-- inclusive rascunhos, para administrar os relacionamentos. Isso não concede
-- acesso de edição à história em si.
DROP POLICY IF EXISTS stories_universe_manager_select ON public.stories;
CREATE POLICY stories_universe_manager_select
ON public.stories
FOR SELECT
TO authenticated
USING (public.is_story_linked_to_managed_universe(stories.id));

REVOKE ALL PRIVILEGES ON TABLE public.story_universe_collaborators FROM anon, authenticated;
GRANT SELECT ON TABLE public.story_universe_collaborators TO authenticated;

DROP POLICY IF EXISTS story_universe_collaborators_select_allowed ON public.story_universe_collaborators;
DROP POLICY IF EXISTS story_universe_collaborators_select_managers ON public.story_universe_collaborators;
CREATE POLICY story_universe_collaborators_select_managers
ON public.story_universe_collaborators
FOR SELECT
TO authenticated
USING (public.can_manage_story_universe(universe_id));

-- ---------------------------------------------------------------------
-- 4. Gerenciamento de coautores — somente o criador original
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_story_universe_collaborator(
    p_universe_id bigint,
    p_writer_username text
)
RETURNS TABLE (
    result_writer_id bigint,
    result_name text,
    result_username text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_auth_user_id uuid := auth.uid();
    v_owner_writer_id bigint;
    v_target_writer_id bigint;
    v_username text;
    v_matches integer;
BEGIN
    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Entre na sua conta para gerenciar os coautores.';
    END IF;

    PERFORM 1
    FROM public.story_universes AS u
    WHERE u.id = p_universe_id
      AND u.created_by = v_auth_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Somente o responsável original pode adicionar coautores.';
    END IF;

    v_username := lower(regexp_replace(btrim(COALESCE(p_writer_username, '')), '^@+', ''));
    IF v_username = '' OR length(v_username) > 80 THEN
        RAISE EXCEPTION 'Informe um @username válido.';
    END IF;

    SELECT wa.writer_id
      INTO v_owner_writer_id
    FROM public.writer_accounts AS wa
    WHERE wa.auth_user_id = v_auth_user_id
    LIMIT 1;

    SELECT count(DISTINCT w.id)::integer
      INTO v_matches
    FROM public.writers AS w
    WHERE lower(w.username) = v_username
      AND COALESCE(w.active, true) = true
      AND EXISTS (
          SELECT 1
          FROM public.writer_accounts AS wa
          WHERE wa.writer_id = w.id
      );

    IF v_matches = 0 THEN
        RAISE EXCEPTION 'Não encontramos um escritor ativo com esse username e uma conta vinculada.';
    ELSIF v_matches > 1 THEN
        RAISE EXCEPTION 'Esse username não é único no cadastro. Peça ao administrador para corrigir os nomes antes de adicionar o coautor.';
    END IF;

    SELECT w.id
      INTO v_target_writer_id
    FROM public.writers AS w
    WHERE lower(w.username) = v_username
      AND COALESCE(w.active, true) = true
      AND EXISTS (
          SELECT 1
          FROM public.writer_accounts AS wa
          WHERE wa.writer_id = w.id
      )
    LIMIT 1;

    IF v_target_writer_id = v_owner_writer_id THEN
        RAISE EXCEPTION 'O responsável pelo universo não pode ser adicionado novamente como coautor.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.story_universe_collaborators AS uc
        WHERE uc.universe_id = p_universe_id
          AND uc.writer_id = v_target_writer_id
    ) THEN
        RAISE EXCEPTION 'Esse escritor já é coautor deste universo.';
    END IF;

    INSERT INTO public.story_universe_collaborators (
        universe_id, writer_id, added_by_auth_user_id
    ) VALUES (
        p_universe_id, v_target_writer_id, v_auth_user_id
    );

    UPDATE public.story_universes
    SET updated_at = now()
    WHERE id = p_universe_id;

    RETURN QUERY
    SELECT w.id, w.name::text, w.username::text
    FROM public.story_universe_collaborators AS uc
    JOIN public.writers AS w ON w.id = uc.writer_id
    WHERE uc.universe_id = p_universe_id
      AND uc.writer_id = v_target_writer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_story_universe_collaborator(
    p_universe_id bigint,
    p_writer_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_deleted_count integer;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.story_universes AS u
        WHERE u.id = p_universe_id
          AND u.created_by = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Somente o responsável original pode remover coautores.';
    END IF;

    DELETE FROM public.story_universe_collaborators AS uc
    WHERE uc.universe_id = p_universe_id
      AND uc.writer_id = p_writer_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count = 0 THEN
        RAISE EXCEPTION 'Esse coautor não está vinculado a este universo.';
    END IF;

    UPDATE public.story_universes
    SET updated_at = now()
    WHERE id = p_universe_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_story_universe_collaborator(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_story_universe_collaborator(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_story_universe_collaborator(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_story_universe_collaborator(bigint, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. RPCs existentes: proprietário OU coautor podem gerir o universo
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_story_universe_details(
    p_universe_id bigint,
    p_name text,
    p_slug text,
    p_description text DEFAULT NULL,
    p_cover_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_name text := btrim(COALESCE(p_name, ''));
    v_slug text := lower(btrim(COALESCE(p_slug, '')));
    v_description text := nullif(btrim(COALESCE(p_description, '')), '');
    v_cover_url text := nullif(btrim(COALESCE(p_cover_url, '')), '');
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_story_universe(p_universe_id) THEN
        RAISE EXCEPTION 'Você não tem permissão para editar este universo.';
    END IF;
    IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
        RAISE EXCEPTION 'O nome do universo deve ter entre 2 e 100 caracteres.';
    END IF;
    IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        RAISE EXCEPTION 'Endereço do universo inválido.';
    END IF;
    IF v_description IS NOT NULL AND char_length(v_description) > 1200 THEN
        RAISE EXCEPTION 'A descrição do universo deve ter no máximo 1200 caracteres.';
    END IF;
    IF v_cover_url IS NOT NULL AND (v_cover_url !~* '^https://[^[:space:]]+$' OR char_length(v_cover_url) > 2048) THEN
        RAISE EXCEPTION 'A imagem precisa utilizar um link HTTPS válido.';
    END IF;

    UPDATE public.story_universes
    SET name = v_name,
        slug = v_slug,
        description = v_description,
        cover_url = v_cover_url,
        updated_at = now()
    WHERE id = p_universe_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_story_to_universe(
    p_universe_id bigint,
    p_story_id bigint,
    p_relationship_type text DEFAULT 'spin_off'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_story_writer_id bigint;
    v_my_writer_id bigint;
    v_story_status text;
    v_is_mine boolean;
    v_status text;
    v_order integer;
    v_relationship text := COALESCE(p_relationship_type, 'spin_off');
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_story_universe(p_universe_id) THEN
        RAISE EXCEPTION 'Você não tem permissão para adicionar histórias a este universo.';
    END IF;
    IF v_relationship NOT IN ('spin_off', 'complementary') THEN
        RAISE EXCEPTION 'Use a relação spin-off ou complementar para adicionar outra história.';
    END IF;

    SELECT wa.writer_id INTO v_my_writer_id
    FROM public.writer_accounts AS wa
    WHERE wa.auth_user_id = auth.uid()
    LIMIT 1;
    IF v_my_writer_id IS NULL THEN
        RAISE EXCEPTION 'Conta de escritor não encontrada.';
    END IF;

    PERFORM pg_advisory_xact_lock(p_universe_id);

    SELECT s.writer_id, s.status INTO v_story_writer_id, v_story_status
    FROM public.stories AS s
    WHERE s.id = p_story_id;
    IF v_story_writer_id IS NULL THEN
        RAISE EXCEPTION 'História não encontrada.';
    END IF;

    v_is_mine := v_story_writer_id = v_my_writer_id;
    IF NOT v_is_mine AND v_story_status <> 'published' THEN
        RAISE EXCEPTION 'Só é possível solicitar a inclusão de histórias publicadas de outros escritores.';
    END IF;

    SELECT COALESCE(max(us.reading_order), 0) + 1000 INTO v_order
    FROM public.story_universe_stories AS us
    WHERE us.universe_id = p_universe_id;

    v_status := CASE WHEN v_is_mine THEN 'approved' ELSE 'pending' END;

    INSERT INTO public.story_universe_stories (
        universe_id, story_id, relationship_type, reading_order, status,
        requested_by, reviewed_by, reviewed_at
    ) VALUES (
        p_universe_id, p_story_id, v_relationship, v_order, v_status,
        auth.uid(), CASE WHEN v_is_mine THEN auth.uid() ELSE NULL END,
        CASE WHEN v_is_mine THEN now() ELSE NULL END
    );

    UPDATE public.story_universes SET updated_at = now() WHERE id = p_universe_id;
    RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_story_universe_main(
    p_universe_id bigint,
    p_story_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_story_universe(p_universe_id) THEN
        RAISE EXCEPTION 'Você não tem permissão para reorganizar este universo.';
    END IF;

    PERFORM 1
    FROM public.story_universe_stories AS us
    WHERE us.universe_id = p_universe_id
      AND us.story_id = p_story_id
      AND us.status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A história precisa estar aprovada para se tornar a obra principal.';
    END IF;

    UPDATE public.story_universe_stories
    SET relationship_type = 'spin_off'
    WHERE universe_id = p_universe_id
      AND status = 'approved'
      AND relationship_type = 'main'
      AND story_id <> p_story_id;

    UPDATE public.story_universe_stories
    SET relationship_type = 'main'
    WHERE universe_id = p_universe_id
      AND story_id = p_story_id
      AND status = 'approved';

    UPDATE public.story_universes SET updated_at = now() WHERE id = p_universe_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_story_from_universe(
    p_universe_id bigint,
    p_story_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
    IF NOT public.can_manage_story_universe(p_universe_id)
       AND NOT public.is_primary_author_of_story(p_story_id) THEN
        RAISE EXCEPTION 'Você não tem permissão para remover esta história do universo.';
    END IF;

    DELETE FROM public.story_universe_stories
    WHERE universe_id = p_universe_id
      AND story_id = p_story_id;

    UPDATE public.story_universes SET updated_at = now() WHERE id = p_universe_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_story_in_universe(
    p_universe_id bigint,
    p_story_id bigint,
    p_direction text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_current_order integer;
    v_neighbor_story_id bigint;
    v_neighbor_order integer;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_story_universe(p_universe_id) THEN
        RAISE EXCEPTION 'Você não tem permissão para reorganizar este universo.';
    END IF;
    IF p_direction NOT IN ('up', 'down') THEN
        RAISE EXCEPTION 'Direção de ordenação inválida.';
    END IF;

    PERFORM pg_advisory_xact_lock(p_universe_id);

    SELECT us.reading_order INTO v_current_order
    FROM public.story_universe_stories AS us
    WHERE us.universe_id = p_universe_id
      AND us.story_id = p_story_id
      AND us.status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'História aprovada não encontrada neste universo.';
    END IF;

    IF p_direction = 'up' THEN
        SELECT us.story_id, us.reading_order INTO v_neighbor_story_id, v_neighbor_order
        FROM public.story_universe_stories AS us
        WHERE us.universe_id = p_universe_id
          AND us.status = 'approved'
          AND (us.reading_order, us.story_id) < (v_current_order, p_story_id)
        ORDER BY us.reading_order DESC, us.story_id DESC
        LIMIT 1
        FOR UPDATE;
    ELSE
        SELECT us.story_id, us.reading_order INTO v_neighbor_story_id, v_neighbor_order
        FROM public.story_universe_stories AS us
        WHERE us.universe_id = p_universe_id
          AND us.status = 'approved'
          AND (us.reading_order, us.story_id) > (v_current_order, p_story_id)
        ORDER BY us.reading_order ASC, us.story_id ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_neighbor_story_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.story_universe_stories
    SET reading_order = v_neighbor_order
    WHERE universe_id = p_universe_id
      AND story_id = p_story_id;

    UPDATE public.story_universe_stories
    SET reading_order = v_current_order
    WHERE universe_id = p_universe_id
      AND story_id = v_neighbor_story_id;

    UPDATE public.story_universes SET updated_at = now() WHERE id = p_universe_id;
END;
$function$;

-- A definição de apagar o universo permanece intacta: is_story_universe_owner
-- continua sendo exigido pela RPC original public.delete_story_universe(bigint).

-- ---------------------------------------------------------------------
-- 6. Alteração da capa: gestores podem apontar para o caminho atual do dono
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_story_universe_cover_path(
    p_universe_id bigint,
    p_cover_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    v_path text := nullif(btrim(COALESCE(p_cover_path, '')), '');
    v_owner_uid text;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_story_universe(p_universe_id) THEN
        RAISE EXCEPTION 'Você não tem permissão para alterar a capa deste universo.';
    END IF;

    SELECT u.created_by::text INTO v_owner_uid
    FROM public.story_universes AS u
    WHERE u.id = p_universe_id;

    IF v_owner_uid IS NULL THEN
        RAISE EXCEPTION 'Universo não encontrado.';
    END IF;

    IF v_path IS NOT NULL AND v_path !~* (
        '^' || v_owner_uid || '/' || p_universe_id::text || '/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    ) THEN
        RAISE EXCEPTION 'Caminho da capa inválido para este universo.';
    END IF;

    UPDATE public.story_universes
    SET cover_path = v_path,
        cover_url = CASE WHEN v_path IS NOT NULL THEN NULL ELSE cover_url END,
        updated_at = now()
    WHERE id = p_universe_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_story_universe_cover_path(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_story_universe_cover_path(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 7. Storage: coautores podem ler, enviar e remover capas do universo.
-- O prefixo continua sendo o UUID do proprietário original.
-- ---------------------------------------------------------------------

-- Limpa nomes usados em um rascunho anterior da migração, caso esse rascunho
-- tenha sido testado. As políticas abaixo validam o created_by real do universo.
DROP POLICY IF EXISTS story_universe_covers_insert_manager ON storage.objects;
DROP POLICY IF EXISTS story_universe_covers_delete_manager ON storage.objects;

DROP POLICY IF EXISTS story_universe_covers_collaborator_select ON storage.objects;
CREATE POLICY story_universe_covers_collaborator_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'story-universe-covers'
    AND name ~* '^[a-f0-9-]{36}/[0-9]+/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    AND public.can_manage_story_universe_cover(split_part(name, '/', 1), split_part(name, '/', 2))
);

DROP POLICY IF EXISTS story_universe_covers_collaborator_insert ON storage.objects;
CREATE POLICY story_universe_covers_collaborator_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'story-universe-covers'
    AND name ~* '^[a-f0-9-]{36}/[0-9]+/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    AND public.can_manage_story_universe_cover(split_part(name, '/', 1), split_part(name, '/', 2))
);

DROP POLICY IF EXISTS story_universe_covers_collaborator_update ON storage.objects;
CREATE POLICY story_universe_covers_collaborator_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'story-universe-covers'
    AND name ~* '^[a-f0-9-]{36}/[0-9]+/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    AND public.can_manage_story_universe_cover(split_part(name, '/', 1), split_part(name, '/', 2))
)
WITH CHECK (
    bucket_id = 'story-universe-covers'
    AND name ~* '^[a-f0-9-]{36}/[0-9]+/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    AND public.can_manage_story_universe_cover(split_part(name, '/', 1), split_part(name, '/', 2))
);

DROP POLICY IF EXISTS story_universe_covers_collaborator_delete ON storage.objects;
CREATE POLICY story_universe_covers_collaborator_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'story-universe-covers'
    AND name ~* '^[a-f0-9-]{36}/[0-9]+/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    AND public.can_manage_story_universe_cover(split_part(name, '/', 1), split_part(name, '/', 2))
);

-- Depois de excluir um universo, só o proprietário original pode limpar uma
-- capa órfã. A verificação impede apagar um objeto ainda referenciado por outro
-- universo, e preserva a rotina de limpeza já usada pelo Portal do Escritor.
DROP POLICY IF EXISTS story_universe_covers_delete_owner ON storage.objects;
CREATE POLICY story_universe_covers_delete_owner
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'story-universe-covers'
    AND name ~* '^[a-f0-9-]{36}/[0-9]+/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|avif)$'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND NOT EXISTS (
        SELECT 1
        FROM public.story_universes AS u
        WHERE u.cover_path = storage.objects.name
    )
);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Auditoria rápida: confira as permissões e políticas adicionadas.
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('story_universes', 'story_universe_stories', 'story_universe_collaborators'))
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'story_universe_covers%')
ORDER BY schemaname, tablename, policyname;
