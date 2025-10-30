import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { FinanceKPIs } from "@/components/admin/finance/FinanceKPIs";
import { FinanceCharts } from "@/components/admin/finance/FinanceCharts";
import { FinanceTransactions } from "@/components/admin/finance/FinanceTransactions";

const AdminFinance = () => {
  const [dateFrom, setDateFrom] = useState<Date>(new Date(2020, 0, 1));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [periodPreset, setPeriodPreset] = useState("sempre");
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [loading, setLoading] = useState(true);

  // KPIs state
  const [ganhoGeral, setGanhoGeral] = useState(0);
  const [lucro, setLucro] = useState(0);
  const [gastoIA, setGastoIA] = useState(0);
  const [cac, setCAC] = useState(0);
  const [taxaConversao, setTaxaConversao] = useState(0);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [churn, setChurn] = useState(0);

  // Charts data
  const [revenueData, setRevenueData] = useState<Array<{ month: string; value: number }>>([]);
  const [transactionData, setTransactionData] = useState<Array<{ month: string; entradas: number; saidas: number }>>([]);

  // Transactions
  const [transactions, setTransactions] = useState<any[]>([]);

  const handlePresetChange = (preset: string) => {
    setPeriodPreset(preset);
    const today = new Date();
    let newDateFrom = new Date();

    if (preset === "nada") {
      setShowCustomDate(true);
      return;
    }

    setShowCustomDate(false);

    switch (preset) {
      case "sempre":
        newDateFrom = new Date(2020, 0, 1);
        break;
      case "3_anos":
        newDateFrom = new Date(today.setFullYear(today.getFullYear() - 3));
        break;
      case "1_ano":
        newDateFrom = new Date(today.setFullYear(today.getFullYear() - 1));
        break;
      case "6_meses":
        newDateFrom = new Date(today.setMonth(today.getMonth() - 6));
        break;
      case "3_meses":
        newDateFrom = new Date(today.setMonth(today.getMonth() - 3));
        break;
      case "1_mes":
        newDateFrom = new Date(today.setMonth(today.getMonth() - 1));
        break;
      case "1_semana":
        newDateFrom = new Date(today.setDate(today.getDate() - 7));
        break;
    }

    setDateFrom(newDateFrom);
    setDateTo(new Date());
  };

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      const fromDate = dateFrom.toISOString();
      const toDate = dateTo.toISOString();

      // Carregar transações
      const { data: transactionsData } = await supabase
        .from("financial_transactions")
        .select("*")
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .order("created_at", { ascending: false });

      setTransactions(transactionsData || []);

      // Calcular entradas e saídas
      const entradas = transactionsData?.filter(t => t.type === "entrada").reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const saidas = transactionsData?.filter(t => t.type === "saida").reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      // Carregar receita da Stripe (user_plans)
      const { data: stripePlans } = await supabase
        .from("user_plans")
        .select("plan_type, billing_cycle, status, created_at")
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .eq("status", "active");

      // Calcular receita Stripe
      const planPrices: Record<string, Record<string, number>> = {
        medico: { mensal: 157, anual: 1884 },
        juridico: { mensal: 157, anual: 1884 },
        veterinario: { mensal: 157, anual: 1884 },
        especialista: { mensal: 397, anual: 4764 },
      };

      let stripeRevenue = 0;
      stripePlans?.forEach(plan => {
        if (plan.plan_type !== "free" && plan.billing_cycle) {
          const price = planPrices[plan.plan_type]?.[plan.billing_cycle] || 0;
          stripeRevenue += price;
        }
      });

      // KPI: Ganho Geral
      const totalGanho = entradas + stripeRevenue;
      setGanhoGeral(totalGanho);

      // Carregar gastos com IA
      const { data: aiCosts } = await supabase
        .from("ai_usage")
        .select("cost")
        .gte("created_at", fromDate)
        .lte("created_at", toDate);

      const totalAICost = aiCosts?.reduce((sum, c) => sum + Number(c.cost), 0) || 0;
      setGastoIA(totalAICost);

      // KPI: Lucro
      setLucro(totalGanho - totalAICost - saidas);

      // KPI: CAC (Custo por Aquisição)
      const marketingCosts = transactionsData?.filter(t => 
        (t.tag === "marketing" || t.tag === "vendas") && t.type === "saida"
      ).reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      const activeSubscriptions = stripePlans?.length || 1;
      setCAC(marketingCosts / activeSubscriptions);

      // KPI: Taxa de Conversão
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromDate)
        .lte("created_at", toDate);

      const { count: activeUsers } = await supabase
        .from("user_plans")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .eq("status", "active")
        .neq("plan_type", "free");

      setTaxaConversao(totalUsers ? ((activeUsers || 0) / totalUsers) * 100 : 0);

      // KPI: Ticket Médio
      const tickets = stripePlans?.map(plan => {
        if (plan.plan_type === "free") return 0;
        const price = planPrices[plan.plan_type]?.[plan.billing_cycle || "mensal"] || 0;
        return plan.billing_cycle === "anual" ? price / 12 : price;
      }) || [];

      const avgTicket = tickets.length > 0 ? tickets.reduce((sum, t) => sum + t, 0) / tickets.length : 0;
      setTicketMedio(avgTicket);

      // KPI: Churn
      const { data: canceledSubs } = await supabase
        .from("user_plans")
        .select("*")
        .gte("updated_at", fromDate)
        .lte("updated_at", toDate)
        .eq("status", "canceled");

      const churnCount = canceledSubs?.length || 0;
      const churnRate = activeSubscriptions > 0 ? (churnCount / activeSubscriptions) * 100 : 0;
      setChurn(churnRate);

      // Preparar dados dos gráficos
      prepareChartData(transactionsData || [], stripePlans || []);

    } catch (error) {
      console.error("Error loading finance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = (transactions: any[], plans: any[]) => {
    // Agrupar por mês
    const monthlyData = new Map<string, { entradas: number; saidas: number; revenue: number }>();

    transactions.forEach(t => {
      const month = format(new Date(t.created_at), "MMM/yy", { locale: ptBR });
      const current = monthlyData.get(month) || { entradas: 0, saidas: 0, revenue: 0 };
      
      if (t.type === "entrada") {
        current.entradas += Number(t.amount);
      } else {
        current.saidas += Number(t.amount);
      }
      
      monthlyData.set(month, current);
    });

    plans.forEach(plan => {
      const month = format(new Date(plan.created_at), "MMM/yy", { locale: ptBR });
      const current = monthlyData.get(month) || { entradas: 0, saidas: 0, revenue: 0 };
      
      const planPrices: Record<string, Record<string, number>> = {
        medico: { mensal: 157, anual: 1884 },
        juridico: { mensal: 157, anual: 1884 },
        veterinario: { mensal: 157, anual: 1884 },
        especialista: { mensal: 397, anual: 4764 },
      };
      
      if (plan.plan_type !== "free" && plan.billing_cycle) {
        current.revenue += planPrices[plan.plan_type]?.[plan.billing_cycle] || 0;
      }
      
      monthlyData.set(month, current);
    });

    const revenueChartData = Array.from(monthlyData.entries()).map(([month, data]) => ({
      month,
      value: data.revenue + data.entradas,
    }));

    const transactionChartData = Array.from(monthlyData.entries()).map(([month, data]) => ({
      month,
      entradas: data.entradas,
      saidas: data.saidas,
    }));

    setRevenueData(revenueChartData);
    setTransactionData(transactionChartData);
  };

  useEffect(() => {
    loadFinanceData();
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Configure os filtros para visualizar os dados financeiros</CardDescription>
            </div>
            <div className="w-full md:w-64">
              <Select value={periodPreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nada">Nada</SelectItem>
                  <SelectItem value="sempre">Sempre</SelectItem>
                  <SelectItem value="3_anos">3 anos</SelectItem>
                  <SelectItem value="1_ano">1 ano</SelectItem>
                  <SelectItem value="6_meses">6 meses</SelectItem>
                  <SelectItem value="3_meses">3 meses</SelectItem>
                  <SelectItem value="1_mes">1 mês</SelectItem>
                  <SelectItem value="1_semana">1 semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        {showCustomDate && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dateFrom, "PPP", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateFrom} onSelect={(date) => date && setDateFrom(date)} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data Final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dateTo, "PPP", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateTo} onSelect={(date) => date && setDateTo(date)} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* KPIs */}
      <FinanceKPIs
        ganhoGeral={ganhoGeral}
        lucro={lucro}
        gastoIA={gastoIA}
        cac={cac}
        taxaConversao={taxaConversao}
        ticketMedio={ticketMedio}
        churn={churn}
        loading={loading}
      />

      {/* Gráficos */}
      <FinanceCharts revenueData={revenueData} transactionData={transactionData} loading={loading} />

      {/* Tabela de Transações */}
      <FinanceTransactions transactions={transactions} loading={loading} onRefresh={loadFinanceData} />
    </div>
  );
};

export default AdminFinance;
