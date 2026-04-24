import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const LoginCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const decide = async () => {
      // Wait for session to be available (OAuth callback may need a tick)
      let attempts = 0;
      let session = null;
      while (attempts < 10 && !session) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) await new Promise((r) => setTimeout(r, 200));
        attempts++;
      }

      if (cancelled) return;

      if (!session?.user) {
        navigate("/auth/login", { replace: true });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_completed")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profile?.profile_completed) {
        navigate("/app", { replace: true });
      } else {
        navigate("/auth/completar-cadastro", { replace: true });
      }
    };

    decide();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Finalizando login...</p>
      </div>
    </div>
  );
};

export default LoginCallback;
