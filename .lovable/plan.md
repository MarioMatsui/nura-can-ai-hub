## Atualizar logo do footer para Canfy

### Alterações
1. Copiar `user-uploads://canfy-light.png` → `src/assets/canfy-light.png`
2. Copiar `user-uploads://canfy-dark.png` → `src/assets/canfy-dark.png`
3. Em `src/components/Footer.tsx`, trocar apenas os dois imports:
   ```tsx
   import logoLight from "@/assets/canfy-light.png";
   import logoDark from "@/assets/canfy-dark.png";
   ```

A estrutura JSX (`<img>` com `dark:hidden` / `hidden dark:block`) permanece igual.

### Escopo
- Apenas `src/components/Footer.tsx` é modificado
- Header e demais áreas continuam usando `logo-light.png` / `logo-dark.png`
- Lógica de detecção de tema intacta