import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlanSetting {
  id: string;
  plan_code: string;
  display_name: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export const usePlanSettings = () => {
  const [planSettings, setPlanSettings] = useState<PlanSetting[]>([]);
  const [activePlansMap, setActivePlansMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlanSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("plan_settings")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;

      const settings = data as PlanSetting[];
      setPlanSettings(settings);
      
      // Create a map of plan_code -> is_active for quick lookups
      const activeMap: Record<string, boolean> = {};
      settings.forEach(setting => {
        activeMap[setting.plan_code] = setting.is_active;
      });
      setActivePlansMap(activeMap);
    } catch (error) {
      console.error("Error fetching plan settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanSettings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("plan_settings_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plan_settings",
        },
        () => {
          fetchPlanSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isPlanActive = (planCode: string): boolean => {
    // If settings haven't loaded yet, assume all plans are active
    if (isLoading) return true;
    // If plan not found in settings, assume active (fallback)
    if (!(planCode in activePlansMap)) return true;
    return activePlansMap[planCode];
  };

  const togglePlanActive = async (planCode: string, isActive: boolean) => {
    const { error } = await supabase
      .from("plan_settings")
      .update({ is_active: isActive })
      .eq("plan_code", planCode);

    if (error) throw error;
    
    // Refresh settings
    await fetchPlanSettings();
  };

  return {
    planSettings,
    activePlansMap,
    isLoading,
    isPlanActive,
    togglePlanActive,
    refetch: fetchPlanSettings,
  };
};
