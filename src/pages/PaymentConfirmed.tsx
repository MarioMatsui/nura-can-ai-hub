import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';

const PaymentConfirmed = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'pending'>('processing');
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  useEffect(() => {
    window.scrollTo(0, 0);

    const checkSubscriptionStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setStatus('pending');
          return;
        }

        const { data: subscriptions } = await supabase
          .from('user_subscriptions')
          .select('plan_type, status')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (subscriptions && subscriptions.length > 0) {
          setStatus('success');
        } else if (attempts < maxAttempts) {
          // Continue polling
          setTimeout(() => {
            setAttempts(prev => prev + 1);
          }, 2000);
        } else {
          setStatus('pending');
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
        if (attempts < maxAttempts) {
          setTimeout(() => {
            setAttempts(prev => prev + 1);
          }, 2000);
        } else {
          setStatus('pending');
        }
      }
    };

    if (status === 'processing' && attempts < maxAttempts) {
      checkSubscriptionStatus();
    }
  }, [attempts, status]);

  const handleGoToApp = () => {
    navigate('/app');
  };

  const handleGoToPlans = () => {
    navigate('/planos');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-background/80">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <img
            src={logo}
            alt="NuraCan AI"
            className="h-16 mx-auto mb-6"
          />
        </div>

        <Card className="gradient-card border-border shadow-glow">
          <CardContent className="pt-8 pb-8 px-6 text-center">
            {status === 'processing' && (
              <>
                <div className="mb-6 flex justify-center">
                  <Loader2 className="h-16 w-16 text-primary animate-spin" />
                </div>
                <h1 className="text-3xl font-bold mb-4">
                  Processando seu pagamento...
                </h1>
                <p className="text-muted-foreground mb-6">
                  Estamos confirmando seu pagamento com o CannaPag. Isso pode levar alguns instantes.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    {[...Array(maxAttempts)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 w-2 rounded-full transition-colors ${
                          i <= attempts ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <span>Verificando ativação...</span>
                </div>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="mb-6 flex justify-center">
                  <div className="rounded-full bg-green-500/10 p-4">
                    <CheckCircle className="h-16 w-16 text-green-500" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold mb-4">
                  Pagamento Confirmado!
                </h1>
                <p className="text-lg text-muted-foreground mb-6">
                  Seu plano foi ativado com sucesso e já está disponível para uso.
                </p>
                <div className="bg-muted/50 rounded-lg p-6 mb-6">
                  <h2 className="text-lg font-semibold mb-3">
                    O que acontece agora?
                  </h2>
                  <ul className="text-left space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>Sua assinatura está ativa e pronta para uso</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>Acesso completo a todos os recursos do seu plano</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>Consultas ilimitadas ao modelo especializado</span>
                    </li>
                  </ul>
                </div>
                <Button
                  onClick={handleGoToApp}
                  size="lg"
                  className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                >
                  Ir para o Aplicativo
                </Button>
              </>
            )}

            {status === 'pending' && (
              <>
                <div className="mb-6 flex justify-center">
                  <div className="rounded-full bg-yellow-500/10 p-4">
                    <AlertCircle className="h-16 w-16 text-yellow-500" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold mb-4">
                  Pagamento Confirmado no CannaPag
                </h1>
                <p className="text-lg text-muted-foreground mb-6">
                  Seu pagamento foi aprovado e está sendo processado. A ativação do seu plano deve ocorrer em instantes.
                </p>
                <div className="bg-muted/50 rounded-lg p-6 mb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    <strong>O que fazer agora?</strong>
                  </p>
                  <ul className="text-left space-y-2 text-sm text-muted-foreground">
                    <li>• Aguarde alguns segundos e atualize esta página</li>
                    <li>• Ou acesse a página de planos para verificar o status</li>
                    <li>• Se o problema persistir, entre em contato com o suporte</li>
                  </ul>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                    size="lg"
                  >
                    Atualizar Página
                  </Button>
                  <Button
                    onClick={handleGoToPlans}
                    size="lg"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Ver Meus Planos
                  </Button>
                </div>
              </>
            )}

            <p className="text-sm text-muted-foreground mt-8">
              Precisa de ajuda?{' '}
              <a
                href="mailto:suporte@nuracan.ai"
                className="text-primary hover:underline"
              >
                Entre em contato
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentConfirmed;
