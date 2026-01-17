import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCpf[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf[9])) return false;
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCpf[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf[10])) return false;
  
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const data: SignupData = await req.json();

    // Validate email server-side
    if (!validateEmail(data.email)) {
      return new Response(
        JSON.stringify({ 
          error: "E-mail inválido. Por favor, verifique o endereço informado.",
          request_id: requestId
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate CPF server-side
    if (!validateCpf(data.cpf)) {
      return new Response(
        JSON.stringify({ 
          error: "CPF inválido. Por favor, verifique o número informado.",
          request_id: requestId
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate age (18+)
    const birthDate = new Date(data.birth_date);
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      
      // Return specific errors for user-correctable issues
      if (authError.message.includes("already registered")) {
        return new Response(
          JSON.stringify({ 
            error: "Este e-mail já está cadastrado.",
            request_id: requestId
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Erro ao criar conta. Por favor, tente novamente.",
          request_id: requestId
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

        // Only add phone if provided and valid
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
          // Contact already exists is fine
          if (!errorData.includes("already exist")) {
            console.error(`[${requestId}] Brevo sync failed: ${brevoResponse.status}`);
          }
        } else {
          console.log(`[${requestId}] Contact synced to Brevo`);
        }
      }
    } catch (brevoError) {
      // Don't block signup if Brevo fails
      console.error(`[${requestId}] Brevo sync error (non-blocking)`);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        user: authData.user,
        request_id: requestId
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[${requestId}] Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return new Response(
      JSON.stringify({ 
        error: "Erro inesperado. Por favor, tente novamente mais tarde.",
        request_id: requestId
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
