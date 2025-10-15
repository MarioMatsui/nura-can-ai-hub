import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  subscriptionId: string | null;
}

export const CancelSubscriptionDialog = ({
  open,
  onOpenChange,
  onSuccess,
  subscriptionId,
}: CancelSubscriptionDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!subscriptionId) {
      toast({
        title: 'Erro',
        description: 'Nenhuma assinatura selecionada',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke('request-cancellation', {
        body: { subscription_id: subscriptionId }
      });

      // Check for HTTP errors
      if (response.error) {
        // Try to parse error from response
        let errorMessage = 'Não foi possível processar sua solicitação';
        
        try {
          // The error body might be in different places
          if (response.error.context?.body) {
            const errorBody = response.error.context.body;
            if (typeof errorBody === 'string') {
              const parsed = JSON.parse(errorBody);
              errorMessage = parsed.error || errorMessage;
            } else if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } else if (response.error.message) {
            errorMessage = response.error.message;
          }
        } catch (e) {
          // If parsing fails, use the default message
          console.error('Error parsing error response:', e);
        }
        
        throw new Error(errorMessage);
      }

      // Check for application errors in the response data
      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Solicitação enviada',
        description: 'Você receberá um e-mail de confirmação.',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível processar sua solicitação',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza de que deseja cancelar sua assinatura? Você manterá o acesso até o fim do
            período já pago. Sua solicitação será enviada à nossa equipe e o cancelamento ocorrerá
            automaticamente na data de término do ciclo. Você receberá um e-mail agora e outro
            quando for concluído.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando...
              </>
            ) : (
              'Confirmar cancelamento'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};