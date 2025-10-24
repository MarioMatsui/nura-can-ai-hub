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
    const { price_id, customer_email, metadata = {}, mode = 'subscription' } = await req.json();

    console.log('[create-checkout-session] Request received:', {
      price_id,
      customer_email,
      mode,
      metadata
    });

    // Validate required fields
    if (!price_id || !customer_email) {
      console.error('[create-checkout-session] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'price_id e customer_email são obrigatórios.' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[create-checkout-session] STRIPE_SECRET_KEY not configured');
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

    console.log('[create-checkout-session] Looking for existing customer:', customer_email);

    // Reuse customer by email or create new one
    const existingCustomers = await stripe.customers.list({ 
      email: customer_email, 
      limit: 1 
    });

    let customer;
    if (existingCustomers.data && existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log('[create-checkout-session] Using existing customer:', customer.id);
    } else {
      customer = await stripe.customers.create({ 
        email: customer_email 
      });
      console.log('[create-checkout-session] Created new customer:', customer.id);
    }

    // Get URLs from environment (without VITE_ prefix for edge functions)
    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://nuracan.ai';
    const successUrl = Deno.env.get('STRIPE_SUCCESS_URL') || `${baseUrl}/checkout/sucesso`;
    const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') || `${baseUrl}/checkout/cancelado`;

    console.log('[create-checkout-session] Creating checkout session with:', {
      mode,
      customer: customer.id,
      price_id,
      successUrl,
      cancelUrl
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customer.id,
      line_items: [{ 
        price: price_id, 
        quantity: 1 
      }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata,
      allow_promotion_codes: true,
    });

    console.log('[create-checkout-session] Session created successfully:', session.id);

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
    console.error('[create-checkout-session] Error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Falha ao criar sessão de checkout.',
        details: err instanceof Error ? err.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
