import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const BREVO_LIST_ID = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BrevoContactRequest {
  email: string;
  fullName: string;
  phone?: string;
  birthDate: string;
  cpf: string;
  crmCrv?: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestId = crypto.randomUUID();
    const { email, fullName, phone, birthDate, cpf, crmCrv }: BrevoContactRequest = await req.json();

    // Validate email server-side
    if (!validateEmail(email)) {
      return new Response(
        JSON.stringify({ 
          error: "E-mail inválido",
          request_id: requestId
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] Processing contact sync request`);

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
      email,
      attributes: {
        contato: fullName,
        nascimento: birthDate,
        CPF: cpf,
        ...(crmCrv && { CRM: crmCrv }),
      },
      listIds: [BREVO_LIST_ID],
      updateEnabled: true, // Update contact if already exists
    };

    // Only add phone if it's provided and in a valid format
    if (phone && phone.trim() !== '') {
      // Remove all non-digit characters and add +55 prefix for Brazil
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        brevoPayload.attributes.sms = `+55${cleanPhone}`;
      }
    }

    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": BREVO_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify(brevoPayload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[${requestId}] API sync failed with status: ${response.status}`);
      
      // If contact already exists (HTTP 400), consider it a success
      if (response.status === 400 && errorData.includes("already exist")) {
        console.log(`[${requestId}] Contact already exists, sync skipped`);
        return new Response(
          JSON.stringify({ success: true, message: "Contact already exists" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
      
      throw new Error(`API sync error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[${requestId}] Contact sync completed successfully`);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}] Contact sync operation failed: ${error.message || 'Unknown error'}`);
    return new Response(
      JSON.stringify({ 
        error: "Erro ao sincronizar contato. Por favor, tente novamente.",
        request_id: requestId
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
