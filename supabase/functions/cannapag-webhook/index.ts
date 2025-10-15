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
    console.log('Payload received:', JSON.stringify(payload, null, 2));
    console.log('Payer email extracted:', payerEmail);
    
    if (!payerEmail) {
      console.error('No payer email found in webhook payload');
      return new Response(JSON.stringify({ error: 'No payer email provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find user by email (case-insensitive)
    console.log('Looking for user with email:', payerEmail);
    const { data: authUser, error: userError } = await supabase.auth.admin.listUsers();
    const user = authUser?.users.find(u => u.email?.toLowerCase() === payerEmail.toLowerCase());
    
    console.log('User found:', user ? `ID: ${user.id}, Email: ${user.email}` : 'NOT FOUND');
    
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
    // Extract reference using regex to get only the final tag (PLAN_VETERINARIO_MENSAL, etc)
    const rawRef = payload.data.reference || payload.data.external_reference || '';
    console.log('Raw reference from payload:', rawRef);
    
    const match = rawRef.match(/PLAN_[A-Z_]+$/);
    const reference = match ? match[0] : undefined;
    console.log('Extracted reference via regex:', reference);
    
    const planMapping = mapReferenceToPlan(reference);
    console.log('Plan mapping result:', planMapping);
    
    if (!planMapping) {
      console.error('Could not determine plan from reference:', reference, 'Raw ref:', rawRef);
      return new Response(JSON.stringify({ error: 'Invalid plan reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { plan_type, billing_cycle } = planMapping;
    
    // Audit log
    console.log('Processing subscription activation:', {
      user_id: user.id,
      payer_email: payerEmail,
      reference,
      event_id: eventId,
      charge_id: payload.data.charge_id,
      plan_type,
      billing_cycle,
      status: payload.data.status,
    });

    // Record payment
    console.log('Recording payment:', {
      user_id: user.id,
      provider: 'cannapag',
      plan_type,
      billing_cycle,
      amount: payload.data.amount,
    });
    
    const { data: paymentData, error: paymentError } = await supabase.from('payments').insert({
      user_id: user.id,
      provider: 'cannapag',
      provider_payment_id: eventId,
      plan_type: plan_type,
      billing_cycle: billing_cycle,
      amount: payload.data.amount,
      status: 'paid',
      payer_email: payerEmail,
      payload_raw: payload,
    }).select();
    
    if (paymentError) {
      console.error('Error recording payment:', paymentError);
    } else {
      console.log('Payment recorded successfully:', paymentData);
    }

    // Check for specialist plan to deactivate individual plans
    if (plan_type === 'especialista') {
      console.log('Deactivating individual plans for specialist upgrade');
      
      const { data: deactivatedPlans, error: deactivateError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'inactive' })
        .eq('user_id', user.id)
        .in('plan_type', ['medico', 'juridico', 'veterinario'])
        .select();
      
      if (deactivateError) {
        console.error('Error deactivating individual plans:', deactivateError);
      } else {
        console.log('Individual plans deactivated:', deactivatedPlans);
      }
    } else {
      // Check if user already has specialist active
      const { data: specialistSub } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('plan_type', 'especialista')
        .eq('status', 'active')
        .maybeSingle();

      if (specialistSub) {
        console.log('User already has specialist plan, skipping individual plan activation');
        
        // Mark webhook as processed
        await supabase
          .from('webhook_events')
          .update({ processed: true })
          .eq('event_id', eventId);
        
        return new Response(JSON.stringify({ 
          message: 'User already has specialist plan',
          plan_type: 'especialista'
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

        // Create admin notification
        await supabase.from('admin_notifications').insert({
          type: 'payment_review_needed',
          payload: {
            email: payerEmail,
            user_id: user.id,
            plan_type,
            message: 'Usuário atingiu limite de 3 planos ativos',
          },
        });

        // Mark webhook as processed
        await supabase
          .from('webhook_events')
          .update({ processed: true })
          .eq('event_id', eventId);

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
      .maybeSingle();

    const now = new Date().toISOString();
    
    if (existingSub) {
      // Update existing subscription
      console.log('Updating existing subscription:', existingSub.id);
      
      const { data: updatedSub, error: updateError } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'active',
          billing_period: billing_cycle,
          started_at: now,
          expires_at: null, // Set to null or use current_period_end from payload if available
          updated_at: now,
        })
        .eq('id', existingSub.id)
        .select();

      if (updateError) {
        console.error('Error updating subscription:', updateError);
      } else {
        console.log('Subscription updated successfully:', updatedSub);
      }
    } else {
      // Create new subscription
      console.log('Creating new subscription for user:', user.id);
      
      const { data: newSub, error: insertError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_type: plan_type,
          billing_period: billing_cycle,
          status: 'active',
          started_at: now,
          expires_at: null, // Set to null or use current_period_end from payload if available
        })
        .select();

      if (insertError) {
        console.error('Error creating subscription:', insertError);
      } else {
        console.log('Subscription created successfully:', newSub);
      }
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

// Normalize plan type names (PT/EN compatibility)
function normalizePlanType(planType: string): string {
  return planType
    .toLowerCase()
    .replace('veterinary', 'veterinario')
    .replace('juridical', 'juridico')
    .replace('legal', 'juridico')
    .replace('medical', 'medico');
}

function mapReferenceToPlan(reference?: string): { plan_type: string; billing_cycle: string } | null {
  if (!reference) return null;

  const PLAN_MAP: Record<string, { plan_type: string; billing_cycle: string }> = {
    'PLAN_MEDICO_MENSAL': { plan_type: 'medico', billing_cycle: 'mensal' },
    'PLAN_JURIDICO_MENSAL': { plan_type: 'juridico', billing_cycle: 'mensal' },
    'PLAN_VETERINARIO_MENSAL': { plan_type: 'veterinario', billing_cycle: 'mensal' },
    'PLAN_ESPECIALISTA_MENSAL': { plan_type: 'especialista', billing_cycle: 'mensal' },
    'PLAN_MEDICO_ANUAL': { plan_type: 'medico', billing_cycle: 'anual' },
    'PLAN_JURIDICO_ANUAL': { plan_type: 'juridico', billing_cycle: 'anual' },
    'PLAN_VETERINARIO_ANUAL': { plan_type: 'veterinario', billing_cycle: 'anual' },
    'PLAN_ESPECIALISTA_ANUAL': { plan_type: 'especialista', billing_cycle: 'anual' },
  };

  const mapping = PLAN_MAP[reference.toUpperCase()];
  if (!mapping) return null;

  // Normalize plan_type if needed
  return {
    plan_type: normalizePlanType(mapping.plan_type),
    billing_cycle: mapping.billing_cycle,
  };
}