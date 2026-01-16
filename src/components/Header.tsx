import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import logoLight from "@/assets/logo-light.png";
import logoDark from "@/assets/logo-dark.png";

interface HeaderProps {
  isLoggedIn?: boolean;
}

const Header = ({ isLoggedIn = false }: HeaderProps) => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  // Track actual theme (resolve "system" to actual value)
  useEffect(() => {
    const checkTheme = () => {
      if (theme === "system") {
        setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
      } else {
        setIsDark(theme === "dark");
      }
    };
    
    checkTheme();
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkTheme);
    return () => mediaQuery.removeEventListener("change", checkTheme);
  }, [theme]);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.id);
      } else {
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();
    
    setIsAdmin(!!data);
  };
  
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth" });
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      toast.success("Você saiu com sucesso");
      navigate("/");
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-smooth"
          >
            <img 
              src={isDark ? logoDark : logoLight} 
              alt="NuraCan AI" 
              className="h-5 sm:h-6 w-auto"
            />
          </button>

          {/* Navigation - Hidden on mobile */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <button
              onClick={() => scrollToSection("beneficios")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth"
            >
              Benefícios
            </button>
            <button
              onClick={() => scrollToSection("como-funciona")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth"
            >
              Como Funciona
            </button>
            <button
              onClick={() => scrollToSection("planos")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth"
            >
              Planos
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth"
            >
              FAQ
            </button>
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <>
                {isAdmin && (
                  <button
                    onClick={() => navigate("/admin")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground underline transition-smooth"
                  >
                    Dashboard
                  </button>
                )}
                <Button
                  size="lg"
                  onClick={() => navigate("/app")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow transition-smooth"
                >
                  <Sparkles className="h-4 w-4" />
                  Nura AI
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleLogout}
                  className="hover:bg-destructive/10 hover:text-destructive"
                  title="Sair"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => navigate("/auth/login")}
                  className="hidden sm:flex font-medium"
                >
                  Login
                </Button>
                <Button
                  size="lg"
                  onClick={() => scrollToSection("planos")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow transition-smooth text-sm sm:text-base px-3 sm:px-6"
                >
                  Assine Agora
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
