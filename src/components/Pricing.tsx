import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    annualPrice: 0,
    monthlyLink: "",
    annualLink: "",
    popular: false,
  },
  medical: {
    name: "Médico",
    description: "",
    features: [
      "Modelo especializado para médicos",
      "Consultas ilimitadas",
      "Acesso a banco de dados médico",
      "Respostas baseadas em evidências científicas",
    ],
    monthlyPrice: 69.9,
    annualPrice: 718.8,
    monthlyLink: "https://gateway.cannapag.com/pagamento/e68ce176-b2b0-4013-817c-a02d29419176",
    annualLink: "https://gateway.cannapag.com/pagamento/0c4d0af3-b48d-4ed7-b59b-d8b76eb6e538",
    popular: false,
  },
  legal: {
    name: "Jurídico",
    description: "",
    features: [
      "Modelo especializado para juristas",
      "Consultas ilimitadas",
      "Acesso a banco de dados jurídico",
      "Informações sobre regulamentação",
    ],
    monthlyPrice: 59.9,
    annualPrice: 598.8,
    monthlyLink: "https://gateway.cannapag.com/pagamento/9dbfd8f1-3edf-46ed-a6d7-50de12176ed3",
    annualLink: "https://gateway.cannapag.com/pagamento/ed2d1e63-4fb8-4cfb-9cb7-b26710ce979b",
    popular: false,
  },
  veterinary: {
    name: "Veterinário",
    description: "",
    features: [
      "Modelo especializado para veterinários",
      "Consultas ilimitadas",
      "Acesso a banco de dados veterinário",
      "Evidências científicas em medicina veterinária",
    ],
    monthlyPrice: 49.9,
    annualPrice: 478.8,
    monthlyLink: "https://gateway.cannapag.com/pagamento/8a33c660-b08f-44b2-84d1-c5f9c907d912",
    annualLink: "https://gateway.cannapag.com/pagamento/9b779179-68b7-4f03-9862-991a14c426f9",
    popular: false,
  },
  specialist: {
    name: "Especialista",
    description: "",
    features: [
      "IA avançada que integra as 3 especialidades em um único modelo superior",
      "Consultas ilimitadas em todas as áreas",
      "Todos os bancos de dados especializados",
      "Máxima flexibilidade profissional",
      "Melhor custo-benefício",
    ],
    monthlyPrice: 119.9,
    annualPrice: 1188,
    monthlyLink: "https://gateway.cannapag.com/pagamento/4e8284a1-3f3d-4ac1-b7fb-aa1102922539",
    annualLink: "https://gateway.cannapag.com/pagamento/9082ff5d-4283-441f-a395-2b045b746192",
    popular: true,
  },
};

const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

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
    // Get current user ID
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const getDisplayPrice = (plan: typeof plans.medical) => {
    if (plan.monthlyPrice === 0) return "Grátis";
    
    if (isAnnual) {
      const monthlyEquivalent = plan.annualPrice / 12;
      return (
        <div className="flex flex-col items-center">
          <div className="flex flex-col items-center">
            <span className="text-2xl sm:text-3xl font-bold">
              R$ {monthlyEquivalent.toFixed(2).replace(".", ",")}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="line-through">
              R$ {plan.monthlyPrice.toFixed(2).replace(".", ",")}
            </span>
            {" • "}cobrado anualmente
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col items-center">
        <span className="text-2xl sm:text-3xl font-bold">
          R$ {plan.monthlyPrice.toFixed(2).replace(".", ",")}
        </span>
        <span className="text-sm text-muted-foreground">/mês</span>
      </div>
    );
  };

  const handleSubscribe = (plan: typeof plans.medical) => {
    if (plan.monthlyPrice === 0) return;
    
    // Check if user is logged in
    if (!userId) {
      toast.error('Você precisa estar logado para assinar um plano');
      navigate('/auth/login');
      return;
    }

    // Get the base payment link
    const baseLink = isAnnual ? plan.annualLink : plan.monthlyLink;
    
    // Add user ID as external_reference
    const paymentUrl = `${baseLink}?external_reference=${userId}`;
    
    console.log('Redirecting to payment with external_reference:', userId);
    
    // Redirect to payment page
    window.location.href = paymentUrl;
  };

  return (
    <section id="planos" className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
            Escolha o Plano Ideal Para Você
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8">
            Acesso especializado para cada área profissional
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-2 sm:gap-4 p-2 rounded-full bg-muted/50 border border-border">
            <span
              className={`px-3 sm:px-4 py-2 rounded-full text-sm sm:text-base font-medium transition-smooth ${
                !isAnnual
                  ? "bg-background text-foreground shadow-card"
                  : "text-muted-foreground"
              }`}
            >
              Mensal
            </span>
            <Switch
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
              className="data-[state=checked]:bg-primary"
            />
            <span
              className={`px-3 sm:px-4 py-2 rounded-full text-sm sm:text-base font-medium transition-smooth flex items-center gap-1 sm:gap-2 ${
                isAnnual
                  ? "bg-background text-foreground shadow-card"
                  : "text-muted-foreground"
              }`}
            >
              Anual
              <span className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full" style={{ backgroundColor: 'rgba(149, 199, 0, 0.1)', color: '#95c700' }}>
                -{discountPercentage}%
              </span>
            </span>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6 lg:gap-8 max-w-7xl mx-auto">
          {Object.entries(plans).map(([key, plan]) => (
            <Card
              key={key}
              className={`gradient-card border-border hover:border-primary/50 transition-smooth hover:shadow-glow relative flex flex-col ${
                plan.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground rounded-full text-sm font-semibold flex items-center gap-1 shadow-glow whitespace-nowrap">
                  <Sparkles className="w-3 h-3" />
                  Mais Popular
                </div>
              )}

              <CardHeader className="pb-4 sm:pb-6">
                <h3 className="text-lg sm:text-xl font-bold mb-2">
                  {plan.name}
                </h3>
                {plan.description && (
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                    {plan.description}
                  </p>
                )}
                <div className="mb-4 sm:mb-6">{getDisplayPrice(plan)}</div>
              </CardHeader>

              <CardContent className="flex flex-col flex-grow">
                <ul className="space-y-2 sm:space-y-3 flex-grow mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(plan)}
                  disabled={plan.monthlyPrice === 0}
                  className={`w-full font-semibold transition-smooth ${
                    plan.popular
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  }`}
                  size="lg"
                >
                  {plan.monthlyPrice === 0 ? "Começar Grátis" : "Assinar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

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
