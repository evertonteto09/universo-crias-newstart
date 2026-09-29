# Histórias dos Crias — camada Supabase

Esta versão organiza o frontend em módulos, deixando o site pronto para conversar com o Supabase sem concentrar tudo em um único `script.js`.

## Estrutura

```text
assets/js/
├── config.js
├── core/
│   ├── supabase.js
│   ├── theme.js
│   └── utils.js
├── services/
│   ├── auth.service.js
│   ├── writer.service.js
│   ├── story.service.js
│   ├── season.service.js
│   ├── chapter.service.js
│   ├── review.service.js
│   └── storage.service.js
├── guards/
│   └── writer.guard.js
└── pages/
    ├── reader-home.js
    ├── story-page.js
    ├── chapter-page.js
    ├── writer-login.js
    ├── writer-dashboard.js
    └── supabase-test.js
```

## Configuração

Edite `assets/js/config.js`:

```js
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "SUA_CHAVE_PUBLICA";
```

No navegador deve existir somente a chave pública/anon.

## Teste rápido

Abra:

`supabase-test.html`

Ele executa uma consulta simples em `stories`.

## O que a camada já sabe fazer

### Leitor
- consultar histórias
- consultar temporadas
- consultar somente capítulos `published`
- carregar avaliações publicadas
- enviar avaliação de obra/episódio
- gerar URL pública de uma capa no Storage

### Escritor
- autenticar
- resolver `writer_accounts` pelo `auth.uid()`
- listar próprias histórias
- criar história
- criar temporada
- criar capítulo
- atualizar capítulo
- preparar rascunho/publicação
- enviar capa ao Storage
- visualizar avaliações
- alterar somente o `status` de avaliação

## Observação sobre segurança

O frontend não é a barreira de segurança. O Supabase precisa ter RLS/policies corretas.

Antes de liberar o editor para produção, precisamos fechar as policies de:

- `stories`
- `seasons`
- `chapters`

A intenção é:

```text
anon:
    ler apenas conteúdo público/publicado

authenticated writer:
    acessar somente as próprias histórias
    criar/editar temporadas e capítulos próprios
    publicar/ocultar os próprios capítulos

reviews:
    leitura pública somente de published
    insert público
    escritor vê avaliações da própria obra
    escritor pode moderar o status
```

## Próxima peça

Depois desta camada, o próximo passo é implementar as telas reais do editor:

1. Dashboard
2. página de configuração da história
3. editor de temporada
4. editor de capítulo
5. botão Salvar rascunho
6. botão Publicar
7. gerenciamento de capa
8. avaliações no painel

As médias de avaliações da listagem pública podem posteriormente virar uma VIEW/RPC no Supabase para evitar várias consultas individuais.


## Editor implementado nesta versão

O Portal do Escritor agora possui:

- criação de história
- edição de nome e descrição
- escolha de capa padrão, URL externa ou upload
- criação e renomeação de temporadas
- criação de episódios
- editor de conteúdo em texto puro
- autosave em rascunho após pausa na digitação
- botão explícito de Salvar rascunho
- Publicar episódio
- voltar de publicado para rascunho
- contagem de caracteres
- link para visualizar a publicação
- leitura das avaliações da obra no dashboard

A autorização continua no RLS. O frontend apenas apresenta as ferramentas; ele não substitui as policies do Supabase.
