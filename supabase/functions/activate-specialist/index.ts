import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { subscriptionId, billing_period } = await req.json();

    console.log('Activating specialist plan for user:', user.id, 'subscription:', subscriptionId);

    // Get all active individual plans (medical, legal, veterinary)
    const { data: activePlans, error: plansError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('plan_type', ['medical', 'legal', 'veterinary']);

    if (plansError) {
      throw plansError;
    }

    console.log('Found active individual plans:', activePlans?.length || 0);

    // Update specialist subscription to active
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'active',
        billing_period: billing_period || 'monthly',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId);

    if (updateError) {
      throw updateError;
    }

    // Schedule cancellation for all active individual plans
    if (activePlans && activePlans.length > 0) {
      for (const plan of activePlans) {
        // Update plan status to scheduled_cancellation
        const { error: cancelError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'scheduled_cancellation',
            cancel_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            updated_at: new Date().toISOString(),
          })
          .eq('id', plan.id);

        if (cancelError) {
          console.error('Error scheduling cancellation for plan:', plan.id, cancelError);
          continue;
        }

        // Create cancellation request
        const { error: requestError } = await supabase
          .from('cancellation_requests')
          .insert({
            user_id: user.id,
            subscription_id: plan.id,
            plan_code: plan.plan_type,
            plan_type_requested: plan.plan_type,
            cancellation_reason: 'upgrade_para_especialista',
            status: 'pending',
            effective_cancel_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            provider: 'stripe',
          });

        if (requestError) {
          console.error('Error creating cancellation request:', requestError);
        }

        // Create admin notification
        const { error: notifError } = await supabase
          .from('admin_notifications')
          .insert({
            type: 'cancellation_request',
            status: 'unread',
            payload: {
              user_id: user.id,
              plan_type: plan.plan_type,
              reason: 'upgrade_para_especialista',
              message: `Usuário ${user.email} fez upgrade para Especialista. Plano ${plan.plan_type} agendado para cancelamento.`,
            },
          });

        if (notifError) {
          console.error('Error creating admin notification:', notifError);
        }
      }
    }

    console.log('Specialist plan activation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: activePlans && activePlans.length > 0
          ? 'Especialista ativado. Seus outros planos foram agendados para cancelamento.'
          : 'Especialista ativado com sucesso.',
        cancelledPlans: activePlans?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in activate-specialist function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
});