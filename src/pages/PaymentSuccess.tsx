import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import logo from "@/assets/logo.png";

const PaymentSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  const handleGoToApp = () => {
    navigate("/app");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-3 mb-6">
            <span className="text-3xl font-bold">
              Nura<span className="text-primary">Can</span> AI
            </span>
          </div>
        </div>

        {/* Success Card */}
        <Card className="gradient-card border-primary/20 shadow-glow animate-scale-in">
          <CardContent className="p-8 sm:p-12 text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center mb-6 animate-pulse">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>

            {/* Main Message */}
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">Pagamento Confirmado!</h1>

            <p className="text-lg text-muted-foreground mb-6 max-w-md mx-auto">
              Sua assinatura foi ativada com sucesso. Agora você tem acesso completo aos recursos da plataforma.
            </p>

            {/* Success Details */}
            <div className="bg-muted/30 rounded-lg p-6 mb-8 space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>Assinatura ativada</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>Acesso liberado aos modelos de IA</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>Consultas ilimitadas</span>
              </div>
            </div>

            {/* CTA Button */}
            <Button
              onClick={handleGoToApp}
              size="lg"
              className="group bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow transition-smooth text-lg px-8 py-6 w-full sm:w-auto"
            >
              Começar a Usar Agora
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-smooth" />
            </Button>

            {/* Additional Info */}
            <p className="text-sm text-muted-foreground mt-6">
              Um e-mail de confirmação foi enviado para o seu endereço cadastrado com todos os detalhes da sua
              assinatura.
            </p>
          </CardContent>
        </Card>

        {/* Support Section */}
        <div className="text-center mt-8 text-sm text-muted-foreground animate-fade-in">
          <p>
            Precisa de ajuda?{" "}
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Entre em contato com nosso suporte
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
