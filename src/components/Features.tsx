import { useState } from "react";
import { Search, MessageCircle, Syringe, BarChart3, Sparkles, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageLightbox from "@/components/ui/image-lightbox";

// Feature images
import pesquisaImg from "@/assets/features/pesquisa.webp";
import atendimentoImg from "@/assets/features/atendimento.webp";
import dosagemImg from "@/assets/features/dosagem.webp";
import analiseImg from "@/assets/features/analise.webp";
import hobbyImg from "@/assets/features/hobby.webp";

const features = [
  {
    id: "pesquisa",
    label: "Pesquisa",
    icon: Search,
    image: pesquisaImg,
    description: "Encontre respostas rápidas e confiáveis com base no nosso acervo de conteúdos, estudos e materiais organizados — com contexto e referências quando necessário.",
  },
  {
    id: "atendimento",
    label: "Atendimento",
    icon: MessageCircle,
    image: atendimentoImg,
    description: "Converse de forma fluida para triagem, dúvidas e orientação inicial. Um assistente que organiza informações, sugere próximos passos e mantém o atendimento claro.",
  },
  {
    id: "dosagem",
    label: "Dosagem",
    icon: Syringe,
    image: dosagemImg,
    description: "Apoio inteligente para interpretar protocolos, entender concentrações e estruturar rotinas de uso com segurança — sempre destacando limites e a importância do acompanhamento profissional.",
  },
  {
    id: "analise",
    label: "Análise",
    icon: BarChart3,
    image: analiseImg,
    description: "Transforme dados em decisão: resumos, comparações, pontos-chave e insights práticos a partir de relatórios, documentos e informações clínicas ou de produto.",
  },
  {
    id: "hobby",
    label: "Hobby",
    icon: Sparkles,
    image: hobbyImg,
    description: "Use a IA para criatividade e bem-estar: ideias, planos, estudos, organização pessoal e descobertas — com um toque leve, útil e divertido.",
  },
];

const Features = () => {
  const [activeTab, setActiveTab] = useState("pesquisa");
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const activeFeature = features.find((f) => f.id === activeTab) || features[0];

  return (
    <section className="py-20 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Title */}
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-10 sm:mb-14">
            Funcionalidades Poderosas
          </h2>

          {/* Tabs */}
          <div className="flex justify-center mb-8 sm:mb-12">
            <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 px-1 scrollbar-hide max-w-full">
              {features.map((feature) => {
                const Icon = feature.icon;
                const isActive = activeTab === feature.id;
                return (
                  <button
                    key={feature.id}
                    onClick={() => setActiveTab(feature.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-medium text-sm sm:text-base whitespace-nowrap transition-all duration-300",
                      isActive
                        ? "bg-foreground text-background shadow-lg"
                        : "bg-background border border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{feature.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="relative">
            {features.map((feature) => (
              <div
                key={feature.id}
                className={cn(
                  "transition-all duration-300",
                  activeTab === feature.id
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4 absolute inset-0 pointer-events-none"
                )}
              >
                {/* Image Container */}
                <div className="rounded-3xl bg-muted/40 border border-border/60 p-2 sm:p-3 shadow-sm mb-6 sm:mb-8">
                  {feature.image ? (
                    <img
                      src={feature.image}
                      alt={feature.label}
                      className="w-full h-auto max-h-[500px] object-cover rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
                      loading="lazy"
                      decoding="async"
                      onClick={() => setLightboxImage({ src: feature.image, alt: feature.label })}
                    />
                  ) : (
                    <div className="w-full h-[400px] rounded-2xl bg-muted flex flex-col items-center justify-center gap-3">
                      <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                      <span className="text-muted-foreground text-sm">Imagem em breve</span>
                    </div>
                  )}
                </div>

                {/* Title + Description Row */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-8">
                  <h3 className="text-xl sm:text-2xl font-bold text-foreground shrink-0">
                    {feature.label}
                  </h3>
                  <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        src={lightboxImage?.src || ""}
        alt={lightboxImage?.alt || ""}
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </section>
  );
};

export default Features;
