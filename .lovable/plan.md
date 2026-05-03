## Renomear "Médico" para "Nura Pro" no modal de Configurações

No arquivo `src/components/dashboard/SettingsModal.tsx`, na função `getPlanLabel` (linhas 69-82), alterar apenas os labels exibidos para os planos médicos:

```ts
medico: 'Nura Pro',
medical: 'Nura Pro',
```

Sem alterar IDs, slugs, lógica, permissões ou integrações. Mudança puramente visual no card "Seus planos" do modal.

**Arquivos alterados:**
- `src/components/dashboard/SettingsModal.tsx`