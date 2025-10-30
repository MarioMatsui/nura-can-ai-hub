import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DashboardFilters } from "../Dashboard";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChartData {
  month: string;
  subscriptions: number;
  cancellations: number;
  registrations: number;
  medico?: number;
  juridico?: number;
  veterinario?: number;
  especialista?: number;
}

export const DashboardCharts = ({ filters }: { filters: DashboardFilters }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChartData[]>([]);

  useEffect(() => {
    loadChartData();
  }, [filters]);

  const loadChartData = async () => {
    setLoading(true);
    try {
      // Assinaturas ativas criadas por mês
      const { data: subsData } = await supabase
        .from("user_plans")
        .select("created_at, plan_type")
        .neq("plan_type", "free")
        .in("status", ["active", "trialing"])
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString())
        .order("created_at");

      // Cancelamentos efetivados por mês
      const { data: cancelData } = await supabase
        .from("user_plans")
        .select("updated_at")
        .in("status", ["canceled", "inactive"])
        .gte("updated_at", filters.dateFrom.toISOString())
        .lte("updated_at", filters.dateTo.toISOString())
        .order("updated_at");

      // Registros por mês
      const { data: regData } = await supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString())
        .order("created_at");

      // Agrupar por mês
      const monthMap = new Map<string, ChartData>();

      subsData?.forEach((item) => {
        const month = new Date(item.created_at).toLocaleDateString("pt-BR", {
          year: "numeric",
          month: "short",
        });
        if (!monthMap.has(month)) {
          monthMap.set(month, {
            month,
            subscriptions: 0,
            cancellations: 0,
            registrations: 0,
            medico: 0,
            juridico: 0,
            veterinario: 0,
            especialista: 0,
          });
        }
        const current = monthMap.get(month)!;
        current.subscriptions++;
        if (item.plan_type === "medico") current.medico!++;
        if (item.plan_type === "juridico") current.juridico!++;
        if (item.plan_type === "veterinario") current.veterinario!++;
        if (item.plan_type === "especialista") current.especialista!++;
      });

      cancelData?.forEach((item) => {
        const month = new Date(item.updated_at).toLocaleDateString("pt-BR", {
          year: "numeric",
          month: "short",
        });
        if (monthMap.has(month)) {
          monthMap.get(month)!.cancellations++;
        }
      });

      regData?.forEach((item) => {
        const month = new Date(item.created_at).toLocaleDateString("pt-BR", {
          year: "numeric",
          month: "short",
        });
        if (!monthMap.has(month)) {
          monthMap.set(month, {
            month,
            subscriptions: 0,
            cancellations: 0,
            registrations: 0,
          });
        }
        monthMap.get(month)!.registrations++;
      });

      setData(Array.from(monthMap.values()));
    } catch (error) {
      console.error("Error loading chart data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Séries Temporais</CardTitle>
        <CardDescription>Evolução mensal de assinaturas, cancelamentos e registros</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="by-plan">Por Plano</TabsTrigger>
            <TabsTrigger value="cancellations">Cancelamentos</TabsTrigger>
            <TabsTrigger value="registrations">Registros</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="subscriptions" stroke="hsl(var(--primary))" name="Assinaturas" />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="by-plan" className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="medico" fill="#ef4444" name="Médico" />
                <Bar dataKey="juridico" fill="#3b82f6" name="Jurídico" />
                <Bar dataKey="veterinario" fill="#10b981" name="Veterinário" />
                <Bar dataKey="especialista" fill="#f59e0b" name="Especialista" />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="cancellations" className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="cancellations" stroke="#ef4444" name="Cancelamentos" />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="registrations" className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="registrations" stroke="hsl(var(--primary))" name="Registros" />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};