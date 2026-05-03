## Remover espaço do header quando dropdown desativado

No `src/components/dashboard/ChatArea.tsx` (linhas ~333-422), o wrapper `<div className="p-4 flex items-center gap-2">` é renderizado mesmo quando `showModelSelector` é falso e `isMobile` é falso, ocupando ~72px de altura vazia.

**Mudança:** envolver o `<div>` do header com condicional — só renderiza se houver pelo menos um conteúdo (botão de menu mobile OU dropdown):

```tsx
{(isMobile || showModelSelector) && (
  <div className="p-4 flex items-center gap-2">
    {isMobile && (<Button ...menu... />)}
    {showModelSelector && (<DropdownMenu>...</DropdownMenu>)}
  </div>
)}
```

Assim, em desktop com dropdown desativado, o header desaparece completamente e o ScrollArea do chat ocupa todo o espaço. Em mobile, o header continua existindo (precisa do botão de menu).

**Arquivos alterados:**
- `src/components/dashboard/ChatArea.tsx`
