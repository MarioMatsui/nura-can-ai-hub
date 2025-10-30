import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DashboardFilters } from "../Dashboard";
import { Users, DollarSign, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface KPIData {
  activeUsers: number;
  activeUsersChange: number;
  totalRevenue: number;
  mrr: number;
  arr: number;
  aiCost: number;
  profit: number;
}

export const DashboardKPIs = ({ filters }: { filters: DashboardFilters }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KPIData>({
    activeUsers: 0,
    activeUsersChange: 0,
    totalRevenue: 0,
    mrr: 0,
    arr: 0,
    aiCost: 0,
    profit: 0,
  });

  useEffect(() => {
    loadKPIs();
  }, [filters]);

  const loadKPIs = async () => {
    setLoading(true);
    try {
      // Usuários ativos no período - planos que estavam ativos durante o período filtrado
      const { data: activeUsersData, error: usersError } = await supabase
        .from("user_plans")
        .select("user_id")
        .in("status", ["active", "trialing", "past_due"])
        .lte("created_at", filters.dateTo.toISOString())
        .or(`current_period_end.is.null,current_period_end.gte.${filters.dateFrom.toISOString()}`);

      // Gasto com IA
      const { data: aiUsageData, error: aiError } = await supabase
        .from("ai_usage")
        .select("cost")
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      // Calcular receita baseado nos PAGAMENTOS REAIS recebidos no período
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, status, created_at")
        .in("status", ["completed", "succeeded", "paid"])
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      const activeUsers = activeUsersData?.length || 0;
      const aiCost = aiUsageData?.reduce((sum, item) => sum + Number(item.cost), 0) || 0;
      
      // Calcular receita total baseado nos pagamentos reais recebidos
      const totalRevenue = paymentsData?.reduce((sum, payment) => {
        return sum + Number(payment.amount || 0);
      }, 0) || 0;

      // Calcular período anterior para comparação
      const periodLength = filters.dateTo.getTime() - filters.dateFrom.getTime();
      const previousDateFrom = new Date(filters.dateFrom.getTime() - periodLength);
      const previousDateTo = new Date(filters.dateFrom.getTime());

      const { data: previousUsersData } = await supabase
        .from("user_plans")
        .select("user_id")
        .in("status", ["active", "trialing", "past_due"])
        .lte("created_at", previousDateTo.toISOString())
        .or(`current_period_end.is.null,current_period_end.gte.${previousDateFrom.toISOString()}`);

      const previousUsers = previousUsersData?.length || 0;
      const activeUsersChange =
        previousUsers > 0 ? ((activeUsers - previousUsers) / previousUsers) * 100 : 0;

      // MRR e ARR (estimativa básica)
      const mrr = totalRevenue / (periodLength / (30 * 24 * 60 * 60 * 1000));
      const arr = mrr * 12;

      setData({
        activeUsers,
        activeUsersChange,
        totalRevenue,
        mrr,
        arr,
        aiCost,
        profit: totalRevenue - aiCost,
      });
    } catch (error) {
      console.error("Error loading KPIs:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Usuários Ativos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.activeUsers}</div>
          <div className="flex items-center text-xs text-muted-foreground mt-1">
            {data.activeUsersChange >= 0 ? (
              <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
            )}
            <span className={data.activeUsersChange >= 0 ? "text-green-500" : "text-red-500"}>
              {Math.abs(data.activeUsersChange).toFixed(1)}%
            </span>
            <span className="ml-1">vs período anterior</span>
          </div>
        </CardContent>
      </Card>

      {/* Receita Total */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(data.totalRevenue)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            MRR: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(data.mrr)} |
            ARR: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(data.arr)}
          </div>
        </CardContent>
      </Card>

      {/* Gasto com IA */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gasto com IA</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(data.aiCost)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Custo total com Gemini</p>
        </CardContent>
      </Card>

      {/* Lucro */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lucro</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(data.profit)}
          </div>
          <Badge variant={data.profit >= 0 ? "default" : "destructive"} className="mt-1">
            {data.profit >= 0 ? "Positivo" : "Negativo"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
};