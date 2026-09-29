# Histórias dos Crias — fundação do site

Estrutura inicial para o Painel do Leitor e Portal do Escritor.

## 1. Supabase

Abra `assets/js/config.js` e coloque:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Use apenas a chave pública/anon no navegador.

## 2. Storage

Crie no Supabase Storage o bucket público:

`story-covers`

Configuração inicial:

- Public: ON
- MIME: `image/*`
- Limite: 5 MB

## 3. O que já está preparado

- tema Neblina (padrão), Preto e Branco
- responsividade mobile
- animação de entrada
- imagem padrão da obra
- leitura somente de episódios publicados no front
- formulário de avaliação de episódio sem login
- login inicial do Portal do Escritor
- dashboard inicial do escritor

## 4. Próxima etapa

Conectar o editor real do escritor ao Supabase:

- criar história
- descrição
- capa por link
- upload da capa
- temporadas
- capítulos
- rascunho/publicado
- edição
- avaliações da obra
- avaliações dos episódios

Também será necessário fechar as policies/RLS finais para o CRUD do escritor e criar uma view/RPC para médias e contagens de avaliações.
