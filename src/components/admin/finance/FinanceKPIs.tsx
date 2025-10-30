import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Users, Percent, Target, UserX } from "lucide-react";

interface FinanceKPIsProps {
  ganhoGeral: number;
  lucro: number;
  gastoIA: number;
  cac: number;
  taxaConversao: number;
  ticketMedio: number;
  churn: number;
  loading: boolean;
}

export const FinanceKPIs = ({
  ganhoGeral,
  lucro,
  gastoIA,
  cac,
  taxaConversao,
  ticketMedio,
  churn,
  loading,
}: FinanceKPIsProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const kpis = [
    {
      title: "Ganho Geral",
      value: formatCurrency(ganhoGeral),
      icon: DollarSign,
      color: "text-green-500",
    },
    {
      title: "Lucro",
      value: formatCurrency(lucro),
      icon: TrendingUp,
      color: lucro >= 0 ? "text-green-500" : "text-red-500",
    },
    {
      title: "Gasto com IA",
      value: formatCurrency(gastoIA),
      icon: TrendingDown,
      color: "text-orange-500",
    },
    {
      title: "CAC",
      value: formatCurrency(cac),
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "Taxa de Conversão",
      value: formatPercent(taxaConversao),
      icon: Percent,
      color: "text-purple-500",
    },
    {
      title: "Ticket Médio",
      value: formatCurrency(ticketMedio),
      icon: Target,
      color: "text-cyan-500",
    },
    {
      title: "Churn",
      value: formatPercent(churn),
      icon: UserX,
      color: "text-red-500",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(7)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted animate-pulse rounded w-24" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted animate-pulse rounded w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <Icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
