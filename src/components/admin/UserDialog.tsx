import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string;
  cpf: string;
  crm_crv: string | null;
}

interface UserSubscription {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  billing_period: string | null;
  started_at: string;
  expires_at: string | null;
}

interface UserData {
  profile: UserProfile;
  subscription: UserSubscription | null;
}

interface UserDialogProps {
  user: UserData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const UserDialog = ({ user, open, onOpenChange, onUpdate }: UserDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [planType, setPlanType] = useState<"free" | "medical" | "legal" | "veterinary" | "specialist">("free");
  const [status, setStatus] = useState<"active" | "inactive" | "cancelled">("active");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (user?.subscription) {
      setPlanType(user.subscription.plan_type as typeof planType);
      setStatus(user.subscription.status as typeof status);
      setExpiresAt(
        user.subscription.expires_at
          ? new Date(user.subscription.expires_at).toISOString().split("T")[0]
          : ""
      );
    } else {
      setPlanType("free");
      setStatus("active");
      setExpiresAt("");
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      if (user.subscription) {
        // Update existing subscription
        const { error } = await supabase
          .from("user_subscriptions")
          .update({
            plan_type: planType,
            status: status,
            expires_at: expiresAt || null,
          })
          .eq("id", user.subscription.id);

        if (error) throw error;
      } else {
        // Create new subscription
        const { error } = await supabase
          .from("user_subscriptions")
          .insert([{
            user_id: user.profile.id,
            plan_type: planType,
            status: status,
            expires_at: expiresAt || null,
          }]);

        if (error) throw error;
      }

      toast.success("Plano atualizado com sucesso!");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuário</DialogTitle>
          <DialogDescription>
            Visualize e edite os dados de assinatura do usuário
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Info */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold mb-3">Informações do Usuário</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Nome:</span>
                <p className="font-medium">{user.profile.full_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">E-mail:</span>
                <p className="font-medium">{user.profile.email}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Telefone:</span>
                <p className="font-medium">{user.profile.phone || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">CPF:</span>
                <p className="font-medium">{user.profile.cpf}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Data de Nascimento:</span>
                <p className="font-medium">
                  {new Date(user.profile.birth_date).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {user.profile.crm_crv && (
                <div>
                  <span className="text-muted-foreground">CRM/CRV:</span>
                  <p className="font-medium">{user.profile.crm_crv}</p>
                </div>
              )}
            </div>
          </div>

          {/* Subscription Management */}
          <div className="space-y-4">
            <h3 className="font-semibold">Gerenciar Assinatura</h3>

            <div className="space-y-2">
              <Label htmlFor="plan-type">Tipo de Plano</Label>
              <Select value={planType} onValueChange={(value) => setPlanType(value as typeof planType)}>
                <SelectTrigger id="plan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Gratuito</SelectItem>
                  <SelectItem value="medical">Médico</SelectItem>
                  <SelectItem value="legal">Jurídico</SelectItem>
                  <SelectItem value="veterinary">Veterinário</SelectItem>
                  <SelectItem value="specialist">Especialista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expires-at">Data de Expiração (opcional)</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="expires-at"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Deixe em branco para acesso ilimitado
              </p>
            </div>

            <Alert>
              <AlertDescription>
                Ao definir uma data de expiração, o plano será automaticamente desativado quando
                essa data for atingida.
              </AlertDescription>
            </Alert>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserDialog;
