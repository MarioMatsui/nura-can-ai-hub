import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

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
    // Verify JWT token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('[create-portal-session] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária.' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { stripe_customer_id, return_url } = await req.json();

    console.log('[create-portal-session] Request received:', {
      stripe_customer_id,
      return_url
    });

    // Validate required fields
    if (!stripe_customer_id) {
      console.error('[create-portal-session] Missing stripe_customer_id');
      return new Response(
        JSON.stringify({ error: 'stripe_customer_id é obrigatório.' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[create-portal-session] STRIPE_SECRET_KEY not configured');
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

    // Initialize Supabase client to verify user ownership
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[create-portal-session] Supabase not configured');
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor inválida.' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user owns this customer ID
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('[create-portal-session] Invalid token');
      return new Response(
        JSON.stringify({ error: 'Token de autenticação inválido.' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify the customer belongs to the authenticated user
    const { data: planData, error: verifyError } = await supabase
      .from('user_plans')
      .select('user_id')
      .eq('stripe_customer_id', stripe_customer_id)
      .single();

    if (verifyError || !planData || planData.user_id !== user.id) {
      console.error('[create-portal-session] Customer ownership verification failed');
      return new Response(
        JSON.stringify({ error: 'Acesso não autorizado.' }),
        { 
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get return URL from environment or use provided one
    const finalReturnUrl = return_url || 
                          Deno.env.get('APP_BASE_URL') || 
                          'https://nuracan.ai';

    console.log('[create-portal-session] Creating portal session:', {
      customer: stripe_customer_id,
      return_url: finalReturnUrl
    });

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripe_customer_id,
      return_url: finalReturnUrl,
    });

    console.log('[create-portal-session] Portal session created:', session.id);

    return new Response(
      JSON.stringify({ 
        url: session.url,
        session_id: session.id 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error(`[create-portal-session] [${requestId}] Error:`, err);
    return new Response(
      JSON.stringify({ 
        error: 'Falha ao criar sessão do portal.',
        request_id: requestId
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
