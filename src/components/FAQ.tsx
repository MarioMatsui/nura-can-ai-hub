import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Phone } from "lucide-react";

const faqItems = [
  {
    question: "A NuraAI substitui o julgamento de um profissional?",
    answer:
      "Não! Nós somos uma ferramenta de suporte ao conhecimento do profissional ou entusiasta. A NuraCan AI foi desenvolvida para auxiliar e acelerar pesquisas, mas nunca substitui a expertise e o julgamento crítico de um profissional qualificado.",
  },
  {
    question: "O que embasa o conhecimento dos seus modelos?",
    answer:
      "Nossos modelos são munidos com os melhores e mais completos artigos e materiais das mais diversas áreas do ramo medicinal da Cannabis. Utilizamos publicações peer-reviewed, estudos científicos atualizados e guidelines clínicos reconhecidos internacionalmente.",
  },
  {
    question: "Funciona no celular?",
    answer:
      "Sim! Nossa plataforma funciona tanto em Android quanto iOS. O web app é totalmente responsivo e otimizado para proporcionar a melhor experiência em qualquer dispositivo.",
  },
  {
    question:
      "Os modelos oferecem dicas de compras ou como conseguir produtos ilegais?",
    answer:
      "NÃO! Nossa plataforma é voltada para dar suporte ao estudo da cannabis, principalmente voltado para o mercado profissional. Respeitamos todas as legislações vigentes e promovemos apenas o uso legal e medicinal da cannabis.",
  },
];

const FAQ = () => {
  const handleWhatsAppContact = () => {
    // Adicione o número de WhatsApp aqui
    const phoneNumber = "5511999999999"; // Formato: código do país + DDD + número
    const message = encodeURIComponent(
      "Olá! Vim através do site da NuraCan AI e gostaria de saber mais informações."
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
  };

  return (
    <section id="faq" className="py-20 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
              Perguntas Frequentes
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground">
              Tire suas dúvidas sobre a NuraCan AI
            </p>
          </div>

          {/* FAQ Accordion */}
          <Card className="gradient-card border-border mb-12">
            <CardContent className="p-6 sm:p-8">
              <Accordion type="single" collapsible className="w-full">
                {faqItems.map((item, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left hover:text-primary transition-smooth text-base sm:text-lg font-semibold">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed text-sm sm:text-base">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Contact Section */}
          <Card className="gradient-card border-primary/20 shadow-glow">
            <CardContent className="p-8 sm:p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <MessageCircle className="w-8 h-8 text-primary" />
              </div>
              
              <h3 className="text-2xl sm:text-3xl font-bold mb-4">
                Ainda tem dúvidas?
              </h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Nossa equipe está pronta para ajudar! Entre em contato pelo
                WhatsApp e tire todas as suas dúvidas.
              </p>

              <Button
                onClick={handleWhatsAppContact}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow transition-smooth group"
              >
                <Phone className="mr-2 w-5 h-5 group-hover:rotate-12 transition-smooth" />
                Falar com Atendimento
              </Button>

              <p className="text-sm text-muted-foreground mt-4">
                Horário de atendimento: Segunda a Sexta, 9h às 18h
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
