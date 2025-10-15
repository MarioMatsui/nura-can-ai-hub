import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Get pending cancellation subscription
    const { data: subscriptions, error: subError } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending_cancellation")
      .not("cancel_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum cancelamento pendente encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subscription = subscriptions[0];

    // Check if cancellation is still reversible (before cancel_at date)
    if (new Date() >= new Date(subscription.cancel_at)) {
      return new Response(
        JSON.stringify({ error: "O prazo para reverter o cancelamento expirou" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update cancellation request to reverted
    const { error: cancelReqError } = await supabase
      .from("cancellation_requests")
      .update({ status: "reverted", processed_at: new Date().toISOString() })
      .eq("subscription_id", subscription.id)
      .eq("status", "pending");

    if (cancelReqError) throw cancelReqError;

    // Restore subscription to active
    const { error: updateError } = await supabase
      .from("user_subscriptions")
      .update({
        status: "active",
        cancel_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id);

    if (updateError) throw updateError;

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    // Create admin notification
    await supabase.from("admin_notifications").insert({
      type: "subscription_cancellation_reverted",
      payload: {
        user_id: user.id,
        user_name: profile?.full_name,
        user_email: profile?.email || user.email,
        subscription_id: subscription.id,
        plan_type: subscription.plan_type,
      },
      status: "unread",
    });

    // Send email
    const emailPayload = {
      to: profile?.email || user.email,
      name: profile?.full_name || "Usuário",
      plan_name: subscription.plan_type === "medical" ? "Médico" :
                  subscription.plan_type === "legal" ? "Jurídico" :
                  subscription.plan_type === "veterinary" ? "Veterinário" :
                  subscription.plan_type === "specialist" ? "Especialista" : "Plano",
    };

    await supabase.functions.invoke("send-cancellation-email", {
      body: { type: "reverted", ...emailPayload },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in revert-cancellation:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});