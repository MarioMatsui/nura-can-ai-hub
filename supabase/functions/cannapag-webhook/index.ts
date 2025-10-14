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
    status: string;
    external_reference?: string;
    plan_id?: string;
    amount: number;
    payment_method?: string;
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

    // Verify webhook authenticity
    const receivedToken = req.headers.get('x-webhook-token');
    if (receivedToken !== WEBHOOK_TOKEN) {
      console.error('Invalid webhook token');
      return new Response(JSON.stringify({ error: 'Invalid webhook token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: CannapagWebhookPayload = await req.json();
    console.log('Processing webhook event:', payload.event);

    // Only process payment confirmation events
    if (payload.event !== 'payment.confirmed' && payload.event !== 'subscription.activated') {
      console.log('Ignoring non-confirmation event:', payload.event);
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const externalReference = payload.data.external_reference;
    if (!externalReference) {
      console.error('No external_reference found in webhook payload');
      return new Response(JSON.stringify({ error: 'No external_reference provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine plan type based on payment link or amount
    const planType = determinePlanType(payload.data);
    
    if (!planType) {
      console.error('Could not determine plan type from webhook data');
      return new Response(JSON.stringify({ error: 'Invalid plan type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing subscription activation');

    // Handle Specialist plan - deactivate individual plans
    if (planType === 'specialist') {
      const { error: deactivateError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'inactive' })
        .eq('user_id', externalReference)
        .in('plan_type', ['medical', 'legal', 'veterinary']);

      if (deactivateError) {
        console.error('Error deactivating individual plans:', deactivateError);
      } else {
        console.log('Individual plans deactivated for specialist upgrade');
      }
    }

    // Check if subscription already exists
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', externalReference)
      .eq('plan_type', planType)
      .single();

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSub.id);

      if (updateError) {
        console.error('Error updating subscription:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update subscription' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Subscription updated successfully');
    } else {
      // Create new subscription
      const { error: insertError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: externalReference,
          plan_type: planType,
          status: 'active',
        });

      if (insertError) {
        console.error('Error creating subscription:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create subscription' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Subscription created successfully');
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Subscription processed successfully',
      user_id: externalReference,
      plan_type: planType 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function determinePlanType(data: CannapagWebhookPayload['data']): string | null {
  // Map plan IDs or payment link IDs to plan types
  const planMapping: Record<string, string> = {
    // Medical
    'e68ce176-b2b0-4013-817c-a02d29419176': 'medical',
    '0c4d0af3-b48d-4ed7-b59b-d8b76eb6e538': 'medical',
    // Legal
    '9dbfd8f1-3edf-46ed-a6d7-50de12176ed3': 'legal',
    'ed2d1e63-4fb8-4cfb-9cb7-b26710ce979b': 'legal',
    // Veterinary
    '8a33c660-b08f-44b2-84d1-c5f9c907d912': 'veterinary',
    '9b779179-68b7-4f03-9862-991a14c426f9': 'veterinary',
    // Specialist
    '4e8284a1-3f3d-4ac1-b7fb-aa1102922539': 'specialist',
    '9082ff5d-4283-441f-a395-2b045b746192': 'specialist',
  };

  // Try to determine from plan_id if provided
  if (data.plan_id && planMapping[data.plan_id]) {
    return planMapping[data.plan_id];
  }

  // Try to determine from amount
  // Medical/Legal/Veterinary: R$ 69.90 monthly or R$ 718.80 annual
  // Specialist: R$ 159.90 monthly or R$ 1798.80 annual
  if (data.amount === 159.90 || data.amount === 1798.80) {
    return 'specialist';
  } else if (data.amount === 69.90 || data.amount === 718.80) {
    // Cannot distinguish between medical/legal/veterinary by amount alone
    // Would need additional context from the payment link
    console.warn('Cannot determine specific plan type from amount alone');
    return null;
  }

  return null;
}