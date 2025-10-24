import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle, ArrowLeft } from "lucide-react";

const PaymentCanceled = () => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate("/planos");
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

        {/* Canceled Card */}
        <Card className="border-muted shadow-lg animate-scale-in">
          <CardContent className="p-8 sm:p-12 text-center">
            {/* Canceled Icon */}
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center mb-6">
              <XCircle className="w-12 h-12 text-muted-foreground" />
            </div>

            {/* Main Message */}
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">Pagamento Cancelado</h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              Você cancelou o processo de pagamento. Nenhuma cobrança foi realizada.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleGoBack}
                size="lg"
                className="group bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-smooth"
              >
                <ArrowLeft className="mr-2 w-5 h-5 group-hover:-translate-x-1 transition-smooth" />
                Ver Planos Novamente
              </Button>
            </div>

            {/* Additional Info */}
            <p className="text-sm text-muted-foreground mt-8">
              Se você teve algum problema durante o processo, entre em contato com nosso suporte.
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

export default PaymentCanceled;
