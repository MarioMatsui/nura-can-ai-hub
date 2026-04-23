
Diagnóstico atual do porquê o receituário ainda responde diferente do chat

1. O núcleo ainda não está 100% idêntico
Hoje o chat e o receituário compartilham partes do prompt médico, mas a arquitetura de execução continua diferente:

- `chat-ai` monta:
  - system prompt
  - histórico da conversa
  - RAG
  - contexto de anexos com prioridade explícita
  - mensagem do usuário
- `generate-prescription` monta:
  - system prompt médico + camada de receituário
  - um único “mega prompt” com prontuário extraído + catálogo extraído + RAG + observações
  - anexos multimodais só em alguns formatos

Isso já muda bastante o comportamento do modelo, mesmo usando o mesmo modelo-base.

2. O RAG do receituário está sofrendo erro parcial de consulta
Há um problema concreto nos logs do receituário:

```text
failed to parse logic tree ... content.ilike.%multipla,% ...
```

Isso indica que a query de busca está sendo montada com termos contendo vírgula/pontuação, quebrando parte das consultas do RAG.

Impacto:
- o RAG não falha 100% do tempo
- mas perde parte das buscas mais importantes
- o embasamento científico fica inconsistente entre execuções

Esse é um motivo forte para o receituário ficar pior que o chat.

3. A origem da query do RAG é diferente
No chat:
- a busca RAG nasce da mensagem do usuário

No receituário:
- a busca nasce de `main_complaint + symptoms + diagnoses + comorbidities + history + observations`
- esses campos dependem da extração prévia do prontuário

Se a extração resumir mal o caso, o RAG já entra “empobrecido”, mesmo que o arquivo original esteja correto.

4. O tratamento de anexos ainda não está equivalente
No chat:
- imagem: vai multimodal direto
- PDF: vai multimodal direto
- TXT: entra como texto lido diretamente
- DOC/DOCX: também é enviado para interpretação

No receituário:
- PDF/imagem: vão como multimodal
- TXT/DOC/DOCX: dependem principalmente de `extracted_content`

Ou seja: em alguns formatos, o chat dá mais contexto real ao modelo do que o receituário.

Se seus testes estiverem usando DOC/DOCX/TXT, isso sozinho já pode explicar boa parte da diferença.

5. Os parâmetros de geração não estão alinhados
Diferença confirmada:

- `chat-ai` envia `max_tokens: 8000` e não fixa `temperature`
- `generate-prescription` fixa `temperature: 0.7`, mas não define `max_tokens`

Impacto:
- o chat pode estar recebendo mais espaço de saída
- o receituário pode estar sofrendo com limite implícito do provedor
- isso altera profundidade, completude e consistência

6. O chat usa histórico; o receituário é one-shot
O chat inclui o histórico completo da conversa.
O receituário é uma execução isolada baseada no pacote atual de arquivos + observações.

Isso favorece o chat quando o usuário refinou contexto em mensagens anteriores.

7. O receituário está sobrecarregando o modelo com contexto duplicado
Hoje o receituário envia ao mesmo tempo:
- JSON extraído do prontuário
- texto extraído do prontuário
- JSON extraído do catálogo
- texto extraído do catálogo
- chunks do RAG
- arquivos originais multimodais
- observações do médico

Esse volume pode diluir atenção e competir com os próprios arquivos originais.

Plano de correção recomendado

1. Corrigir a construção das queries do RAG no receituário
- sanitizar termos antes do `.or(content.ilike...)`
- remover vírgulas, pontos e caracteres inválidos
- descartar termos ruins
- manter o ranking atual intacto

2. Igualar a estratégia de anexos do receituário ao chat
- TXT deve entrar como texto lido diretamente
- DOC/DOCX devem ter o mesmo tratamento multimodal do chat
- manter PDF/imagem como já está

3. Alinhar os parâmetros de inferência
- definir explicitamente `max_tokens` no receituário
- decidir se o receituário deve usar a mesma política de temperatura do chat ou uma política condicionada ao tipo de caso
- evitar defaults implícitos diferentes entre os dois fluxos

4. Reduzir duplicação de contexto no receituário
- manter os arquivos originais como fonte principal
- usar extração estruturada apenas como apoio
- encurtar blocos auxiliares quando o original já foi anexado
- preservar RAG e lógica clínica

5. Aproximar a arquitetura do receituário da do chat
- mover instruções de prioridade de anexos para a camada de sistema
- deixar o prompt do receituário mais “enxuto”
- manter a camada de receituário apenas como moldura de saída, não como centro do raciocínio

6. Instrumentar comparação objetiva entre chat e receituário
Adicionar logs internos para comparar, no mesmo caso:
- quantidade de chunks RAG recuperados
- tipos de anexos realmente enviados ao modelo
- tamanho do contexto final
- finish reason / eventual truncamento
- parâmetros de geração usados

Resultado esperado após esses ajustes

- receituário e chat passam a usar o mesmo raciocínio clínico com menos divergência
- o receituário mantém o formato de sugestão de receita
- o RAG deixa de falhar parcialmente por causa de pontuação
- arquivos Word/TXT deixam de perder qualidade no receituário
- a diferença restante fica mais ligada ao formato da tarefa, e não a falhas de implementação

Detalhe técnico mais importante encontrado
Hoje o indício mais forte de bug real é este:

```text
Search error for query "... esclerose multipla, ... autista, ..."
failed to parse logic tree
```

Isso mostra que o receituário não está apenas “pensando diferente”; ele também está recuperando conhecimento de forma parcialmente quebrada em alguns casos.

Implementação sugerida na próxima etapa
- ajustar `supabase/functions/generate-prescription/index.ts`
- manter `chat-ai` intacto como referência
- validar com o mesmo caso clínico rodando nos dois fluxos
- entregar um relatório final confirmando:
  - RAG corrigido
  - anexos alinhados
  - parâmetros alinhados
  - diferenças remanescentes esperadas vs. anormais
