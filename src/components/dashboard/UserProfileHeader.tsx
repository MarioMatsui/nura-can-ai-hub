import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Settings, LogOut, Sun, Moon, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { SettingsModal } from './SettingsModal';
import { useSidebar } from '@/components/ui/sidebar';

interface UserProfileHeaderProps {
  profile: any;
  user: any;
  subscriptions: any[];
  appTheme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const AVATAR_DEFAULT_URL = 'https://canfy.com.br/wp-content/uploads/2025/10/iconpfpNura.jpg';

export const UserProfileHeader = ({
  profile,
  user,
  subscriptions,
  appTheme,
  onThemeToggle,
}: UserProfileHeaderProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state } = useSidebar();

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
    navigate('/');
  };

  const getPlanLabel = () => {
    if (!subscriptions || subscriptions.length === 0) {
      return 'Gratuito';
    }
    
    // Find all active plans or scheduled cancellation within valid period
    const activePlans = subscriptions.filter(s => 
      s.status === 'active' || 
      (s.status === 'scheduled_cancellation' && s.cancel_at && new Date(s.cancel_at) > new Date())
    );
    
    if (activePlans.length === 0) return 'Gratuito';
    
    const labels: Record<string, string> = {
      free: 'Gratuito',
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
      specialist: 'Especialista',
    };
    
    // Get all plan names
    const planNames = activePlans
      .map(p => labels[p.plan_type] || 'Gratuito')
      .filter(name => name !== 'Gratuito'); // Remove "Gratuito" from the list
    
    if (planNames.length === 0) return 'Gratuito';
    
    // Join with commas
    const plansText = planNames.join(', ');
    
    // Truncate if too long (max ~25 characters to fit in one line)
    if (plansText.length > 25) {
      return plansText.substring(0, 22) + '...';
    }
    
    return plansText;
  };

  if (state === 'collapsed') {
    return (
      <div className="mt-auto border-t border-border pt-1.5 pb-2 px-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-[50px] sm:h-[60px] rounded-lg hover:bg-accent transition-colors"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={AVATAR_DEFAULT_URL} alt="Profile" />
                <AvatarFallback>{profile?.full_name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-64 p-2 rounded-xl shadow-lg"
            align="end"
            side="right"
            sideOffset={8}
          >
            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPopoverOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start rounded-lg hover:bg-accent transition-colors"
              onClick={() => {
                onThemeToggle();
              }}
            >
              {appTheme === 'dark' ? (
                <Sun className="h-4 w-4 mr-3" />
              ) : (
                <Moon className="h-4 w-4 mr-3" />
              )}
              {appTheme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start rounded-lg hover:bg-accent transition-colors"
              onClick={() => {
                setPopoverOpen(false);
                setSettingsOpen(true);
              }}
            >
              <Settings className="h-4 w-4 mr-3" />
              Configurações
            </Button>
            <div className="my-2 border-t border-border" />
            <Button
              variant="ghost"
              className="w-full justify-start rounded-lg hover:bg-accent transition-colors text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sair
            </Button>
          </PopoverContent>
        </Popover>

        <SettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          profile={profile}
          user={user}
          subscriptions={subscriptions}
          appTheme={appTheme}
          onThemeToggle={onThemeToggle}
        />
      </div>
    );
  }

  return (
    <div className="mt-auto border-t border-border pt-1.5 pb-2 px-3">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button className="w-full flex items-center gap-3 h-[50px] sm:h-[60px] px-2.5 rounded-xl hover:bg-accent transition-all duration-200 hover:shadow-sm group">
            <Avatar className="h-10 w-10 ring-2 ring-primary/10 group-hover:ring-primary/20 transition-all">
              <AvatarImage src={AVATAR_DEFAULT_URL} alt="Profile" />
              <AvatarFallback>{profile?.full_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left min-w-0">
              <div className="font-medium text-sm truncate">
                {profile?.full_name || user?.email || 'Usuário'}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {getPlanLabel()}
              </div>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-64 p-2 rounded-xl shadow-lg"
          align="start"
          side="top"
          sideOffset={8}
        >
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setPopoverOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start rounded-lg hover:bg-accent transition-colors"
            onClick={() => {
              onThemeToggle();
            }}
          >
            {appTheme === 'dark' ? (
              <Sun className="h-4 w-4 mr-3" />
            ) : (
              <Moon className="h-4 w-4 mr-3" />
            )}
            {appTheme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start rounded-lg hover:bg-accent transition-colors"
            onClick={() => {
              setPopoverOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Settings className="h-4 w-4 mr-3" />
            Configurações
          </Button>
          <div className="my-2 border-t border-border" />
          <Button
            variant="ghost"
            className="w-full justify-start rounded-lg hover:bg-accent transition-colors text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-3" />
            Sair
          </Button>
        </PopoverContent>
      </Popover>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={profile}
        user={user}
        subscriptions={subscriptions}
        appTheme={appTheme}
        onThemeToggle={onThemeToggle}
      />
    </div>
  );
};
