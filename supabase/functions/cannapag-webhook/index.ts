import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CannapagWebhookPayload {
  event: string;
  data: {
    id: string;
    charge_id?: string;
    status: string;
    reference?: string;
    external_reference?: string;
    link_id?: string;
    product_id?: string;
    amount: number;
    payer?: {
      email: string;
      name?: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WEBHOOK_TOKEN = Deno.env.get('CANNAPAG_WEBHOOK_TOKEN');
    if (!WEBHOOK_TOKEN) {
      console.error('CANNAPAG_WEBHOOK_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'Webhook token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get request body as text for HMAC verification
    const rawBody = await req.text();
    
    // Verify webhook authenticity with token
    const receivedToken = req.headers.get('x-webhook-token');
    if (receivedToken !== WEBHOOK_TOKEN) {
      console.error('Invalid webhook token');
      return new Response(JSON.stringify({ error: 'Invalid webhook token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate timestamp to prevent replay attacks (5 minute window)
    const timestamp = req.headers.get('x-webhook-timestamp');
    if (timestamp) {
      const requestTime = new Date(timestamp).getTime();
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (Math.abs(currentTime - requestTime) > fiveMinutes) {
        console.error('Webhook timestamp outside acceptable window');
        return new Response(JSON.stringify({ error: 'Request timestamp too old or too far in future' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: CannapagWebhookPayload = JSON.parse(rawBody);
    console.log('Processing webhook event:', payload.event);

    // Only process payment confirmation events
    if (payload.event !== 'payment.confirmed' && payload.event !== 'subscription.activated') {
      console.log('Ignoring non-confirmation event:', payload.event);
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for idempotency - prevent duplicate processing
    const eventId = payload.data.charge_id || payload.data.id;
    if (eventId) {
      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .single();

      if (existingEvent) {
        console.log('Webhook already processed:', eventId);
        return new Response(JSON.stringify({ 
          message: 'Webhook already processed',
          event_id: eventId 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Record this webhook event
      await supabase
        .from('webhook_events')
        .insert({
          event_id: eventId,
          event_type: payload.event,
          provider: 'cannapag',
          payload: payload,
          processed: false,
        });
    }

    // Extract payer email
    const payerEmail = payload.data.payer?.email;
    if (!payerEmail) {
      console.error('No payer email found in webhook payload');
      return new Response(JSON.stringify({ error: 'No payer email provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find user by email (case-insensitive)
    const { data: authUser, error: userError } = await supabase.auth.admin.listUsers();
    const user = authUser?.users.find(u => u.email?.toLowerCase() === payerEmail.toLowerCase());
    
    if (!user) {
      console.warn('User not found for email:', payerEmail);
      
      // Record payment for manual review
      await supabase.from('payments').insert({
        user_id: '00000000-0000-0000-0000-000000000000', // Placeholder
        provider: 'cannapag',
        provider_payment_id: eventId,
        plan_type: 'medical', // Default
        amount: payload.data.amount,
        status: 'review_needed',
        payer_email: payerEmail,
        payload_raw: payload,
      });

      // Create admin notification
      await supabase.from('admin_notifications').insert({
        type: 'payment_review_needed',
        payload: {
          email: payerEmail,
          amount: payload.data.amount,
          reference: payload.data.reference,
          message: 'Pagamento recebido mas usuário não encontrado no sistema',
        },
      });

      return new Response(JSON.stringify({ 
        message: 'Payment recorded for review',
        requires_manual_review: true 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map reference to plan_type and billing_cycle
    const reference = payload.data.reference || payload.data.external_reference;
    const planMapping = mapReferenceToPlan(reference);
    
    if (!planMapping) {
      console.error('Could not determine plan from reference:', reference);
      return new Response(JSON.stringify({ error: 'Invalid plan reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { plan_type, billing_cycle } = planMapping;
    console.log('Processing subscription activation for user:', user.id, 'plan:', plan_type, 'billing:', billing_cycle);

    // Record payment
    await supabase.from('payments').insert({
      user_id: user.id,
      provider: 'cannapag',
      provider_payment_id: eventId,
      plan_type: plan_type,
      billing_cycle: billing_cycle,
      amount: payload.data.amount,
      status: 'paid',
      payer_email: payerEmail,
      payload_raw: payload,
    });

    // Check for specialist plan to deactivate individual plans
    if (plan_type === 'specialist') {
      await supabase
        .from('user_subscriptions')
        .update({ status: 'inactive' })
        .eq('user_id', user.id)
        .in('plan_type', ['medical', 'legal', 'veterinary']);
      
      console.log('Individual plans deactivated for specialist upgrade');
    } else {
      // Check if user already has specialist active
      const { data: specialistSub } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('plan_type', 'specialist')
        .eq('status', 'active')
        .single();

      if (specialistSub) {
        console.log('User already has specialist plan, skipping individual plan activation');
        return new Response(JSON.stringify({ 
          message: 'User already has specialist plan',
          plan_type: 'specialist'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check active plans limit (max 3)
      const { data: activePlans } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (activePlans && activePlans.length >= 3) {
        console.warn('User has reached maximum of 3 active plans');
        await supabase.from('payments').update({
          status: 'review_needed',
        }).eq('provider_payment_id', eventId);

        return new Response(JSON.stringify({ 
          message: 'Maximum active plans limit reached',
          requires_manual_review: true
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check if subscription already exists
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('plan_type', plan_type)
      .single();

    if (existingSub) {
      // Update existing subscription
      await supabase
        .from('user_subscriptions')
        .update({
          status: 'active',
          billing_period: billing_cycle,
          started_at: new Date().toISOString(),
          expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSub.id);

      console.log('Subscription updated successfully');
    } else {
      // Create new subscription
      await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_type: plan_type,
          billing_period: billing_cycle,
          status: 'active',
          started_at: new Date().toISOString(),
        });

      console.log('Subscription created successfully');
    }

    // Mark webhook event as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true })
      .eq('event_id', eventId);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Subscription processed successfully',
      user_id: user.id,
      plan_type: plan_type 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}] Error processing webhook:`, error);
    // Return generic error to client, log details server-side only
    return new Response(JSON.stringify({ 
      error: 'Erro ao processar webhook. Por favor, tente novamente.',
      request_id: requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function mapReferenceToPlan(reference?: string): { plan_type: string; billing_cycle: string } | null {
  if (!reference) return null;

  const planMapping: Record<string, { plan_type: string; billing_cycle: string }> = {
    // Medical
    'PLAN_MEDICO_MENSAL': { plan_type: 'medical', billing_cycle: 'monthly' },
    'PLAN_MEDICO_ANUAL': { plan_type: 'medical', billing_cycle: 'annual' },
    // Legal
    'PLAN_JURIDICO_MENSAL': { plan_type: 'legal', billing_cycle: 'monthly' },
    'PLAN_JURIDICO_ANUAL': { plan_type: 'legal', billing_cycle: 'annual' },
    // Veterinary
    'PLAN_VETERINARIO_MENSAL': { plan_type: 'veterinary', billing_cycle: 'monthly' },
    'PLAN_VETERINARIO_ANUAL': { plan_type: 'veterinary', billing_cycle: 'annual' },
    // Specialist
    'PLAN_ESPECIALISTA_MENSAL': { plan_type: 'specialist', billing_cycle: 'monthly' },
    'PLAN_ESPECIALISTA_ANUAL': { plan_type: 'specialist', billing_cycle: 'annual' },
  };

  return planMapping[reference.toUpperCase()] || null;
}