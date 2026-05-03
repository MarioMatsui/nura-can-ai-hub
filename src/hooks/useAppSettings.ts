import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type SettingsMap = Record<string, any>;

let cachedSettings: SettingsMap | null = null;
const listeners = new Set<(s: SettingsMap) => void>();
let realtimeBound = false;

const fetchAll = async (): Promise<SettingsMap> => {
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw error;
  const map: SettingsMap = {};
  (data || []).forEach((r: any) => { map[r.key] = r.value; });
  cachedSettings = map;
  listeners.forEach((cb) => cb(map));
  return map;
};

const ensureRealtime = () => {
  if (realtimeBound) return;
  realtimeBound = true;
  supabase
    .channel("app_settings_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
      fetchAll().catch(() => {});
    })
    .subscribe();
};

/**
 * Preload app settings before rendering. Use in route loaders / Dashboard checkAuth.
 * Returns false-safe defaults on error.
 */
export const preloadAppSettings = async (): Promise<SettingsMap> => {
  try {
    const map = await fetchAll();
    ensureRealtime();
    return map;
  } catch (e) {
    console.error("[useAppSettings] preload failed:", e);
    cachedSettings = cachedSettings || {};
    return cachedSettings;
  }
};

export const useAppSettings = () => {
  const [settings, setSettings] = useState<SettingsMap | null>(cachedSettings);
  const [isLoading, setIsLoading] = useState(cachedSettings === null);

  useEffect(() => {
    const cb = (s: SettingsMap) => setSettings({ ...s });
    listeners.add(cb);

    if (cachedSettings === null) {
      preloadAppSettings()
        .then((s) => setSettings({ ...s }))
        .finally(() => setIsLoading(false));
    } else {
      ensureRealtime();
      setIsLoading(false);
    }

    return () => { listeners.delete(cb); };
  }, []);

  const getFlag = useCallback(
    (key: string, fallback = false): boolean => {
      if (!settings) return fallback;
      const v = settings[key];
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v === "true";
      return fallback;
    },
    [settings]
  );

  const setFlag = useCallback(async (key: string, value: any) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: value as any, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    await fetchAll();
  }, []);

  return { settings: settings || {}, isLoading, getFlag, setFlag };
};
