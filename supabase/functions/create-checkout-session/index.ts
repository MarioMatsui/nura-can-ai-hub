import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

// --- RATE LIMITING ---
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10; // 10 checkout attempts per minute per IP

function checkRateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  entry.count++;
  return { allowed: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);
// --- END RATE LIMITING ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' };

  try {
    // Rate limit by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(clientIp).allowed) {
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde um momento.' }),
        { status: 429, headers: responseHeaders }
      );
    }

    const { price_id, customer_email, metadata = {}, mode = 'subscription' } = await req.json();

    console.log('[create-checkout-session] Request:', { price_id, mode });

    // Validate required fields
    if (!price_id || !customer_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: price_id and customer_email' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Input validation
    if (typeof price_id !== 'string' || price_id.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid price_id' }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (typeof mode !== 'string' || !['subscription', 'payment'].includes(mode)) {
      return new Response(
        JSON.stringify({ error: 'Invalid mode' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate email server-side
    if (!validateEmail(customer_email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[create-checkout-session] STRIPE_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe não configurado.' }),
        { status: 500, headers: responseHeaders }
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

    // Get URLs from environment
    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://nuracan.ai';
    const successUrl = Deno.env.get('STRIPE_SUCCESS_URL') || `${baseUrl}/checkout/sucesso`;
    const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') || `${baseUrl}/checkout/cancelado`;

    console.log('[create-checkout-session] Creating checkout session with:', {
      mode,
      customer: customer.id,
      price_id,
    });

    // Update customer metadata with user_id if provided
    if (metadata.user_id) {
      await stripe.customers.update(customer.id, {
        metadata: { user_id: metadata.user_id }
      });
      console.log('[create-checkout-session] Updated customer metadata with user_id');
    }

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
      subscription_data: mode === 'subscription' ? {
        metadata
      } : undefined,
      allow_promotion_codes: true,
    });

    console.log('[create-checkout-session] Session created successfully:', session.id);

    return new Response(
      JSON.stringify({ 
        url: session.url,
        session_id: session.id 
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (err) {
    console.error('[create-checkout-session] Error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Falha ao criar sessão de checkout.',
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});
