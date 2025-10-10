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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName, phone, birthDate, cpf, crmCrv }: BrevoContactRequest = await req.json();

    console.log("Adding contact to Brevo:", email);

    const brevoPayload = {
      email,
      attributes: {
        contato: fullName,
        ...(phone && { sms: phone }),
        nascimento: birthDate,
        CPF: cpf,
        ...(crmCrv && { CRM: crmCrv }),
      },
      listIds: [BREVO_LIST_ID],
      updateEnabled: true, // Update contact if already exists
    };

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
      console.error("Brevo API error:", errorData);
      
      // If contact already exists (HTTP 400), consider it a success
      if (response.status === 400 && errorData.includes("already exist")) {
        console.log("Contact already exists in Brevo, continuing...");
        return new Response(
          JSON.stringify({ success: true, message: "Contact already exists" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
      
      throw new Error(`Brevo API error: ${errorData}`);
    }

    const data = await response.json();
    console.log("Contact added to Brevo successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in add-brevo-contact function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
