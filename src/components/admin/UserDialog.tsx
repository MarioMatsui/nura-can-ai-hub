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
import { Loader2, Calendar, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

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
  status: "active" | "inactive" | "cancelled" | "expired" | "scheduled_cancellation" | "canceled" | "pending_cancellation";
  billing_period: string | null;
  started_at: string;
  expires_at: string | null;
  cancel_at?: string | null;
}

interface PlanForm {
  id?: string;
  plan_type: "free" | "medical" | "legal" | "veterinary" | "specialist";
  status: "active" | "inactive" | "cancelled" | "expired" | "scheduled_cancellation";
  expires_at: string;
}

interface UserData {
  profile: UserProfile;
  subscriptions: UserSubscription[];
}

interface UserDialogProps {
  user: UserData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const UserDialog = ({ user, open, onOpenChange, onUpdate }: UserDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [plans, setPlans] = useState<PlanForm[]>([]);

  useEffect(() => {
    if (user?.subscriptions && user.subscriptions.length > 0) {
      // Filter out canceled plans and plans with past cancellation dates
      const activePlans = user.subscriptions.filter((sub) => {
        // Exclude canceled or cancelled subscriptions
        if (sub.status === 'canceled' || sub.status === 'cancelled') return false;
        
        // Exclude subscriptions with cancellation date in the past
        if ((sub.status === 'pending_cancellation' || sub.status === 'scheduled_cancellation') && sub.cancel_at) {
          return new Date(sub.cancel_at) > new Date();
        }
        
        return true;
      });

      setPlans(
        activePlans.map((sub) => ({
          id: sub.id,
          plan_type: sub.plan_type as PlanForm["plan_type"],
          status: sub.status as PlanForm["status"],
          expires_at: sub.expires_at
            ? new Date(sub.expires_at).toISOString().split("T")[0]
            : "",
        }))
      );
    } else {
      setPlans([]);
    }
  }, [user]);

  const addNewPlan = () => {
    setPlans([
      ...plans,
      {
        plan_type: "medical",
        status: "active",
        expires_at: "",
      },
    ]);
  };

  const removePlan = async (index: number) => {
    const plan = plans[index];
    if (plan.id) {
      // Delete from database
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from("user_subscriptions")
          .delete()
          .eq("id", plan.id);

        if (error) throw error;
        
        toast.success("Plano removido com sucesso!");
        setPlans(plans.filter((_, i) => i !== index));
        onUpdate();
      } catch (error: any) {
        toast.error("Erro ao remover plano: " + error.message);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Just remove from local state
      setPlans(plans.filter((_, i) => i !== index));
    }
  };

  const updatePlan = (index: number, field: keyof PlanForm, value: any) => {
    const newPlans = [...plans];
    newPlans[index] = { ...newPlans[index], [field]: value };
    setPlans(newPlans);
  };

  const handleSave = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      for (const plan of plans) {
        if (plan.id) {
          // Update existing subscription
          const { error } = await supabase
            .from("user_subscriptions")
            .update({
              plan_type: plan.plan_type,
              status: plan.status as any,
              expires_at: plan.expires_at || null,
            })
            .eq("id", plan.id);

          if (error) throw error;
        } else {
          // Create new subscription
          const { error } = await supabase
            .from("user_subscriptions")
            .insert([{
              user_id: user.profile.id,
              plan_type: plan.plan_type,
              status: plan.status as any,
              expires_at: plan.expires_at || null,
            }]);

          if (error) throw error;
        }
      }

      toast.success("Planos atualizados com sucesso!");
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
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Gerenciar Assinatura</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addNewPlan}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Plano
              </Button>
            </div>

            {plans.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Nenhum plano ativo. Clique em "Adicionar Plano" para criar um.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {plans.map((plan, index) => (
                  <Card key={index} className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Plano {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePlan(index)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`plan-type-${index}`}>Tipo de Plano</Label>
                      <Select
                        value={plan.plan_type}
                        onValueChange={(value) =>
                          updatePlan(index, "plan_type", value)
                        }
                      >
                        <SelectTrigger id={`plan-type-${index}`}>
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
                      <Label htmlFor={`status-${index}`}>Status</Label>
                      <Select
                        value={plan.status}
                        onValueChange={(value) => updatePlan(index, "status", value)}
                      >
                        <SelectTrigger id={`status-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                          <SelectItem value="expired">Expirado</SelectItem>
                          <SelectItem value="scheduled_cancellation">
                            Cancelamento Agendado
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`expires-at-${index}`}>
                        Data de Expiração (opcional)
                      </Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id={`expires-at-${index}`}
                          type="date"
                          value={plan.expires_at}
                          onChange={(e) =>
                            updatePlan(index, "expires_at", e.target.value)
                          }
                          className="pl-10"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Deixe em branco para acesso ilimitado
                      </p>
                    </div>
                  </Card>
                ))}

                <Alert>
                  <AlertDescription>
                    Ao definir uma data de expiração, o plano será automaticamente
                    desativado quando essa data for atingida.
                  </AlertDescription>
                </Alert>
              </div>
            )}
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
