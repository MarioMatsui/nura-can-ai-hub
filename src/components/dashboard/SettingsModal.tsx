import { useState } from 'react';
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
import { LogOut, Loader2, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';

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

  const getPlanLabel = () => {
    if (!subscriptions || subscriptions.length === 0) {
      return 'Plano Gratuito';
    }
    const activePlan = subscriptions.find(s => s.status === 'active');
    if (!activePlan) return 'Plano Gratuito';
    
    const labels: Record<string, string> = {
      free: 'Gratuito',
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
      specialist: 'Especialista',
    };
    return labels[activePlan.plan_type] || 'Plano Gratuito';
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

  const handleRevertCancellation = async () => {
    setLoadingRevert(true);
    try {
      const { data, error } = await supabase.functions.invoke('revert-cancellation');

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Cancelamento revertido',
        description: 'Sua assinatura continua ativa',
      });

      // Refresh the page to update subscription status
      window.location.reload();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível reverter o cancelamento',
        variant: 'destructive',
      });
    } finally {
      setLoadingRevert(false);
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

            {/* Plano atual */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Plano atual</h3>
              <div className="space-y-3">
                <div className="flex items-start justify-between p-4 rounded-lg bg-accent/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{getPlanLabel()}</p>
                      {isPendingCancellation && (
                        <Badge variant="secondary" className="bg-muted">
                          Cancelamento agendado
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isPendingCancellation
                        ? `Ativo até ${currentSubscription?.cancel_at ? new Date(currentSubscription.cancel_at).toLocaleDateString('pt-BR') : ''}`
                        : subscriptions?.find(s => s.status === 'active')
                        ? 'Plano ativo'
                        : 'Sem assinatura ativa'}
                    </p>
                  </div>
                  {hasActiveSubscription && (
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigate('/planos');
                          onOpenChange(false);
                        }}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Gerenciar plano
                      </Button>
                      {!isPendingCancellation && (
                        <button
                          onClick={() => setShowCancelDialog(true)}
                          className="text-sm text-destructive hover:underline"
                        >
                          Cancelar assinatura
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Revert cancellation button */}
                {isPendingCancellation && currentSubscription?.cancel_at && new Date() < new Date(currentSubscription.cancel_at) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRevertCancellation}
                    disabled={loadingRevert}
                    className="w-full"
                  >
                    {loadingRevert ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processando...
                      </>
                    ) : (
                      'Manter assinatura'
                    )}
                  </Button>
                )}
              </div>
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
        onSuccess={() => {
          // Refresh the page to update subscription status
          window.location.reload();
        }}
      />
    </Dialog>
  );
};
