import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

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
    console.error('[create-portal-session] Error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Falha ao criar sessão do portal.',
        details: err instanceof Error ? err.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
