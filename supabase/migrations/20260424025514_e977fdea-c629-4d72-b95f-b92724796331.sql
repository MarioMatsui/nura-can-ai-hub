-- Adiciona coluna pinned_at em prescription_results
ALTER TABLE public.prescription_results
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE NULL;

-- Índice parcial para queries eficientes de itens fixados por usuário
CREATE INDEX IF NOT EXISTS idx_prescription_results_pinned
  ON public.prescription_results (user_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

-- Permite que usuários atualizem seus próprios receituários (necessário para toggle de pin)
CREATE POLICY "Users can update own results"
  ON public.prescription_results
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);