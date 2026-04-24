

## Criar página `/termos-uso` com os Termos de Serviço

### Visão geral

Criar nova página estática `/termos-uso` espelhando exatamente a estrutura, layout e estilos da `/privacidade` recém-criada, contendo o texto completo dos Termos de Serviço fornecido. Atualizar o link "Termos de Uso" do Footer para apontar para essa rota.

### Mudanças

**1. Nova página `src/pages/TermosUso.tsx`**

- Mesma estrutura da `Privacidade.tsx`: `<Header />` + `<main>` com container `max-w-3xl` + `<Footer />`.
- Mesmos paddings (`pt-32 sm:pt-40 pb-16`) e mesmo background (`bg-background`).
- Renderização via `ReactMarkdown` + `remark-gfm` com os mesmos componentes customizados (h1, h2, h3, p, ul, strong, a, hr, em) já definidos em Privacidade — garantindo identidade visual idêntica.
- `document.title` = `"Termos de Serviço — NuraCan AI"` via `useEffect`.
- Conteúdo armazenado em uma constante `const TERMS_MARKDOWN = \`...\`` no topo do arquivo, exatamente como fornecido.
- Os links internos `[Política de Privacidade](#)` no texto serão mantidos como `(#)` exatamente como no conteúdo enviado (sem reescrever o markdown — preservando fielmente o texto pedido).

**2. Registrar a rota em `src/App.tsx`**

- Importar `TermosUso`.
- Adicionar `<Route path="/termos-uso" element={<TermosUso />} />` antes do catch-all `*`, próxima à rota `/privacidade`.

**3. Atualizar link do Footer em `src/components/Footer.tsx`**

- Trocar `<a href="#">Termos de Uso</a>` por `<a href="/termos-uso">Termos de Uso</a>`.
- Manter o link "Privacidade" intacto.

### Arquivos editados

- `src/pages/TermosUso.tsx` — novo arquivo.
- `src/App.tsx` — registrar rota `/termos-uso`.
- `src/components/Footer.tsx` — atualizar `href` do link "Termos de Uso".

