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
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
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

    // Check for duplicate webhook event (replay attack protection)
    const { data: existingEvent } = await supabase
      .from('processed_webhooks')
      .select('id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existingEvent) {
      console.log(`[stripe-webhook][${requestId}] Duplicate event ${event.id} - already processed`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record webhook event for deduplication
    await supabase
      .from('processed_webhooks')
      .insert({
        event_id: event.id,
        event_type: event.type,
        provider: 'stripe',
        processed_at: new Date().toISOString(),
      });

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

    // Helper function to register payment
    async function registerPayment(invoice: Stripe.Invoice) {
      try {
        console.log(`[stripe-webhook][${requestId}] Registering payment for invoice:`, invoice.id);
        
        // Get user_id from subscription or customer
        let userId: string | null = null;
        
        if (invoice.subscription) {
          const { data: planData } = await supabase
            .from('user_plans')
            .select('user_id, plan_type, billing_cycle')
            .eq('subscription_id', invoice.subscription)
            .maybeSingle();
          
          if (planData) {
            userId = planData.user_id;
            
            // Register payment
            const { error: paymentError } = await supabase
              .from('payments')
              .insert({
                user_id: userId,
                provider: 'stripe',
                provider_payment_id: invoice.payment_intent as string,
                charge_id: invoice.charge as string,
                amount: (invoice.amount_paid || 0) / 100, // Convert cents to reais
                status: invoice.status === 'paid' ? 'paid' : invoice.status,
                plan_type: planData.plan_type,
                billing_cycle: planData.billing_cycle,
                payer_email: invoice.customer_email || undefined,
                payload_raw: invoice as any,
              });
            
            if (paymentError) {
              console.error(`[stripe-webhook][${requestId}] Error registering payment:`, paymentError);
            } else {
              console.log(`[stripe-webhook][${requestId}] Payment registered successfully for user:`, userId);
            }
          }
        }
      } catch (err) {
        console.error(`[stripe-webhook][${requestId}] Error in registerPayment:`, err);
      }
    }

    // Helper function to sync subscription to database
    async function syncFromSubscription(
      sub: Stripe.Subscription, 
      customerId: string, 
      extraMeta?: Record<string, any>
    ) {
      // Expand discounts if they exist
      let expandedSub = sub;
      if (sub.discounts && sub.discounts.length > 0 && typeof sub.discounts[0] === 'string') {
        try {
          console.log(`[stripe-webhook][${requestId}] Expanding subscription discounts for:`, sub.id);
          expandedSub = await stripe.subscriptions.retrieve(sub.id, {
            expand: ['discounts.coupon']
          });
        } catch (err) {
          console.error(`[stripe-webhook][${requestId}] Error expanding discounts:`, err);
        }
      }
      
      const item = expandedSub.items?.data?.[0];
      const priceId = item?.price?.id;
      const mapping = priceId ? PRICE_MAP[priceId] : undefined;

      // Get plan_type and billing_cycle from metadata first, fallback to mapping
      const planType = expandedSub.metadata?.plan_type || extraMeta?.plan_type || mapping?.plan_type || 'free';
      const billingCycle = expandedSub.metadata?.billing_cycle || extraMeta?.billing_cycle || mapping?.billing_cycle || null;

      // Try to get user_id from metadata first
      let userId = expandedSub.metadata?.user_id || extraMeta?.user_id;
      
      // If no user_id in metadata, look up by stripe_customer_id
      if (!userId) {
        console.log(`[stripe-webhook][${requestId}] No user_id in metadata, looking up by customer_id:`, customerId);
        
        const { data: existingPlan, error: lookupError } = await supabase
          .from('user_plans')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();
        
        if (lookupError) {
          console.error(`[stripe-webhook][${requestId}] Error looking up user by customer_id:`, lookupError);
        } else if (existingPlan) {
          userId = existingPlan.user_id;
          console.log(`[stripe-webhook][${requestId}] Found user_id from existing plan:`, userId);
        }
      }
      
      // If still no user_id, try to get from customer metadata
      if (!userId) {
        console.log(`[stripe-webhook][${requestId}] Fetching customer metadata from Stripe:`, customerId);
        try {
          const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
          userId = customer.metadata?.user_id;
          if (userId) {
            console.log(`[stripe-webhook][${requestId}] Found user_id in customer metadata:`, userId);
          }
        } catch (err) {
          console.error(`[stripe-webhook][${requestId}] Error fetching customer:`, err);
        }
      }
      
      console.log(`[stripe-webhook][${requestId}] Syncing subscription:`, {
        subscription_id: expandedSub.id,
        user_id: userId,
        customer_id: customerId,
        price_id: priceId,
        status: expandedSub.status,
        plan_type: planType,
        billing_cycle: billingCycle,
        current_period_end: expandedSub.current_period_end,
        cancel_at_period_end: expandedSub.cancel_at_period_end,
        metadata: expandedSub.metadata,
        has_discount: !!expandedSub.discount,
        has_discounts_array: !!expandedSub.discounts && expandedSub.discounts.length > 0,
      });

      if (!userId) {
        console.error(`[stripe-webhook][${requestId}] No user_id found for subscription after all attempts`);
        throw new Error('No user_id found');
      }

      const { data, error } = await supabase.rpc('upsert_user_plan', {
        _user_id: userId,
        _stripe_customer_id: customerId,
        _subscription_id: expandedSub.id,
        _plan_type: planType,
        _billing_cycle: billingCycle,
        _status: expandedSub.status,
        _current_period_end: expandedSub.current_period_end ? new Date(expandedSub.current_period_end * 1000).toISOString() : null,
        _cancel_at_period_end: expandedSub.cancel_at_period_end || false,
        _raw: expandedSub as any,
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

      case 'invoice.payment_succeeded': {
        console.log(`[stripe-webhook][${requestId}] Payment succeeded for invoice:`, data.id);
        await registerPayment(data as Stripe.Invoice);
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
      JSON.stringify({ received: true, request_id: requestId }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (err) {
    console.error(`[stripe-webhook][${requestId}] Error processing webhook: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return new Response(
      JSON.stringify({ 
        error: 'Falha ao processar webhook.',
        request_id: requestId
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
