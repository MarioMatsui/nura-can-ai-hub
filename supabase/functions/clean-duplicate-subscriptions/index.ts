import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' };

  try {
    // --- AUTH: Verify caller is authenticated and is admin ---
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: responseHeaders }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Check admin role
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: responseHeaders }
      );
    }
    // --- END AUTH ---

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: 'Serviço não configurado' }),
        { status: 503, headers: responseHeaders }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    const { userId } = await req.json();

    if (!userId || typeof userId !== 'string' || userId.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Parâmetro userId inválido' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Get user's current plans from database
    const { data: userPlans, error: plansError } = await supabaseClient
      .from('user_plans')
      .select('*')
      .eq('user_id', userId);

    if (plansError) {
      console.error('Error fetching user plans:', plansError);
      throw new Error('Failed to fetch user subscription plans');
    }

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

    if (plansToDeactivate.length > 0) {
      const { error: updateError } = await supabaseClient
        .from('user_plans')
        .update({ status: 'canceled' })
        .in('id', plansToDeactivate);

      if (updateError) {
        console.error('Error updating plans:', updateError);
        throw new Error('Failed to update subscription status');
      }
    }

    const { data: updatedPlans, error: updatedError } = await supabaseClient
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (updatedError) {
      console.error('Error fetching updated plans:', updatedError);
      throw new Error('Failed to retrieve updated plans');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up subscriptions. ${plansToKeep.length} active, ${plansToDeactivate.length} deactivated`,
        activePlans: updatedPlans,
      }),
      { headers: responseHeaders }
    );

  } catch (error: any) {
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}] Error in clean-duplicate-subscriptions:`, error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao limpar assinaturas duplicadas',
        request_id: requestId
      }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
