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
    // Auth client (only used to validate the requesting user)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Admin client (bypasses RLS) for privileged writes initiated by the user
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

    // Get all active individual plans (medical, legal, veterinary) — scoped to this user
    const { data: activePlans, error: plansError } = await adminClient
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('plan_type', ['medical', 'legal', 'veterinary']);

    if (plansError) {
      console.error('Error fetching plans:', plansError);
      throw new Error('Failed to fetch subscription plans');
    }

    console.log('Found active individual plans:', activePlans?.length || 0);

    // Update specialist subscription to active — verify ownership via user_id filter
    const { error: updateError } = await adminClient
      .from('user_subscriptions')
      .update({
        status: 'active',
        billing_period: billing_period || 'monthly',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating subscription:', updateError);
      throw new Error('Failed to activate specialist plan');
    }

    // Schedule cancellation for all active individual plans
    if (activePlans && activePlans.length > 0) {
      for (const plan of activePlans) {
        // Update plan status to scheduled_cancellation
        const { error: cancelError } = await adminClient
          .from('user_subscriptions')
          .update({
            status: 'scheduled_cancellation',
            cancel_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            updated_at: new Date().toISOString(),
          })
          .eq('id', plan.id)
          .eq('user_id', user.id);

        if (cancelError) {
          console.error('Error scheduling cancellation for plan:', plan.id, cancelError);
          continue;
        }

        // Create cancellation request
        const { error: requestError } = await adminClient
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

        // Create admin notification (requires service role after RLS hardening)
        const { error: notifError } = await adminClient
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
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}] Error in activate-specialist function:`, error);
    
    // Map to user-friendly error messages
    let userMessage = 'Erro ao ativar plano especialista';
    let statusCode = 500;
    
    if (error.message === 'Unauthorized') {
      userMessage = 'Não autorizado';
      statusCode = 401;
    }
    
    return new Response(
      JSON.stringify({ 
        error: userMessage,
        request_id: requestId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    );
  }
});