import { Card, CardContent } from "@/components/ui/card";
import { Stethoscope, Heart, Scale, MessageSquare, Laptop, Infinity } from "lucide-react";

const features = [
  {
    icon: Stethoscope,
    title: "Assistência Médica com IA",
    description: "Suporte especializado para médicos com base em literatura científica atualizada",
  },
  {
    icon: Heart,
    title: "Assistência Veterinária com IA",
    description: "Orientações para tratamentos veterinários com C.a.n.n.a.b.!.s medicinal",
  },
  {
    icon: Scale,
    title: "Assistência Jurídica com IA",
    description: "Informações legais e regulatórias sobre C.a.n.n.a.b.!.s medicinal",
  },
  {
    icon: MessageSquare,
    title: "Chat Inteligente Especializado",
    description: "Conversas contextualizadas com IA treinada em C.a.n.n.a.b.!.s medicinal",
  },
  {
    icon: Laptop,
    title: "Web App Fácil",
    description: "Interface intuitiva e responsiva para qualquer dispositivo",
  },
  {
    icon: Infinity,
    title: "Consultas Ilimitadas",
    description: "Sem limites de perguntas ou pesquisas em seu plano",
  },
];

const Features = () => {
  return (
    <section className="py-20 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">Funcionalidades Poderosas</h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            Tudo que você precisa para pesquisar e aplicar C/\NN/\BIS medicinal com segurança e eficácia
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="gradient-card border-border hover:border-primary/50 transition-smooth hover:shadow-glow group"
            >
              <CardContent className="p-6 sm:p-8">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-primary/20 transition-smooth group-hover:scale-110 transition-bounce">
                  <feature.icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
