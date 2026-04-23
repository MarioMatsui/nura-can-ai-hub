

# Feature: Receituário+

Nova área dentro do `/app` para gerar sugestões de receituário com IA, cruzando catálogo + prontuário + RAG médico. Visual nativo do app, light/dark, responsivo.

---

## 1. Sidebar — novo botão

Em `ChatSidebar.tsx`, logo abaixo de "Buscar em chats":

- **Texto:** "Receituário +" (ícone `FilePlus2` do lucide-react)
- **Estado expandido:** botão `ghost` full-width, mesmo padrão visual do "Buscar em chats"
- **Estado colapsado:** apenas ícone, com tooltip
- **Acesso:** apenas plano **Médico** (ou Especialista por hierarquia). Para usuários sem esse plano (ex: Generalista/Free), o botão aparece **opaco** (`opacity-50 cursor-not-allowed`) com cadeado e tooltip "Disponível no plano Médico". Clique exibe toast de upsell e não abre a tela.
- **Estado ativo:** quando a tela de receituário está aberta, o botão fica destacado (`bg-accent`).

## 2. Roteamento interno (sem cobrir sidebar)

Em `Dashboard.tsx`, adicionar state `activeView: 'chat' | 'prescription'`. Renderização condicional dentro do mesmo container — sidebar permanece intacta.

```text
┌───────────┬─────────────────────────────────┐
│  Sidebar  │   ChatArea  ou  PrescriptionView│
└───────────┴─────────────────────────────────┘
```

Selecionar uma conversa ou clicar "Nova Consulta" volta para `chat`.

## 3. Tela `PrescriptionView`

Componente novo em `src/components/dashboard/prescription/PrescriptionView.tsx`. Estrutura:

**Header** — título "Receituário +" + subtítulo curto.

**Bloco de uploads (lado a lado em desktop, empilhado em mobile):**
- `UploadDropzone` Catálogo (esquerda)
- Símbolo `+` central (com `Plus` icon dentro de círculo `border border-border bg-muted`)
- `UploadDropzone` Prontuário (direita)

`UploadDropzone` reutilizável:
- Borda pontilhada (`border-dashed border-2`), estados: idle / drag-over (border-primary, bg-primary/5) / loading / success (mostra nome do arquivo + botão X para remover)
- Aceita: PDF, JPG, JPEG, PNG, WEBP, TXT, DOC, DOCX
- Max 10MB
- Click + drag-and-drop (`onDragOver`, `onDrop`)
- Upload imediato para bucket `prescription-files`

**Textarea** observações complementares (opcional, max 1000 chars, validado com zod).

**Botão "Gerar Receituário"** — desabilitado até ambos os arquivos terem sido enviados; mostra spinner durante processamento; bloqueia múltiplos cliques.

**Área de resposta** — card com `min-h-[400px]`, renderiza com `MarkdownMessage` (mesma formatação do chat). Botão "Copiar" no canto superior direito com feedback de "Copiado!".

**Histórico (lateral direita ou abaixo, conforme tela):**
Lista simples dos últimos 10 receituários gerados. Cada item: data + nome do paciente (se extraído) + queixa principal. Clique reabre o resultado na área de resposta (sem regenerar).

## 4. Backend — Tabelas novas (migration)

```text
prescription_catalogs
  id, user_id, file_name, file_type, file_path, file_size,
  extracted_content (text), extracted_metadata (jsonb), created_at

prescription_records  
  id, user_id, file_name, file_type, file_path, file_size,
  patient_name, main_complaint, extracted_content (text),
  extracted_metadata (jsonb), created_at

prescription_results
  id, user_id, catalog_id (FK), record_id (FK),
  user_observations (text), ai_response (text),
  suggested_products (jsonb), patient_name, main_complaint,
  model_used, created_at
```

RLS: usuários só leem/criam/deletam seus próprios registros. Admins podem ler tudo.

## 5. Storage

Novo bucket privado `prescription-files`. RLS restringe leitura/escrita ao owner via prefixo `{user_id}/`.

## 6. Edge function `generate-prescription`

Nova função em `supabase/functions/generate-prescription/index.ts`:

1. Valida JWT + verifica que o usuário tem plano Médico/Especialista ativo (espelhando a checagem de `chat-ai`)
2. Recebe: `catalogId`, `recordId`, `observations`
3. Carrega registros do banco; se `extracted_content` vazio, baixa o arquivo do Storage e:
   - PDF → envia inline_data (base64) ao Gemini para extração inicial estruturada (catálogo: produtos/concentrações/marcas; prontuário: paciente/queixa/sintomas), grava em `extracted_metadata`
   - Imagens → vision do Gemini
   - TXT/DOC → leitura direta
4. **RAG**: reutiliza exatamente a função `searchKnowledgeBase` e o pipeline do `chat-ai` com `knowledgeType = 'medical'`. A query de busca é construída a partir da queixa principal + sintomas extraídos do prontuário + observações do usuário.
5. Monta prompt estruturado (especialista em cannabis medicinal) instruindo a IA a:
   - Recomendar **somente** produtos presentes no catálogo
   - Cruzar contexto clínico do prontuário com evidência do RAG médico
   - Retornar 1 ou múltiplos produtos conforme necessidade
   - Estrutura: Resumo do caso → Objetivos terapêuticos → Produtos sugeridos (com justificativa por produto) → Observações de uso/monitoramento → Aviso clínico
   - Não alucinar; explicitar limitações
6. Salva resultado em `prescription_results` e retorna ao cliente.

`config.toml` recebe entrada com `verify_jwt = true`.

## 7. Validações e UX

- Zod no client para tamanho/extensão dos arquivos e tamanho de observações
- Toasts para erros (upload falhou, plano inválido, IA falhou, arquivo corrompido)
- Loading com mensagem "Analisando documentos e cruzando com base científica..."
- Estado vazio amigável na área de resposta
- Botão Copiar com `navigator.clipboard.writeText` + ícone `Check` por 2s
- Compatível com dark/light mode usando tokens existentes (`bg-card`, `text-foreground`, `border-border`, etc.)

## 8. Não toca

- Agente Médico do chat-ai (intacto)
- Lógica do RAG (apenas reutiliza)
- Layout/estilo dos componentes existentes

