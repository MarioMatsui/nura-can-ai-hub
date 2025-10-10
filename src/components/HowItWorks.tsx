import { Card, CardContent } from "@/components/ui/card";
import {
  Settings,
  MessageCircle,
  ShieldCheck,
  Database,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const steps = [
  {
    icon: Settings,
    title: "Seleciona um Modelo",
    description: "Escolha entre assistência médica, veterinária ou jurídica",
  },
  {
    icon: MessageCircle,
    title: "Digita a Necessidade",
    description: "Faça sua pergunta ou descreva seu caso de forma clara",
  },
  {
    icon: ShieldCheck,
    title: "Checagem de Segurança",
    description: "Sistema valida e processa sua solicitação",
  },
  {
    icon: Database,
    title: "Consulta Banco de Dados",
    description: "IA busca em base científica especializada",
  },
  {
    icon: Sparkles,
    title: "Resposta Baseada em Dados",
    description: "Modelo responde com informações verificadas",
  },
];

const HowItWorks = () => {
  return (
    <section id="como-funciona" className="py-20 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-20">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
            Como Funciona?
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            Um processo simples e seguro em 5 etapas
          </p>
        </div>

        {/* Desktop view - horizontal flow */}
        <div className="hidden lg:block">
          <div className="relative">
            {/* Connection line */}
            <div className="absolute top-20 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-secondary to-primary opacity-30" />

            <div className="grid grid-cols-5 gap-4">
              {steps.map((step, index) => (
                <div key={index} className="relative">
                  <Card className="gradient-card border-border hover:border-primary/50 transition-smooth hover:shadow-glow group">
                    <CardContent className="p-6 text-center">
                      {/* Step number */}
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-glow">
                        {index + 1}
                      </div>

                      <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth group-hover:scale-110 transition-bounce mt-4">
                        <step.icon className="w-7 h-7 text-primary" />
                      </div>

                      <h3 className="text-base font-bold mb-2">
                        {step.title}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Arrow between cards */}
                  {index < steps.length - 1 && (
                    <div className="absolute top-1/2 -right-2 -translate-y-1/2 z-10">
                      <ArrowRight className="w-4 h-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile/Tablet view - vertical flow */}
        <div className="lg:hidden space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <Card className="gradient-card border-border hover:border-primary/50 transition-smooth hover:shadow-glow group">
                <CardContent className="p-6 sm:p-8 flex items-start gap-4 sm:gap-6">
                  {/* Step indicator */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-glow">
                      {index + 1}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-smooth">
                        <step.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Arrow between cards */}
              {index < steps.length - 1 && (
                <div className="flex justify-center my-2">
                  <ArrowRight className="w-6 h-6 text-primary rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
