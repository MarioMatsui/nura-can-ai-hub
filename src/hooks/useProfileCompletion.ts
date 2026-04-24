import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useProfileCompletion() {
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setIsComplete(null);
      setUserId(null);
      setLoading(false);
      return;
    }
    setUserId(session.user.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("profile_completed")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) {
      console.error("[useProfileCompletion] error:", error);
      setIsComplete(true); // fail-open to avoid locking users on transient errors
    } else {
      setIsComplete(Boolean(data?.profile_completed));
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, []);

  return { loading, isComplete, userId, refresh };
}
