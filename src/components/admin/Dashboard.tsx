import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DashboardKPIs } from "./dashboard/DashboardKPIs";
import { DashboardCharts } from "./dashboard/DashboardCharts";
import { DashboardDistribution } from "./dashboard/DashboardDistribution";
import { DashboardContent } from "./dashboard/DashboardContent";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface DashboardFilters {
  dateFrom: Date;
  dateTo: Date;
  planTypes: string[];
  regions: string[];
}

const Dashboard = () => {
  const [filters, setFilters] = useState<DashboardFilters>({
    dateFrom: new Date(new Date().setMonth(new Date().getMonth() - 1)),
    dateTo: new Date(),
    planTypes: ["medico", "juridico", "veterinario", "especialista"],
    regions: [],
  });

  const [periodPreset, setPeriodPreset] = useState("1_mes");
  const [showCustomDate, setShowCustomDate] = useState(false);

  const handlePresetChange = (preset: string) => {
    setPeriodPreset(preset);
    const today = new Date();
    let dateFrom = new Date();

    switch (preset) {
      case "sempre":
        dateFrom = new Date(2020, 0, 1);
        break;
      case "3_anos":
        dateFrom = new Date(today.setFullYear(today.getFullYear() - 3));
        break;
      case "1_ano":
        dateFrom = new Date(today.setFullYear(today.getFullYear() - 1));
        break;
      case "6_meses":
        dateFrom = new Date(today.setMonth(today.getMonth() - 6));
        break;
      case "1_mes":
        dateFrom = new Date(today.setMonth(today.getMonth() - 1));
        break;
      case "1_semana":
        dateFrom = new Date(today.setDate(today.getDate() - 7));
        break;
      case "custom":
        setShowCustomDate(true);
        return;
    }

    setShowCustomDate(false);
    setFilters((prev) => ({ ...prev, dateFrom, dateTo: new Date() }));
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>
                Configure os filtros para visualizar os dados do dashboard
              </CardDescription>
            </div>
            <div className="w-full md:w-64">
              <Select value={periodPreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sempre">Sempre</SelectItem>
                  <SelectItem value="3_anos">3 anos</SelectItem>
                  <SelectItem value="1_ano">1 ano</SelectItem>
                  <SelectItem value="6_meses">6 meses</SelectItem>
                  <SelectItem value="1_mes">1 mês</SelectItem>
                  <SelectItem value="1_semana">1 semana</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Data custom */}
            {showCustomDate && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Inicial</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(filters.dateFrom, "PPP", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateFrom}
                        onSelect={(date) =>
                          date && setFilters((prev) => ({ ...prev, dateFrom: date }))
                        }
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Final</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(filters.dateTo, "PPP", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateTo}
                        onSelect={(date) =>
                          date && setFilters((prev) => ({ ...prev, dateTo: date }))
                        }
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <DashboardKPIs filters={filters} />

      {/* Distribuição por Plano */}
      <DashboardDistribution filters={filters} />

      {/* Gráficos de Séries Temporais */}
      <DashboardCharts filters={filters} />

      {/* Conteúdo Científico */}
      <DashboardContent filters={filters} />
    </div>
  );
};

export default Dashboard;