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
        // Update subscription status to canceled
        const { error: updateSubError } = await supabase
          .from("user_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);

        if (updateSubError) {
          console.error(`Error updating subscription ${subscription.id}:`, updateSubError);
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

        // Update cancellation request to processed
        await supabase
          .from("cancellation_requests")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("subscription_id", subscription.id)
          .eq("status", "pending");

        // Send completion email
        const profile = subscription.profiles as any;
        const emailPayload = {
          to: profile?.email,
          name: profile?.full_name || "Usuário",
          plan_name: subscription.plan_type === "medical" ? "Médico" :
                      subscription.plan_type === "legal" ? "Jurídico" :
                      subscription.plan_type === "veterinary" ? "Veterinário" :
                      subscription.plan_type === "specialist" ? "Especialista" : "Plano",
        };

        await supabase.functions.invoke("send-cancellation-email", {
          body: { type: "completed", ...emailPayload },
        });

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