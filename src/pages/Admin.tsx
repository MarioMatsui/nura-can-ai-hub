import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import UserManagement from "@/components/admin/UserManagement";
import KnowledgeManagement from "@/components/admin/KnowledgeManagement";
import Dashboard from "@/components/admin/Dashboard";
import PlanManagement from "@/components/admin/PlanManagement";

import AdminFinance from "./AdminFinance";

const Admin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  
  const activeTab = location.pathname === "/admin/knowledge" ? "knowledge" 
                   : location.pathname === "/admin/users" ? "users"
                   : location.pathname === "/admin/finance" ? "finance"
                   : location.pathname === "/admin/plans" ? "plans"
                   : "dashboard";

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth/login");
        return;
      }

      // Server-side admin verification via edge function
      const { data, error } = await supabase.functions.invoke("verify-admin");

      if (error || !data?.admin) {
        console.error("Admin verification failed:", error);
        toast.error("Acesso negado. Apenas administradores podem acessar esta página.");
        navigate("/app");
        return;
      }
    } catch (error) {
      console.error("Error checking admin:", error);
      navigate("/auth/login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    if (value === "knowledge") {
      navigate("/admin/knowledge");
    } else if (value === "users") {
      navigate("/admin/users");
    } else if (value === "finance") {
      navigate("/admin/finance");
    } else if (value === "plans") {
      navigate("/admin/plans");
    } else {
      navigate("/admin");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold">Painel Administrativo</h1>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={() => navigate("/")}
              className="text-primary hover:text-primary/80 hover:underline transition-all font-medium"
            >
              Início
            </button>
            <button
              onClick={() => navigate("/admin/blog")}
              className="text-primary hover:text-primary/80 hover:underline transition-all font-medium"
            >
              Blog
            </button>
          </div>
          <p className="text-muted-foreground">
            Gerencie usuários, planos e base de conhecimento
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="users">Gestão de Usuários</TabsTrigger>
            <TabsTrigger value="knowledge">Base de Conhecimento</TabsTrigger>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            <TabsTrigger value="finance">Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard />
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgeManagement />
          </TabsContent>

          <TabsContent value="plans">
            <PlanManagement />
          </TabsContent>

          <TabsContent value="finance">
            <AdminFinance />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
