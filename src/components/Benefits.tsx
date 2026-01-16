import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, Shield } from "lucide-react";

const benefits = [
  {
    icon: CheckCircle2,
    title: "Respostas Baseadas em Evidências",
    description:
      "Todas as respostas são fundamentadas em estudos científicos, publicações peer-reviewed e guidelines clínicos atualizados.",
    gradient: "from-primary/20 to-primary/5",
  },
  {
    icon: Clock,
    title: "Economia de Tempo em Pesquisa",
    description:
      "Encontre informações relevantes em segundos ao invés de horas de busca em bases de dados e literatura científica.",
    gradient: "from-primary/20 to-secondary/5",
  },
  {
    icon: Shield,
    title: "Segurança e Conformidade",
    description:
      "Informações alinhadas com regulamentações locais e internacionais, garantindo prática segura e legal.",
    gradient: "from-secondary/20 to-secondary/5",
  },
];

const Benefits = () => {
  return (
    <section id="beneficios" className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
            Por Que Escolher a <span className="text-primary">Nura?</span>
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            Benefícios que transformam a forma como você trabalha com C/\NN/\BIS medicinal
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {benefits.map((benefit, index) => (
            <Card
              key={index}
              className="gradient-card border-border hover:border-primary/50 transition-smooth hover:shadow-glow group relative overflow-hidden"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${benefit.gradient} opacity-0 group-hover:opacity-100 transition-smooth`}
              />
              <CardContent className="p-8 sm:p-10 relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-smooth group-hover:scale-110 transition-bounce">
                  <benefit.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">{benefit.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
