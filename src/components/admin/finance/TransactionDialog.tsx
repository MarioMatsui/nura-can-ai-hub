import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: {
    id: string;
    type: string;
    amount: number;
    tag: string;
    description: string | null;
  } | null;
  onSuccess: () => void;
}

export const TransactionDialog = ({ open, onOpenChange, transaction, onSuccess }: TransactionDialogProps) => {
  const [type, setType] = useState(transaction?.type || "entrada");
  const [amount, setAmount] = useState(transaction?.amount?.toString() || "");
  const [tag, setTag] = useState(transaction?.tag || "");
  const [description, setDescription] = useState(transaction?.description || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tag) {
      toast.error("Por favor, selecione uma tag");
      return;
    }
    
    setLoading(true);

    try {
      const data = {
        type,
        amount: parseFloat(amount),
        tag,
        description: description || null,
      };

      if (transaction) {
        const { error } = await supabase
          .from("financial_transactions")
          .update(data)
          .eq("id", transaction.id);

        if (error) throw error;
        toast.success("Transação atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("financial_transactions")
          .insert([data]);

        if (error) throw error;
        toast.success("Transação criada com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error("Erro ao salvar transação");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setType("entrada");
    setAmount("");
    setTag("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? "Editar Transação" : "Nova Transação"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="type">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="tag">Tag <span className="text-destructive">*</span></Label>
              <Select value={tag} onValueChange={setTag} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="vendas">Vendas</SelectItem>
                  <SelectItem value="infra">Infraestrutura</SelectItem>
                  <SelectItem value="operacional">Operacional</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
