import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePlanSettings } from "@/hooks/usePlanSettings";

const plans = {
  free: {
    name: "Gratuito",
    description: "",
    features: [
      "Acesso à IA generalista",
      "Até 5 consultas por dia",
      "Não suporta documentos/anexos",
      "Respostas mais diretas",
    ],
    monthlyPrice: 0,
    monthlyOriginalPrice: 0,
    annualPrice: 0,
    annualOriginalPrice: 0,
    annualTotalPrice: 0,
    popular: false,
  },
  medico: {
    name: "Médico",
    description: "",
    features: [
      "Modelo especializado para médicos",
      "Consultas ilimitadas",
      "Acesso a banco de dados médico",
      "Respostas baseadas em evidências científicas",
    ],
    monthlyPrice: 84.99,
    monthlyOriginalPrice: 99.90,
    annualPrice: 922.99,
    annualOriginalPrice: 89.90,
    annualTotalPrice: 922.99,
    popular: false,
  },
  juridico: {
    name: "Jurídico",
    description: "",
    features: [
      "Modelo especializado para juristas",
      "Consultas ilimitadas",
      "Acesso a banco de dados jurídico",
      "Informações sobre regulamentação",
    ],
    monthlyPrice: 76.90,
    monthlyOriginalPrice: 89.90,
    annualPrice: 816.00,
    annualOriginalPrice: 79.90,
    annualTotalPrice: 816.00,
    popular: false,
  },
  veterinario: {
    name: "Veterinário",
    description: "",
    features: [
      "Modelo especializado para veterinários",
      "Consultas ilimitadas",
      "Acesso a banco de dados veterinário",
      "Evidências científicas em medicina veterinária",
    ],
    monthlyPrice: 68.00,
    monthlyOriginalPrice: 79.90,
    annualPrice: 719.88,
    annualOriginalPrice: 69.90,
    annualTotalPrice: 719.88,
    popular: false,
  },
  especialista: {
    name: "Especialista",
    description: "",
    features: [
      "IA avançada que integra as 3 especialidades em um único modelo superior",
      "Consultas ilimitadas em todas as áreas",
      "Todos os bancos de dados especializados",
      "Máxima flexibilidade profissional",
      "Melhor custo-benefício",
    ],
    monthlyPrice: 109.90,
    monthlyOriginalPrice: 129.90,
    annualPrice: 1188.00,
    annualOriginalPrice: 109.90,
    annualTotalPrice: 1188.00,
    popular: true,
  },
};

type PlanKey = 'free' | 'medico' | 'juridico' | 'veterinario' | 'especialista';

interface PricingProps {
  showFree?: boolean;
}

const Pricing = ({ showFree = true }: PricingProps) => {
  const { toast } = useToast();
  const [isAnnual, setIsAnnual] = useState(true); // Anual as default
  const [userId, setUserId] = useState<string | null>(null);
  const [activePlans, setActivePlans] = useState<string[]>([]);
  const [scheduledCancellations, setScheduledCancellations] = useState<string[]>([]);
  const { isPlanActive, isLoading: isLoadingPlanSettings } = usePlanSettings();

  // Calculate average discount percentage
  const calculateAverageDiscount = () => {
    const paidPlans = Object.values(plans).filter(p => p.monthlyPrice > 0);
    const totalDiscount = paidPlans.reduce((sum, plan) => {
      const monthlyTotal = plan.monthlyPrice * 12;
      const discount = ((monthlyTotal - plan.annualPrice) / monthlyTotal) * 100;
      return sum + discount;
    }, 0);
    return Math.round(totalDiscount / paidPlans.length);
  };

  const discountPercentage = calculateAverageDiscount();

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id ?? null;
      setUserId(currentUserId);

      if (currentUserId) {
        const { data: userPlans, error } = await supabase
          .from('user_plans')
          .select('plan_type, status, cancel_at_period_end')
          .eq('user_id', currentUserId)
          .eq('status', 'active');
        
        console.log('Pricing - User plans data:', { userPlans, error, userId: currentUserId });
        
        if (!error && userPlans && userPlans.length > 0) {
          const activePlanTypes = userPlans.map(plan => plan.plan_type);
          const scheduledPlans = userPlans
            .filter(plan => plan.cancel_at_period_end)
            .map(plan => plan.plan_type);
          
          console.log('Pricing - Setting active plans:', activePlanTypes);
          console.log('Pricing - Scheduled cancellations:', scheduledPlans);
          
          setActivePlans(activePlanTypes);
          setScheduledCancellations(scheduledPlans);
        } else {
          console.log('Pricing - No active plans found');
          setActivePlans([]);
          setScheduledCancellations([]);
        }
      }
    };

    fetchUserData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUserId = session?.user?.id ?? null;
      setUserId(currentUserId);
      
      if (currentUserId) {
        supabase
          .from('user_plans')
          .select('plan_type, status, cancel_at_period_end')
          .eq('user_id', currentUserId)
          .eq('status', 'active')
          .then(({ data: userPlans, error }) => {
            if (!error && userPlans && userPlans.length > 0) {
              const activePlanTypes = userPlans.map(plan => plan.plan_type);
              const scheduledPlans = userPlans
                .filter(plan => plan.cancel_at_period_end)
                .map(plan => plan.plan_type);
              
              setActivePlans(activePlanTypes);
              setScheduledCancellations(scheduledPlans);
            } else {
              setActivePlans([]);
              setScheduledCancellations([]);
            }
          });
      } else {
        setActivePlans([]);
        setScheduledCancellations([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const getDisplayPrice = (plan: typeof plans.medico) => {
    if (plan.monthlyPrice === 0) return "Grátis";
    
    if (isAnnual) {
      const monthlyEquivalent = plan.annualPrice / 12;
      
      return (
        <div className="flex flex-col items-center">
          <div className="relative inline-flex items-center justify-center">
            <span className="text-2xl sm:text-3xl font-bold">
              R$ {monthlyEquivalent.toFixed(2).replace(".", ",")}
            </span>
            <span className="absolute -top-2 -right-2 text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-1 rounded relative overflow-visible after:content-[''] after:absolute after:left-0 after:right-0 after:top-1/2 after:h-[1px] after:bg-red-500 after:rotate-[-15deg] after:origin-center">
              -15%
            </span>
          </div>
          <span className="text-sm text-muted-foreground">/mês</span>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col items-center">
        <div className="relative inline-flex items-center justify-center">
          <span className="text-2xl sm:text-3xl font-bold">
            R$ {plan.monthlyPrice.toFixed(2).replace(".", ",")}
          </span>
          <span className="absolute -top-2 -right-2 text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-1 rounded relative overflow-visible after:content-[''] after:absolute after:left-0 after:right-0 after:top-1/2 after:h-[1px] after:bg-red-500 after:rotate-[-15deg] after:origin-center">
            -15%
          </span>
        </div>
        <span className="text-sm text-muted-foreground">/mês</span>
      </div>
    );
  };

  const handleSubscribe = async (planKey: PlanKey) => {
    // Free plan - redirect to signup or app
    if (planKey === 'free') {
      if (!userId) {
        window.location.href = '/auth/signup';
      } else {
        window.location.href = '/app';
      }
      return;
    }

    // Check if user is logged in
    if (!userId) {
      toast({
        title: "Login necessário",
        description: "Faça login para assinar um plano",
        variant: "destructive",
      });
      window.location.href = '/auth/login';
      return;
    }

    // Check if already has this plan
    if (activePlans.includes(planKey)) {
      toast({
        title: "Plano já ativo",
        description: "Você já possui este plano ativo",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Email não encontrado");

      const PRICE_MAP: Record<string, Record<string, string>> = {
        medico: {
          mensal: import.meta.env.VITE_PRICE_MEDICO_MENSAL,
          anual: import.meta.env.VITE_PRICE_MEDICO_ANUAL,
        },
        juridico: {
          mensal: import.meta.env.VITE_PRICE_JURIDICO_MENSAL,
          anual: import.meta.env.VITE_PRICE_JURIDICO_ANUAL,
        },
        veterinario: {
          mensal: import.meta.env.VITE_PRICE_VET_MENSAL,
          anual: import.meta.env.VITE_PRICE_VET_ANUAL,
        },
        especialista: {
          mensal: import.meta.env.VITE_PRICE_ESPECIALISTA_MENSAL,
          anual: import.meta.env.VITE_PRICE_ESPECIALISTA_ANUAL,
        },
      };

      const billingCycle = isAnnual ? 'anual' : 'mensal';
      const priceId = PRICE_MAP[planKey]?.[billingCycle];

      if (!priceId) {
        throw new Error("Price ID não configurado");
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          price_id: priceId,
          customer_email: user.email,
          metadata: {
            user_id: user.id,
            plan_type: planKey,
            billing_cycle: billingCycle,
          },
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("URL do checkout não retornada");

      window.location.href = data.url;
    } catch (error: any) {
      console.error('Erro ao criar checkout:', error);
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar sessão de checkout",
        variant: "destructive",
      });
    }
  };

  return (
    <section id="planos" className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-4xl font-bold mb-4">Escolha o Plano Ideal Para Você</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Acesso especializado para cada área profissional
          </p>
          
          {/* Billing Cycle Toggle */}
          <div className="inline-flex items-center gap-4 bg-muted/50 px-6 py-4 rounded-full border border-border">
            <span className={`text-xl font-bold transition-all ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Mensal
            </span>
            <Switch
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
              className="data-[state=checked]:bg-primary scale-125"
            />
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold transition-all ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
                Anual
              </span>
              <Badge 
                variant="secondary" 
                className={`font-semibold transition-all ${
                  isAnnual 
                    ? "bg-primary/20 text-foreground border-primary/30" 
                    : "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30"
                }`}
              >
                -{discountPercentage}%
              </Badge>
            </div>
          </div>
        </div>

        {/* Plans Grid - Dynamic grid based on active plans count */}
        {(() => {
          const visiblePlans = Object.entries(plans)
            .filter(([key]) => showFree || key !== 'free')
            .filter(([key]) => isPlanActive(key));
          
          const planCount = visiblePlans.length;
          
          // Dynamic grid classes based on number of visible plans
          const getGridClasses = () => {
            if (planCount === 1) return 'grid-cols-1 max-w-md';
            if (planCount === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-2xl';
            if (planCount === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl';
            if (planCount === 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl';
            return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 max-w-7xl';
          };
          
          return (
            <div className={`grid ${getGridClasses()} gap-6 mx-auto`}>
              {visiblePlans.map(([key, plan]) => {
              const planKey = key as PlanKey;
              const isActive = activePlans.includes(planKey);
              const isScheduled = scheduledCancellations.includes(planKey);
              
              console.log('Pricing - Plan check:', { planKey, isActive, isScheduled, activePlans, scheduledCancellations });
              
              let buttonText = "Assinar";
              
              if (planKey === 'free') {
                buttonText = userId ? "Ir para o App" : "Começar Grátis";
              } else if (isActive) {
                buttonText = "Plano Ativo";
              } else if (isScheduled) {
                buttonText = "Cancelamento Programado";
              }

              return (
                <Card
                  key={key}
                  className={`gradient-card border-border hover:border-primary/50 transition-smooth hover:shadow-glow relative flex flex-col ${
                    plan.popular ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Popular</Badge>
                    </div>
                  )}

                  <CardHeader className="pb-6">
                    <h3 className="text-xl font-bold mb-2">
                      {plan.name}
                    </h3>
                    <div className="mb-6">{getDisplayPrice(plan)}</div>
                  </CardHeader>

                  <CardContent className="flex flex-col flex-grow">
                    <ul className="space-y-3 flex-grow mb-6">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handleSubscribe(planKey)}
                      disabled={isActive}
                      className={`w-full font-semibold transition-smooth ${
                        isActive
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : plan.popular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                      }`}
                      size="lg"
                    >
                      {buttonText}
                    </Button>
                    
                    {isAnnual && plan.monthlyPrice > 0 && (
                      <div className="text-xs text-muted-foreground text-center mt-3">
                        (R$ {plan.annualTotalPrice.toFixed(2).replace(".", ",")} cobrados anualmente)
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            </div>
          );
        })()}

        {/* Additional Info */}
        <div className="mt-8 sm:mt-12 text-center px-4">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Todos os planos incluem 7 dias de garantia de reembolso • Cancele a
            qualquer momento
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
