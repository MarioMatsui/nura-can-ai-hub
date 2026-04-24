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

interface CompleteProfileData {
  cpf: string;
  birth_date: string;
  phone?: string;
  accept_terms: boolean;
}

function validateCpf(cpf: string): boolean {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleanCpf[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleanCpf[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf[10])) return false;

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };
  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", request_id: requestId }),
        { status: 401, headers: responseHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", request_id: requestId }),
        { status: 401, headers: responseHeaders }
      );
    }

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(supabaseUrl, serviceKey);

    const data: CompleteProfileData = await req.json();

    if (!data.accept_terms) {
      return new Response(
        JSON.stringify({ error: "Você deve aceitar os Termos de Serviço e Política de Privacidade.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (typeof data.cpf !== "string" || !validateCpf(data.cpf)) {
      return new Response(
        JSON.stringify({ error: "CPF inválido. Por favor, verifique o número informado.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (typeof data.birth_date !== "string") {
      return new Response(
        JSON.stringify({ error: "Data de nascimento inválida.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

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
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) {
      return new Response(
        JSON.stringify({ error: "Você deve ter pelo menos 18 anos.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (data.phone && (typeof data.phone !== "string" || data.phone.length > 30)) {
      return new Response(
        JSON.stringify({ error: "Telefone inválido.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Check CPF uniqueness (excluding current user)
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("cpf", data.cpf)
      .neq("id", userId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Este CPF já está cadastrado.", request_id: requestId }),
        { status: 400, headers: responseHeaders }
      );
    }

    const updatePayload: Record<string, unknown> = {
      cpf: data.cpf,
      birth_date: data.birth_date,
      profile_completed: true,
      terms_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (data.phone && data.phone.trim() !== "") {
      updatePayload.phone = data.phone.trim();
    }

    const { data: updatedProfile, error: updErr } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)
      .select()
      .single();

    if (updErr) {
      console.error(`[${requestId}] Update error:`, updErr.message);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar dados. Tente novamente.", request_id: requestId }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Sync to Brevo (non-blocking)
    try {
      const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
      const BREVO_LIST_ID = 15;
      if (BREVO_API_KEY && updatedProfile?.email) {
        const brevoPayload: any = {
          email: updatedProfile.email,
          attributes: {
            contato: updatedProfile.full_name,
            nascimento: data.birth_date,
            CPF: data.cpf,
          },
          listIds: [BREVO_LIST_ID],
          updateEnabled: true,
        };
        if (data.phone && data.phone.trim() !== "") {
          const cleanPhone = data.phone.replace(/\D/g, "");
          if (cleanPhone.length >= 10) brevoPayload.attributes.sms = `+55${cleanPhone}`;
        }
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify(brevoPayload),
        });
      }
    } catch (e) {
      console.error(`[${requestId}] Brevo sync error (non-blocking)`);
    }

    return new Response(
      JSON.stringify({ success: true, request_id: requestId }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error instanceof Error ? error.message : "Unknown");
    return new Response(
      JSON.stringify({ error: "Erro inesperado. Tente novamente.", request_id: requestId }),
      { status: 500, headers: responseHeaders }
    );
  }
});
