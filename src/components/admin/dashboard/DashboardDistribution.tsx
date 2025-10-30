import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DashboardFilters } from "../Dashboard";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface DistributionData {
  name: string;
  value: number;
  color: string;
}

interface StatsData {
  totalRegistrations: number;
  totalSubscriptions: number;
  totalCancellations: number;
}

const PLAN_COLORS = {
  medico: "#ef4444",
  juridico: "#3b82f6",
  veterinario: "#10b981",
  especialista: "#f59e0b",
  free: "#6b7280",
};

const PLAN_LABELS = {
  medico: "Médico",
  juridico: "Jurídico",
  veterinario: "Veterinário",
  especialista: "Especialista",
  free: "Free",
};

export const DashboardDistribution = ({ filters }: { filters: DashboardFilters }) => {
  const [loading, setLoading] = useState(true);
  const [distribution, setDistribution] = useState<DistributionData[]>([]);
  const [stats, setStats] = useState<StatsData>({
    totalRegistrations: 0,
    totalSubscriptions: 0,
    totalCancellations: 0,
  });

  useEffect(() => {
    loadDistribution();
  }, [filters.dateFrom, filters.dateTo]);

  const loadDistribution = async () => {
    setLoading(true);
    try {
      // Distribuição por plano - planos assinados durante o período filtrado
      const { data: plansData } = await supabase
        .from("user_plans")
        .select("plan_type, created_at")
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      // Total de registros no período
      const { count: registrationsCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      // Total de assinaturas ATIVAS criadas no período (novos planos pagos ativados)
      const { count: subscriptionsCount } = await supabase
        .from("user_plans")
        .select("*", { count: "exact", head: true })
        .neq("plan_type", "free")
        .in("status", ["active", "trialing"])
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      // Total de cancelamentos EFETIVADOS no período (planos que ficaram inativos/cancelados)
      const { count: cancellationsCount } = await supabase
        .from("user_plans")
        .select("*", { count: "exact", head: true })
        .in("status", ["canceled", "inactive"])
        .gte("updated_at", filters.dateFrom.toISOString())
        .lte("updated_at", filters.dateTo.toISOString());

      // Processar distribuição
      const planCounts = new Map<string, number>();
      plansData?.forEach((plan) => {
        const count = planCounts.get(plan.plan_type) || 0;
        planCounts.set(plan.plan_type, count + 1);
      });

      const distributionData: DistributionData[] = Array.from(planCounts.entries()).map(
        ([plan, count]) => ({
          name: PLAN_LABELS[plan as keyof typeof PLAN_LABELS] || plan,
          value: count,
          color: PLAN_COLORS[plan as keyof typeof PLAN_COLORS] || "#6b7280",
        })
      );

      setDistribution(distributionData);
      setStats({
        totalRegistrations: registrationsCount || 0,
        totalSubscriptions: subscriptionsCount || 0,
        totalCancellations: cancellationsCount || 0,
      });
    } catch (error) {
      console.error("Error loading distribution:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Distribuição por Plano */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Plano</CardTitle>
          <CardDescription>Usuários ativos por tipo de plano</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={distribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {distribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Estatísticas Gerais */}
      <Card>
        <CardHeader>
          <CardTitle>Estatísticas do Período</CardTitle>
          <CardDescription>Resumo de atividades no período selecionado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <span className="text-sm font-medium">Total de Registros</span>
            <span className="text-2xl font-bold">{stats.totalRegistrations}</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <span className="text-sm font-medium">Total de Assinaturas</span>
            <span className="text-2xl font-bold text-green-500">{stats.totalSubscriptions}</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <span className="text-sm font-medium">Total de Cancelamentos</span>
            <span className="text-2xl font-bold text-red-500">{stats.totalCancellations}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};