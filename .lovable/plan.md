

## Criar página `/privacidade` com a Política de Privacidade

### Visão geral

Criar uma nova página estática `/privacidade` contendo o texto completo da Política de Privacidade fornecido, renderizado como markdown bem formatado, dentro do layout padrão do site (Header + Footer). Atualizar o link "Privacidade" do Footer para apontar para essa rota.

### Mudanças

**1. Nova página `src/pages/Privacidade.tsx`**

- Componente React funcional simples.
- Estrutura: `<Header />` + `<main>` com o conteúdo + `<Footer />`.
- Container centralizado (`container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8`) com padding-top para compensar o header fixo (`pt-32 sm:pt-40`) e padding-bottom (`pb-16`).
- Renderizar o markdown usando `ReactMarkdown` (já presente no projeto via `MarkdownMessage.tsx`) com `remark-gfm` para tabelas/links/etc.
- Aplicar classes Tailwind tipográficas via `prose prose-neutral dark:prose-invert max-w-none` para herdar o tema. Alternativa sem plugin typography: usar classes manuais nos elementos via componentes do `ReactMarkdown` (h1, h2, h3, p, ul, strong, a, hr) seguindo a paleta do site (`text-foreground`, `text-muted-foreground`, links em `text-primary hover:underline`).
- Decisão: usar a abordagem de componentes manuais do `ReactMarkdown` (mesmo padrão do `MarkdownMessage.tsx` existente) para garantir consistência visual sem depender de `@tailwindcss/typography`.
- Definir `<title>` da página como "Política de Privacidade — NuraCan AI" via `useEffect` com `document.title`.
- Conteúdo do markdown armazenado em uma constante `const POLICY_MARKDOWN = \`...\`` no topo do arquivo, exatamente como fornecido.

**2. Registrar a rota em `src/App.tsx`**

- Importar `Privacidade`.
- Adicionar `<Route path="/privacidade" element={<Privacidade />} />` antes do catch-all `*`.

**3. Atualizar link do Footer em `src/components/Footer.tsx`**

- Trocar o `<a href="#">Privacidade</a>` por `<a href="/privacidade">Privacidade</a>`.
- Manter o item "Termos de Uso" inalterado (continua `href="#"`).

### Estilo visual

- Fundo padrão da página (`bg-background`).
- Tipografia coerente com o restante do site:
  - `h1`: `text-3xl sm:text-4xl font-bold mb-6`
  - `h2`: `text-xl sm:text-2xl font-bold mt-10 mb-4`
  - `h3`: `text-lg font-semibold mt-6 mb-3`
  - `p`: `text-base leading-relaxed text-muted-foreground mb-4`
  - `ul`: `list-disc pl-6 space-y-2 mb-4 text-muted-foreground`
  - `strong`: `font-semibold text-foreground`
  - `a`: `text-primary hover:underline`
  - `hr`: `my-8 border-border`
  - `em`: `italic text-muted-foreground`

### Arquivos editados

- `src/pages/Privacidade.tsx` — novo arquivo com o conteúdo.
- `src/App.tsx` — registrar rota `/privacidade`.
- `src/components/Footer.tsx` — atualizar `href` do link "Privacidade".

