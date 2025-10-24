import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

interface PlanMapping {
  plan_type: string;
  billing_cycle: 'mensal' | 'anual';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[stripe-webhook][${requestId}] Webhook received`);

  try {
    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!stripeSecretKey || !webhookSecret) {
      console.error(`[stripe-webhook][${requestId}] Missing Stripe configuration`);
      return new Response(
        JSON.stringify({ error: 'Stripe não configurado.' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get raw body and signature
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.error(`[stripe-webhook][${requestId}] Missing stripe-signature header`);
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      console.log(`[stripe-webhook][${requestId}] Signature verified, event type: ${event.type}`);
    } catch (err) {
      console.error(`[stripe-webhook][${requestId}] Invalid signature:`, err);
      return new Response(
        JSON.stringify({ error: `Webhook Error: ${err instanceof Error ? err.message : 'Invalid signature'}` }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Price ID mapping
    const PRICE_MAP: Record<string, PlanMapping> = {
      [Deno.env.get('VITE_PRICE_MEDICO_MENSAL') || '']: { plan_type: 'medico', billing_cycle: 'mensal' },
      [Deno.env.get('VITE_PRICE_MEDICO_ANUAL') || '']: { plan_type: 'medico', billing_cycle: 'anual' },
      [Deno.env.get('VITE_PRICE_JURIDICO_MENSAL') || '']: { plan_type: 'juridico', billing_cycle: 'mensal' },
      [Deno.env.get('VITE_PRICE_JURIDICO_ANUAL') || '']: { plan_type: 'juridico', billing_cycle: 'anual' },
      [Deno.env.get('VITE_PRICE_VET_MENSAL') || '']: { plan_type: 'veterinario', billing_cycle: 'mensal' },
      [Deno.env.get('VITE_PRICE_VET_ANUAL') || '']: { plan_type: 'veterinario', billing_cycle: 'anual' },
      [Deno.env.get('VITE_PRICE_ESPECIALISTA_MENSAL') || '']: { plan_type: 'especialista', billing_cycle: 'mensal' },
      [Deno.env.get('VITE_PRICE_ESPECIALISTA_ANUAL') || '']: { plan_type: 'especialista', billing_cycle: 'anual' },
    };

    // Helper function to sync subscription to database
    async function syncFromSubscription(
      sub: Stripe.Subscription, 
      customerId: string, 
      extraMeta?: Record<string, any>
    ) {
      const item = sub.items?.data?.[0];
      const priceId = item?.price?.id;
      const mapping = priceId ? PRICE_MAP[priceId] : undefined;

      const userId = sub.metadata?.user_id || extraMeta?.user_id || customerId;
      
      console.log(`[stripe-webhook][${requestId}] Syncing subscription:`, {
        subscription_id: sub.id,
        user_id: userId,
        customer_id: customerId,
        price_id: priceId,
        status: sub.status,
        plan_type: mapping?.plan_type || 'free',
        billing_cycle: mapping?.billing_cycle,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        metadata: sub.metadata,
      });

      if (!userId) {
        console.error(`[stripe-webhook][${requestId}] No user_id found for subscription`);
        throw new Error('No user_id found');
      }

      const { data, error } = await supabase.rpc('upsert_user_plan', {
        _user_id: userId,
        _stripe_customer_id: customerId,
        _subscription_id: sub.id,
        _plan_type: mapping?.plan_type || 'free',
        _billing_cycle: mapping?.billing_cycle || null,
        _status: sub.status,
        _current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        _cancel_at_period_end: sub.cancel_at_period_end || false,
        _raw: sub as any,
      });

      if (error) {
        console.error(`[stripe-webhook][${requestId}] Error upserting user plan:`, error);
        throw error;
      }

      console.log(`[stripe-webhook][${requestId}] Successfully synced subscription for user:`, userId, 'Result:', data);
      return data;
    }

    // Helper function to mark subscription as past_due
    async function markPastDue(subscriptionId: string) {
      console.log(`[stripe-webhook][${requestId}] Marking subscription as past_due:`, subscriptionId);

      const { error } = await supabase
        .from('user_plans')
        .update({ 
          status: 'past_due',
          updated_at: new Date().toISOString()
        })
        .eq('subscription_id', subscriptionId);

      if (error) {
        console.error(`[stripe-webhook][${requestId}] Error marking past_due:`, error);
        throw error;
      }

      console.log(`[stripe-webhook][${requestId}] Successfully marked as past_due`);
    }

    // Process webhook event
    const eventType = event.type;
    const data = event.data.object as any;

    console.log(`[stripe-webhook][${requestId}] Processing event: ${eventType}`);

    switch (eventType) {
      case 'checkout.session.completed': {
        console.log(`[stripe-webhook][${requestId}] Checkout completed for customer:`, data.customer);
        
        if (data.mode === 'subscription' && data.subscription) {
          const subscription = await stripe.subscriptions.retrieve(data.subscription as string);
          await syncFromSubscription(subscription, data.customer as string, data.metadata);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        console.log(`[stripe-webhook][${requestId}] Subscription ${eventType.split('.')[2]} for:`, data.id);
        await syncFromSubscription(data as Stripe.Subscription, data.customer as string);
        break;
      }

      case 'invoice.payment_failed': {
        console.log(`[stripe-webhook][${requestId}] Payment failed for subscription:`, data.subscription);
        if (data.subscription) {
          await markPastDue(data.subscription as string);
        }
        break;
      }

      default:
        console.log(`[stripe-webhook][${requestId}] Unhandled event type: ${eventType}`);
    }

    console.log(`[stripe-webhook][${requestId}] Webhook processed successfully`);

    return new Response(
      JSON.stringify({ received: true }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (err) {
    console.error(`[stripe-webhook][${requestId}] Error processing webhook:`, err);
    return new Response(
      JSON.stringify({ 
        error: 'Falha ao processar webhook.',
        details: err instanceof Error ? err.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
