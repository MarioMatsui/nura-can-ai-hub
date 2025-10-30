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
      // Set fromDate to start of day (00:00:00)
      const fromDateStart = new Date(dateFrom);
      fromDateStart.setHours(0, 0, 0, 0);
      const fromDate = fromDateStart.toISOString();
      
      // Set toDate to end of day (23:59:59) + buffer for clock differences
      const toDateEnd = new Date(dateTo);
      toDateEnd.setHours(23, 59, 59, 999);
      const toDate = toDateEnd.toISOString();

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

      // Carregar receita real da Stripe através da tabela de pagamentos
      const { data: stripePayments } = await supabase
        .from("payments")
        .select("amount, status, created_at")
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .eq("provider", "stripe")
        .in("status", ["paid", "succeeded"]);

      // Calcular receita Stripe real (pagamentos efetivados)
      const stripeRevenue = stripePayments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

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

      const { count: activeSubscriptions } = await supabase
        .from("user_plans")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .neq("plan_type", "free");

      setCAC(marketingCosts / (activeSubscriptions || 1));

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

      // KPI: Ticket Médio (baseado em pagamentos reais)
      const avgTicket = stripePayments && stripePayments.length > 0 
        ? stripePayments.reduce((sum, p) => sum + Number(p.amount), 0) / stripePayments.length 
        : 0;
      setTicketMedio(avgTicket);

      // KPI: Churn
      // 1. Contar assinaturas ativas no início do período
      const { data: activeAtStart } = await supabase
        .from("user_plans")
        .select("*")
        .lte("created_at", fromDate);

      // Filtrar apenas as que estavam ativas no início (ativas agora OU canceladas depois do início)
      const activeAtStartCount = activeAtStart?.filter(sub => 
        sub.status === "active" || 
        (sub.status === "canceled" && new Date(sub.updated_at) > new Date(fromDate))
      ).length || 0;

      // 2. Contar assinaturas canceladas durante o período
      const { data: canceledInPeriod } = await supabase
        .from("user_plans")
        .select("*")
        .gte("updated_at", fromDate)
        .lte("updated_at", toDate)
        .eq("status", "canceled");

      const canceledCount = canceledInPeriod?.length || 0;

      // 3. Calcular Churn
      const churnRate = activeAtStartCount > 0 ? (canceledCount / activeAtStartCount) * 100 : 0;
      setChurn(churnRate);

      // Preparar dados dos gráficos
      await prepareChartData(transactionsData || []);

    } catch (error) {
      console.error("Error loading finance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = async (transactions: any[]) => {
    // Set fromDate to start of day (00:00:00)
    const fromDateStart = new Date(dateFrom);
    fromDateStart.setHours(0, 0, 0, 0);
    
    // Set toDate to end of day (23:59:59)
    const toDateEnd = new Date(dateTo);
    toDateEnd.setHours(23, 59, 59, 999);
    
    // Carregar pagamentos Stripe para os gráficos
    const { data: stripePayments } = await supabase
      .from("payments")
      .select("amount, created_at")
      .gte("created_at", fromDateStart.toISOString())
      .lte("created_at", toDateEnd.toISOString())
      .eq("provider", "stripe")
      .in("status", ["paid", "succeeded"]);

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

    stripePayments?.forEach(payment => {
      const month = format(new Date(payment.created_at), "MMM/yy", { locale: ptBR });
      const current = monthlyData.get(month) || { entradas: 0, saidas: 0, revenue: 0 };
      current.revenue += Number(payment.amount);
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

      {/* Tabela de Transações */}
      <FinanceTransactions transactions={transactions} loading={loading} onRefresh={loadFinanceData} />

      {/* Gráficos */}
      <FinanceCharts revenueData={revenueData} transactionData={transactionData} loading={loading} />
    </div>
  );
};

export default AdminFinance;
