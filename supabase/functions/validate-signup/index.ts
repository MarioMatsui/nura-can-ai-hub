import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

interface SignupData {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  birth_date: string;
  cpf: string;
  crm_crv?: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validateCpf(cpf: string): boolean {
  const cleanCpf = cpf.replace(/\D/g, '');
  
  if (cleanCpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCpf[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCpf[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf[10])) return false;
  
  return true;
}

// --- RATE LIMITING ---
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 signups per minute per IP

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

// Cleanup old entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);
// --- END RATE LIMITING ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };
  const requestId = crypto.randomUUID();

  try {
    // Rate limit by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(clientIp).allowed) {
      return new Response(
        JSON.stringify({ error: "Muitas tentativas. Aguarde um momento.", request_id: requestId }),
        { status: 429, headers: responseHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const data: SignupData = await req.json();

    // Input length validation
    if (typeof data.full_name !== "string" || data.full_name.length > 200) {
      return new Response(
        JSON.stringify({ error: "Nome inválido.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }
    if (typeof data.password !== "string" || data.password.length < 8 || data.password.length > 128) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter entre 8 e 128 caracteres.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }
    if (typeof data.phone !== "string" || data.phone.length > 30) {
      return new Response(
        JSON.stringify({ error: "Telefone inválido.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }
    if (data.crm_crv && (typeof data.crm_crv !== "string" || data.crm_crv.length > 50)) {
      return new Response(
        JSON.stringify({ error: "CRM/CRV inválido.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate email server-side
    if (!validateEmail(data.email)) {
      return new Response(
        JSON.stringify({ 
          error: "E-mail inválido. Por favor, verifique o endereço informado.",
          request_id: requestId
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate CPF server-side
    if (!validateCpf(data.cpf)) {
      return new Response(
        JSON.stringify({ 
          error: "CPF inválido. Por favor, verifique o número informado.",
          request_id: requestId
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Validate age (18+)
    const birthDate = new Date(data.birth_date);
    if (isNaN(birthDate.getTime())) {
      return new Response(
        JSON.stringify({ error: "Data de nascimento inválida.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      return new Response(
        JSON.stringify({ 
          error: "Você deve ter pelo menos 18 anos para se cadastrar.",
          request_id: requestId
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Check for existing CPF
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("cpf", data.cpf)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ 
          error: "Este CPF já está cadastrado.",
          request_id: requestId
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Create user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        phone: data.phone,
        birth_date: data.birth_date,
        cpf: data.cpf,
        crm_crv: data.crm_crv,
      },
    });

    if (authError) {
      console.error(`[${requestId}] Auth error: ${authError.message}`);
      
      if (authError.message.includes("already registered")) {
        return new Response(
          JSON.stringify({ 
            error: "Este e-mail já está cadastrado.",
            request_id: requestId
          }),
          { status: 400, headers: responseHeaders }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Erro ao criar conta. Por favor, tente novamente.",
          request_id: requestId
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    console.log(`[${requestId}] User created successfully: ${authData.user.id}`);

    // Sync contact to Brevo (server-side, no need for client call)
    try {
      const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
      const BREVO_LIST_ID = 15;

      if (BREVO_API_KEY) {
        const brevoPayload: {
          email: string;
          attributes: {
            contato: string;
            nascimento: string;
            CPF: string;
            CRM?: string;
            sms?: string;
          };
          listIds: number[];
          updateEnabled: boolean;
        } = {
          email: data.email,
          attributes: {
            contato: data.full_name,
            nascimento: data.birth_date,
            CPF: data.cpf,
            ...(data.crm_crv && { CRM: data.crm_crv }),
          },
          listIds: [BREVO_LIST_ID],
          updateEnabled: true,
        };

        if (data.phone && data.phone.trim() !== '') {
          const cleanPhone = data.phone.replace(/\D/g, '');
          if (cleanPhone.length >= 10) {
            brevoPayload.attributes.sms = `+55${cleanPhone}`;
          }
        }

        const brevoResponse = await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify(brevoPayload),
        });

        if (!brevoResponse.ok) {
          const errorData = await brevoResponse.text();
          if (!errorData.includes("already exist")) {
            console.error(`[${requestId}] Brevo sync failed: ${brevoResponse.status}`);
          }
        } else {
          console.log(`[${requestId}] Contact synced to Brevo`);
        }
      }
    } catch (brevoError) {
      console.error(`[${requestId}] Brevo sync error (non-blocking)`);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        user: authData.user,
        request_id: requestId
      }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    console.error(`[${requestId}] Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return new Response(
      JSON.stringify({ 
        error: "Erro inesperado. Por favor, tente novamente mais tarde.",
        request_id: requestId
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});
