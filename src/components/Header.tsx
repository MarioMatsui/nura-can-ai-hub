import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

interface HeaderProps {
  isLoggedIn?: boolean;
}

const Header = ({ isLoggedIn = false }: HeaderProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);
  
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
            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 border-2 border-primary">
              <span className="text-2xl sm:text-3xl font-bold text-primary">N</span>
            </div>
            <span className="text-xl sm:text-2xl font-bold text-foreground">
              Nura<span className="text-primary">Can</span> AI
            </span>
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
                <Button
                  size="lg"
                  onClick={() => navigate("/app")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow transition-smooth"
                >
                  Dashboard
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
