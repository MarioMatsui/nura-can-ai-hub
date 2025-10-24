import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DashboardFilters } from "../Dashboard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ContentData {
  name: string;
  value: number;
}

export const DashboardContent = ({ filters }: { filters: DashboardFilters }) => {
  const [loading, setLoading] = useState(true);
  const [totalArticles, setTotalArticles] = useState(0);
  const [byTheme, setByTheme] = useState<ContentData[]>([]);

  useEffect(() => {
    loadContentData();
  }, [filters]);

  const loadContentData = async () => {
    setLoading(true);
    try {
      // Total de artigos
      const { count: total } = await supabase
        .from("knowledge_documents")
        .select("*", { count: "exact", head: true })
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      // Artigos por tema
      const { data: themeData } = await supabase
        .from("knowledge_documents")
        .select("knowledge_type")
        .gte("created_at", filters.dateFrom.toISOString())
        .lte("created_at", filters.dateTo.toISOString());

      // Agrupar por tema
      const themeCounts = new Map<string, number>();
      themeData?.forEach((doc) => {
        const count = themeCounts.get(doc.knowledge_type) || 0;
        themeCounts.set(doc.knowledge_type, count + 1);
      });

      const themeLabels: Record<string, string> = {
        medical: "Médico",
        legal: "Jurídico",
        veterinary: "Veterinário",
        specialist: "Especialista",
        general: "Geral",
      };

      const contentData: ContentData[] = Array.from(themeCounts.entries())
        .map(([theme, count]) => ({
          name: themeLabels[theme] || theme,
          value: count,
        }))
        .sort((a, b) => b.value - a.value);

      setTotalArticles(total || 0);
      setByTheme(contentData);
    } catch (error) {
      console.error("Error loading content data:", error);
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
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Gráfico por Tema */}
      <Card>
        <CardHeader>
          <CardTitle>Conteúdo Científico por Tema</CardTitle>
          <CardDescription>
            {totalArticles} artigos enviados no período
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byTheme}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="hsl(var(--primary))" name="Artigos" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela Top Temas */}
      <Card>
        <CardHeader>
          <CardTitle>Top Temas</CardTitle>
          <CardDescription>Temas mais populares por volume</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tema</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTheme.length > 0 ? (
                byTheme.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.value}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    Nenhum dado disponível para o período selecionado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};