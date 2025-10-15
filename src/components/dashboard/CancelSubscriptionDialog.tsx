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
}

export const CancelSubscriptionDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: CancelSubscriptionDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-cancellation');

      // Check for HTTP errors first
      if (error) {
        throw error;
      }

      // Check for application errors in the response
      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Solicitação enviada',
        description: 'Você receberá um e-mail de confirmação.',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      // Extract meaningful error message
      let errorMessage = 'Não foi possível processar sua solicitação';
      
      // Try different ways to get the error message
      if (error?.context?.body?.error) {
        // Error from edge function response body
        errorMessage = error.context.body.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Erro',
        description: errorMessage,
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