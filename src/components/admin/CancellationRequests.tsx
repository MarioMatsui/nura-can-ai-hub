import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CancellationRequest {
  id: string;
  user_id: string;
  subscription_id: string;
  provider: string;
  provider_subscription_id: string;
  plan_code: string;
  status: string;
  effective_cancel_at: string;
  created_at: string;
  processed_at: string | null;
  profiles: {
    full_name: string;
    email: string;
  };
}

export const CancellationRequests = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('cancellation_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles separately
      const requestsWithProfiles = await Promise.all(
        (data || []).map(async (request) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', request.user_id)
            .single();

          return {
            ...request,
            profiles: profile || { full_name: 'N/A', email: 'N/A' },
          };
        })
      );

      setRequests(requestsWithProfiles);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleMarkProcessed = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      // Update cancellation request
      const { error: updateError } = await supabase
        .from('cancellation_requests')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Update admin notifications
      const { error: notifError } = await supabase
        .from('admin_notifications')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('type', 'subscription_cancellation_request')
        .contains('payload', { cancellation_request_id: requestId });

      if (notifError) throw notifError;

      toast({
        title: 'Sucesso',
        description: 'Solicitação marcada como processada',
      });

      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'processed':
        return <Badge variant="default">Processado</Badge>;
      case 'reverted':
        return <Badge variant="outline">Revertido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPlanLabel = (planCode: string) => {
    const labels: Record<string, string> = {
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
      specialist: 'Especialista',
      free: 'Gratuito',
    };
    return labels[planCode] || planCode;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitações de Cancelamento</CardTitle>
        <CardDescription>
          Gerencie solicitações de cancelamento de assinaturas dos usuários
        </CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma solicitação de cancelamento
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Efetivar em</TableHead>
                  <TableHead>Solicitado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {(request.profiles as any)?.full_name || 'N/A'}
                    </TableCell>
                    <TableCell>{(request.profiles as any)?.email || 'N/A'}</TableCell>
                    <TableCell>{getPlanLabel(request.plan_code)}</TableCell>
                    <TableCell>
                      {new Date(request.effective_cancel_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      {new Date(request.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      {request.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkProcessed(request.id)}
                          disabled={processingId === request.id}
                        >
                          {processingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Marcar como processado
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};