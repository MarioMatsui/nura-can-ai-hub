import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing configuration');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get customer ID from request
    const { customerId } = await req.json();

    if (!customerId) {
      throw new Error('customerId is required');
    }

    console.log(`[sync-stripe] Syncing subscriptions for customer: ${customerId}`);

    // Get all active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10,
    });

    console.log(`[sync-stripe] Found ${subscriptions.data.length} active subscriptions`);

    if (subscriptions.data.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process the first active subscription
    const sub = subscriptions.data[0];
    const priceId = sub.items?.data?.[0]?.price?.id;

    // Get plan type from metadata or price lookup
    let planType = sub.metadata?.plan_type || 'free';
    let billingCycle = sub.metadata?.billing_cycle || null;

    // If not in metadata, try to determine from price lookup_key
    if (priceId && planType === 'free') {
      const price = await stripe.prices.retrieve(priceId);
      if (price.lookup_key) {
        // Parse lookup_key like "plan_veterinario_mensal"
        const parts = price.lookup_key.split('_');
        if (parts.length >= 3) {
          planType = parts[1]; // "veterinario", "medico", "juridico"
          billingCycle = parts[2]; // "mensal", "anual"
        }
      }
    }

    // Get user_id from customer metadata or user_plans table
    let userId = sub.metadata?.user_id;

    if (!userId) {
      // Try to get from customer metadata
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted) {
        userId = customer.metadata?.user_id;
      }
    }

    if (!userId) {
      // Try to get from user_plans table
      const { data: planData } = await supabase
        .from('user_plans')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (planData) {
        userId = planData.user_id;
      }
    }

    if (!userId) {
      throw new Error('Could not find user_id for this customer');
    }

    console.log(`[sync-stripe] Updating plan for user ${userId}: ${planType} (${billingCycle})`);

    // Update user plan
    const { error } = await supabase.rpc('upsert_user_plan', {
      _user_id: userId,
      _stripe_customer_id: customerId,
      _subscription_id: sub.id,
      _plan_type: planType,
      _billing_cycle: billingCycle,
      _status: 'active',
      _current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      _cancel_at_period_end: sub.cancel_at_period_end || false,
      _raw: sub as any,
    });

    if (error) {
      console.error('[sync-stripe] Error updating plan:', error);
      throw error;
    }

    console.log('[sync-stripe] Successfully synced subscription');

    return new Response(
      JSON.stringify({ 
        success: true, 
        plan_type: planType,
        billing_cycle: billingCycle,
        status: 'active'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-stripe] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
