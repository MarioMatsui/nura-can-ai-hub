import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { LogOut, Loader2, CreditCard, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';
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

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: any;
  user: any;
  subscriptions: any[];
  appTheme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const AVATAR_DEFAULT_URL = 'https://canfy.com.br/wp-content/uploads/2025/10/iconpfpNura.jpg';

export const SettingsModal = ({
  open,
  onOpenChange,
  profile,
  user,
  subscriptions,
  appTheme,
  onThemeToggle,
}: SettingsModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loadingName, setLoadingName] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [loadingRevert, setLoadingRevert] = useState(false);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [hasPendingCancellation, setHasPendingCancellation] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  const getPlanLabel = (planType: string) => {
    const labels: Record<string, string> = {
      free: 'Gratuito',
      medico: 'Médico',
      juridico: 'Jurídico',
      veterinario: 'Veterinário',
      especialista: 'Especialista',
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
      specialist: 'Especialista',
    };
    return labels[planType] || 'Plano Gratuito';
  };

  const getStatusBadge = (status: string, cancelAtPeriodEnd: boolean) => {
    if (cancelAtPeriodEnd) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Cancelamento Programado</Badge>;
    }
    
    const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
      active: { label: 'Ativo', variant: 'default' },
      trialing: { label: 'Período de teste', variant: 'secondary' },
      past_due: { label: 'Pagamento pendente', variant: 'destructive' },
      canceled: { label: 'Cancelado', variant: 'outline' },
      incomplete: { label: 'Incompleto', variant: 'destructive' },
      inactive: { label: 'Inativo', variant: 'outline' },
    };
    
    const statusInfo = statusMap[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const activePlans = subscriptions?.filter(s => s.status === 'active' || s.status === 'scheduled_cancellation') || [];
  const currentPlan = activePlans[0]; // Since user_plans is one record per user
  
  const handleManageSubscription = async () => {
    if (!currentPlan || !(currentPlan as any).stripe_customer_id) {
      toast({
        title: 'Erro',
        description: 'Informações de assinatura não encontradas',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: {
          stripe_customer_id: (currentPlan as any).stripe_customer_id,
          return_url: window.location.href,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("URL do portal não retornada");

      // Abrir portal em nova aba
      window.open(data.url, '_blank');
      
      toast({
        title: 'Sucesso',
        description: 'Portal de gerenciamento aberto em nova aba',
      });
    } catch (error: any) {
      console.error('Erro ao abrir portal:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível abrir o portal de gerenciamento',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateName = async () => {
    if (!fullName.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome não pode estar vazio',
        variant: 'destructive',
      });
      return;
    }

    setLoadingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);

    setLoadingName(false);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o nome',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Sucesso',
      description: 'Nome atualizado com sucesso',
    });
  };

  const handleUpdateEmail = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast({
        title: 'Erro',
        description: 'E-mail inválido',
        variant: 'destructive',
      });
      return;
    }

    setLoadingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setLoadingEmail(false);

    if (error) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar o e-mail',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Verificação enviada',
      description: 'Verifique seu novo e-mail para confirmar a alteração',
    });
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem',
        variant: 'destructive',
      });
      return;
    }

    setLoadingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoadingPassword(false);

    if (error) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar a senha',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Sucesso',
      description: 'Senha atualizada com sucesso',
    });
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível fazer logout',
        variant: 'destructive',
      });
      return;
    }
    onOpenChange(false);
    navigate('/');
  };

  const handleResumeSubscription = async () => {
    if (!selectedSubscriptionId) {
      toast({
        title: 'Erro',
        description: 'Nenhuma assinatura selecionada',
        variant: 'destructive',
      });
      return;
    }

    setLoadingRevert(true);
    try {
      const response = await supabase.functions.invoke('revert-cancellation', {
        body: { subscription_id: selectedSubscriptionId }
      });

      if (response.error) {
        let errorMessage = 'Não foi possível retomar a assinatura';
        
        try {
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
          console.error('Error parsing error response:', e);
        }
        
        throw new Error(errorMessage);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Assinatura retomada',
        description: 'Sua assinatura continua ativa sem cancelamento programado',
      });

      // Refresh the page to update subscription status
      window.location.reload();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível retomar a assinatura',
        variant: 'destructive',
      });
    } finally {
      setLoadingRevert(false);
      setShowResumeDialog(false);
    }
  };

  const getSubscriptionStatus = () => {
    if (!subscriptions || subscriptions.length === 0) return null;
    const activePlan = subscriptions.find(s => s.status === 'active' || s.status === 'pending_cancellation');
    return activePlan;
  };

  const currentSubscription = getSubscriptionStatus();
  const isPendingCancellation = currentSubscription?.status === 'pending_cancellation';
  const hasActiveSubscription = currentSubscription && currentSubscription.status === 'active';

  // Check for pending cancellation request
  useEffect(() => {
    const checkPendingCancellation = async () => {
      if (!open || !currentSubscription) {
        setHasPendingCancellation(false);
        return;
      }
      
      const { data } = await supabase
        .from('cancellation_requests')
        .select('*')
        .eq('subscription_id', currentSubscription.id)
        .in('status', ['pending', 'processed'])
        .maybeSingle();
      
      setHasPendingCancellation(!!data);
    };

    checkPendingCancellation();
  }, [open, currentSubscription?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Configurações</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
            {/* Informações da conta */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Informações da conta</h3>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={AVATAR_DEFAULT_URL} alt="Profile" />
                  <AvatarFallback>{profile?.full_name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome</Label>
                    <div className="flex gap-2">
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Seu nome completo"
                      />
                      <Button
                        onClick={handleUpdateName}
                        disabled={loadingName || fullName === profile?.full_name}
                        size="sm"
                      >
                        {loadingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                  <Button
                    onClick={handleUpdateEmail}
                    disabled={loadingEmail || email === user?.email}
                    size="sm"
                  >
                    {loadingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Alterar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Você receberá um e-mail de confirmação antes da alteração.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <div className="flex gap-2">
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                  />
                  <Button
                    onClick={handleUpdatePassword}
                    disabled={loadingPassword || !newPassword || !confirmPassword}
                    size="sm"
                  >
                    {loadingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Alterar'}
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            {/* Planos ativos */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Seus planos</h3>

              {!currentPlan ? (
                <div className="p-6 rounded-lg bg-muted/50 text-center space-y-4">
                  <p className="text-sm text-muted-foreground">Você está no plano gratuito</p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      navigate('/planos');
                      onOpenChange(false);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Ver planos disponíveis
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-accent/50 border border-border space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium text-lg">{getPlanLabel(currentPlan.plan_type)}</p>
                          {getStatusBadge((currentPlan as any).status || 'active', (currentPlan as any).cancel_at_period_end || false)}
                        </div>
                        {(currentPlan as any).billing_cycle && (
                          <p className="text-sm text-muted-foreground">
                            Periodicidade: <span className="font-medium capitalize">{(currentPlan as any).billing_cycle}</span>
                          </p>
                        )}
                        {currentPlan.cancel_at && (
                          <p className="text-sm text-muted-foreground">
                            {(currentPlan as any).cancel_at_period_end 
                              ? `Ativo até ${new Date(currentPlan.cancel_at).toLocaleDateString('pt-BR')}`
                              : `Próxima cobrança: ${new Date(currentPlan.cancel_at).toLocaleDateString('pt-BR')}`
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    {(currentPlan as any).status === 'past_due' && (
                      <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                        <p className="text-sm text-destructive">
                          ⚠️ Pagamento pendente. Clique em <strong>Gerenciar Assinatura</strong> para regularizar.
                        </p>
                      </div>
                    )}

                    {(currentPlan as any).status === 'incomplete' && (
                      <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                        <p className="text-sm text-destructive">
                          Finalize o pagamento para ativar sua assinatura.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigate('/planos');
                        onOpenChange(false);
                      }}
                    >
                      Ver planos disponíveis
                    </Button>
                    <Button
                      variant="default"
                      onClick={handleManageSubscription}
                      className="gap-2"
                    >
                      <CreditCard className="h-4 w-4" />
                      Gerenciar assinatura
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Tema */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Tema</h3>
              <RadioGroup value={appTheme} onValueChange={onThemeToggle}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="cursor-pointer">Claro</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="cursor-pointer">Escuro</Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Suporte */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Suporte</h3>
              <p className="text-sm text-muted-foreground">
                Precisa de ajuda? Entre em contato conosco:
              </p>
              <a
                href="mailto:info@nuracan.ai"
                className="text-sm text-primary hover:underline"
              >
                info@nuracan.ai
              </a>
            </div>

            <Separator />

            {/* Sair da conta */}
            <div className="pt-2">
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair da conta
              </Button>
            </div>
        </div>
      </DialogContent>

      <CancelSubscriptionDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        subscriptionId={selectedSubscriptionId}
        onSuccess={() => {
          // Refresh the page to update subscription status
          window.location.reload();
        }}
      />

      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retomar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar a solicitação de cancelamento? Sua assinatura continuará ativa normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResumeSubscription}
              disabled={loadingRevert}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loadingRevert ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sim, retomar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
