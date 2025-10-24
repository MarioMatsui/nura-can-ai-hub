import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { userId } = await req.json();

    if (!userId) {
      throw new Error('userId is required');
    }

    // Get user's current plans from database
    const { data: userPlans, error: plansError } = await supabaseClient
      .from('user_plans')
      .select('*')
      .eq('user_id', userId);

    if (plansError) throw plansError;

    console.log(`Found ${userPlans.length} plans for user ${userId}`);

    // Get Stripe customer ID
    const stripeCustomerId = userPlans[0]?.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new Error('No Stripe customer ID found');
    }

    // Fetch all subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
    });

    console.log(`Found ${subscriptions.data.length} subscriptions in Stripe`);

    const activeStripeSubscriptions = new Set(
      subscriptions.data
        .filter((sub: any) => sub.status === 'active' || sub.status === 'trialing')
        .map((sub: any) => sub.id)
    );

    // Track which plans to keep
    const plansToKeep: string[] = [];
    const plansToDeactivate: string[] = [];

    for (const plan of userPlans) {
      if (plan.subscription_id && activeStripeSubscriptions.has(plan.subscription_id)) {
        plansToKeep.push(plan.id);
        console.log(`Keeping plan ${plan.id} (${plan.plan_type}) - active in Stripe`);
      } else {
        plansToDeactivate.push(plan.id);
        console.log(`Deactivating plan ${plan.id} (${plan.plan_type}) - not active in Stripe`);
      }
    }

    // Deactivate plans that are not active in Stripe
    if (plansToDeactivate.length > 0) {
      const { error: updateError } = await supabaseClient
        .from('user_plans')
        .update({ status: 'canceled' })
        .in('id', plansToDeactivate);

      if (updateError) throw updateError;
    }

    // Get updated plans
    const { data: updatedPlans, error: updatedError } = await supabaseClient
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (updatedError) throw updatedError;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up subscriptions. ${plansToKeep.length} active, ${plansToDeactivate.length} deactivated`,
        activePlans: updatedPlans,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error?.message || 'Unknown error',
        details: error?.toString() || 'No details available'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
