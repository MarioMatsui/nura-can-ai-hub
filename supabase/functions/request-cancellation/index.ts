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

    // Get active subscription
    const { data: subscriptions, error: subError } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma assinatura ativa encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subscription = subscriptions[0];

    // Check for existing pending cancellation
    const { data: existingRequest } = await supabase
      .from("cancellation_requests")
      .select("*")
      .eq("subscription_id", subscription.id)
      .eq("status", "pending")
      .single();

    if (existingRequest) {
      return new Response(
        JSON.stringify({ error: "Você já tem um cancelamento em andamento." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate effective cancellation date
    const effectiveCancelAt = subscription.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create cancellation request
    const { data: cancelRequest, error: cancelError } = await supabase
      .from("cancellation_requests")
      .insert({
        user_id: user.id,
        subscription_id: subscription.id,
        provider: "cannapag",
        provider_subscription_id: subscription.id,
        plan_code: subscription.plan_type,
        plan_type_requested: subscription.plan_type,
        cancellation_reason: "solicitacao_usuario",
        status: "pending",
        effective_cancel_at: effectiveCancelAt,
      })
      .select()
      .single();

    if (cancelError) throw cancelError;

    // Update subscription cancel_at date and status
    const { error: updateError } = await supabase
      .from("user_subscriptions")
      .update({
        status: "scheduled_cancellation",
        cancel_at: effectiveCancelAt,
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
      type: "subscription_cancellation_request",
      payload: {
        user_id: user.id,
        user_name: profile?.full_name,
        user_email: profile?.email || user.email,
        subscription_id: subscription.id,
        plan_type: subscription.plan_type,
        effective_cancel_at: effectiveCancelAt,
        cancellation_request_id: cancelRequest.id,
      },
      status: "unread",
    });

    // Send confirmation email
    const emailPayload = {
      to: profile?.email || user.email,
      name: profile?.full_name || "Usuário",
      plan_name: subscription.plan_type === "medical" ? "Médico" :
                  subscription.plan_type === "legal" ? "Jurídico" :
                  subscription.plan_type === "veterinary" ? "Veterinário" :
                  subscription.plan_type === "specialist" ? "Especialista" : "Plano",
      effective_date: new Date(effectiveCancelAt).toLocaleDateString("pt-BR"),
    };

    await supabase.functions.invoke("send-cancellation-email", {
      body: { type: "scheduled", ...emailPayload },
    });

    return new Response(
      JSON.stringify({
        success: true,
        effective_cancel_at: effectiveCancelAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in request-cancellation:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});