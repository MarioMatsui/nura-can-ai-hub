import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication - accept either internal secret OR authorization header from cron
    const internalSecret = req.headers.get("x-internal-secret");
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = Deno.env.get("INTERNAL_FUNCTIONS_SECRET");
    
    // Check for internal secret (server-to-server calls)
    const hasValidInternalSecret = expectedSecret && internalSecret === expectedSecret;
    
    // Check for authorization header (cron job calls with anon key)
    // The cron job uses the anon key but this function uses service role for operations
    const hasValidAuthHeader = authHeader?.startsWith("Bearer ");
    
    if (!hasValidInternalSecret && !hasValidAuthHeader) {
      console.error("Unauthorized: Invalid or missing authentication");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting finalize-cancellations job");

    // Get subscriptions ready to be canceled
    const { data: subscriptions, error: subError } = await supabase
      .from("user_subscriptions")
      .select("*, profiles!inner(full_name, email)")
      .eq("status", "pending_cancellation")
      .not("cancel_at", "is", null)
      .lte("cancel_at", new Date().toISOString());

    if (subError) throw subError;

    console.log(`Found ${subscriptions?.length || 0} subscriptions to finalize`);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;

    for (const subscription of subscriptions) {
      try {
        // Delete the subscription instead of marking as canceled
        const { error: deleteSubError } = await supabase
          .from("user_subscriptions")
          .delete()
          .eq("id", subscription.id);

        if (deleteSubError) {
          console.error(`Error deleting subscription ${subscription.id}:`, deleteSubError);
          continue;
        }

        // Count remaining active subscriptions
        const { data: activeCount } = await supabase
          .from("user_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", subscription.user_id)
          .eq("status", "active");

        const hasActiveSubscriptions = (activeCount?.length || 0) > 0;

        // Update profile if no active subscriptions remain
        if (!hasActiveSubscriptions) {
          await supabase
            .from("profiles")
            .update({
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.user_id);
        }

        // Delete the cancellation request after processing
        await supabase
          .from("cancellation_requests")
          .delete()
          .eq("subscription_id", subscription.id);

        // Send completion email with internal secret
        const profile = subscription.profiles as any;
        const emailPayload = {
          to: profile?.email,
          name: profile?.full_name || "Usuário",
          plan_name: subscription.plan_type === "medical" ? "Médico" :
                      subscription.plan_type === "legal" ? "Jurídico" :
                      subscription.plan_type === "veterinary" ? "Veterinário" :
                      subscription.plan_type === "specialist" ? "Especialista" : "Plano",
        };

        // Call send-cancellation-email with internal secret
        const internalFunctionsSecret = Deno.env.get("INTERNAL_FUNCTIONS_SECRET") || "";
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-cancellation-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": internalFunctionsSecret,
          },
          body: JSON.stringify({ type: "completed", ...emailPayload }),
        });

        if (!emailResponse.ok) {
          console.error(`Failed to send email for subscription ${subscription.id}`);
        }

        processed++;
        console.log(`Successfully finalized subscription ${subscription.id}`);
      } catch (error) {
        console.error(`Error processing subscription ${subscription.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in finalize-cancellations:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
