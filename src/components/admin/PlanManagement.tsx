import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { usePlanSettings } from "@/hooks/usePlanSettings";
import { 
  Sparkles, 
  Stethoscope, 
  Scale, 
  PawPrint, 
  GraduationCap,
  AlertTriangle
} from "lucide-react";

const planIcons: Record<string, typeof Sparkles> = {
  free: Sparkles,
  medico: Stethoscope,
  juridico: Scale,
  veterinario: PawPrint,
  especialista: GraduationCap,
};

const planDescriptions: Record<string, string> = {
  free: "Plano gratuito com acesso à IA generalista e limite de consultas diárias",
  medico: "Modelo especializado para profissionais de saúde com acesso ao banco de dados médico",
  juridico: "Modelo especializado para profissionais do direito com informações sobre regulamentação",
  veterinario: "Modelo especializado para veterinários com evidências científicas em medicina veterinária",
  especialista: "Acesso completo a todas as especialidades em um único modelo superior",
};

const PlanManagement = () => {
  const { planSettings, isLoading, togglePlanActive } = usePlanSettings();
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  const handleToggle = async (planCode: string, currentState: boolean) => {
    setUpdatingPlan(planCode);
    try {
      await togglePlanActive(planCode, !currentState);
      toast.success(
        !currentState 
          ? `Plano ${planCode} ativado com sucesso` 
          : `Plano ${planCode} desativado com sucesso`
      );
    } catch (error) {
      console.error("Error toggling plan:", error);
      toast.error("Erro ao atualizar o plano");
    } finally {
      setUpdatingPlan(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Gerenciamento de Planos</h2>
          <p className="text-muted-foreground">
            Ative ou desative planos sem deletar dados
          </p>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Gerenciamento de Planos</h2>
        <p className="text-muted-foreground">
          Ative ou desative planos sem deletar dados. Planos desativados não aparecem na landing page ou no app.
        </p>
      </div>

      <Card className="bg-amber-500/10 border-amber-500/30 mb-6">
        <CardContent className="flex items-start gap-3 pt-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              Importante
            </p>
            <p className="text-muted-foreground">
              Usuários que já possuem um plano continuarão com acesso mesmo que o plano seja desativado. 
              A desativação apenas oculta o plano para novas assinaturas.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {planSettings.map((plan) => {
          const Icon = planIcons[plan.plan_code] || Sparkles;
          const isUpdating = updatingPlan === plan.plan_code;

          return (
            <Card 
              key={plan.id} 
              className={`transition-all ${
                !plan.is_active ? "opacity-60 bg-muted/30" : ""
              }`}
            >
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${
                    plan.is_active 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{plan.display_name}</h3>
                      <Badge 
                        variant={plan.is_active ? "default" : "secondary"}
                        className={plan.is_active 
                          ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30" 
                          : "bg-muted text-muted-foreground"
                        }
                      >
                        {plan.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      {plan.plan_code === "especialista" && (
                        <Badge className="bg-primary text-primary-foreground">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {planDescriptions[plan.plan_code] || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground text-right">
                    <span className={plan.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                      {plan.is_active ? "Visível" : "Oculto"}
                    </span>
                  </div>
                  <Switch
                    checked={plan.is_active}
                    onCheckedChange={() => handleToggle(plan.plan_code, plan.is_active)}
                    disabled={isUpdating}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• <strong>Plano Ativo:</strong> Aparece na landing page e no seletor de modelos do app</p>
          <p>• <strong>Plano Inativo:</strong> Oculto em novos cadastros, mas usuários existentes mantêm acesso</p>
          <p>• <strong>Nenhum dado é deletado:</strong> Histórico de assinaturas e conversas são preservados</p>
          <p>• <strong>Mudanças são instantâneas:</strong> As alterações refletem imediatamente em todo o sistema</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlanManagement;
