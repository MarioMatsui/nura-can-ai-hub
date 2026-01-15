import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import heroAppPreview from "@/assets/hero-app-preview.png";

const Hero = () => {
  const scrollToPlans = () => {
    const element = document.getElementById("planos");
    element?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Minimalist gradient background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Text Content */}
          <div className="text-left">
            {/* Main Heading */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl font-bold mb-6 sm:mb-8 leading-tight">
              A sua nova parceira em <span className="text-primary">Estudos C/\NN/\BICOS</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-8 sm:mb-12 leading-relaxed">
              Consulte uma base de conhecimento científico global, obtenha respostas baseadas em evidências e acelere suas
              pesquisas.
            </p>

            {/* CTA Button */}
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Button
                size="lg"
                onClick={scrollToPlans}
                className="group bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow transition-smooth text-lg px-8 py-6 w-full sm:w-auto"
              >
                Experimentar
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-smooth" />
              </Button>
            </div>
          </div>

          {/* Right Column - Image */}
          <div className="flex justify-center lg:justify-end">
            <img
              src={heroAppPreview}
              alt="Preview da aplicação Nura"
              className="w-full max-w-[600px] h-auto rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
