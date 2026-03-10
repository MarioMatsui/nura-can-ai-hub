import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: responseHeaders }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Get subscription_id from request body
    const { subscription_id } = await req.json();
    
    if (!subscription_id || typeof subscription_id !== "string" || subscription_id.length > 100) {
      return new Response(
        JSON.stringify({ error: "subscription_id é obrigatório" }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Get scheduled cancellation subscription
    const { data: subscriptions, error: subError } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("id", subscription_id)
      .eq("user_id", user.id)
      .eq("status", "scheduled_cancellation")
      .not("cancel_at", "is", null);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum cancelamento pendente encontrado" }),
        { status: 400, headers: responseHeaders }
      );
    }

    const subscription = subscriptions[0];

    // Check if cancellation is still reversible (before cancel_at date)
    if (new Date() >= new Date(subscription.cancel_at)) {
      return new Response(
        JSON.stringify({ error: "O prazo para reverter o cancelamento expirou" }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Delete cancellation request
    console.log('Deleting cancellation request for subscription:', subscription.id);
    const { error: cancelReqError } = await supabase
      .from("cancellation_requests")
      .delete()
      .eq("subscription_id", subscription.id)
      .in("status", ["pending", "processed"]);

    if (cancelReqError) {
      console.error('Error deleting cancellation request:', cancelReqError);
      throw cancelReqError;
    }
    console.log('Cancellation request deleted successfully');

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

    // Send email with internal secret
    const emailPayload = {
      type: "reverted",
      to: profile?.email || user.email,
      name: profile?.full_name || "Usuário",
      plan_name: subscription.plan_type === "medical" ? "Médico" :
                  subscription.plan_type === "legal" ? "Jurídico" :
                  subscription.plan_type === "veterinary" ? "Veterinário" :
                  subscription.plan_type === "specialist" ? "Especialista" : "Plano",
    };

    const internalSecret = Deno.env.get("INTERNAL_FUNCTIONS_SECRET");
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-cancellation-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret || "",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      console.error("Failed to send revert email");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}] Error in revert-cancellation:`, error);
    return new Response(
      JSON.stringify({ 
        error: "Erro ao reverter cancelamento. Tente novamente.",
        request_id: requestId
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});
