import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: "scheduled" | "completed" | "reverted";
  to: string;
  name: string;
  plan_name: string;
  effective_date?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, to, name, plan_name, effective_date }: EmailRequest = await req.json();

    let subject = "";
    let html = "";

    if (type === "scheduled") {
      subject = "Solicitação de cancelamento recebida - NuraCan AI";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Solicitação de cancelamento recebida</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Recebemos sua solicitação de cancelamento do plano <strong>${plan_name}</strong>.</p>
          <p>Seu acesso permanece <strong>ativo até ${effective_date}</strong>.</p>
          <p>Nossa equipe processará o cancelamento e você receberá outro e-mail quando for concluído.</p>
          <p>Se deseja manter sua assinatura, você pode reverter esta solicitação a qualquer momento antes da data de término através das configurações da sua conta.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            Atenciosamente,<br>
            Equipe NuraCan AI
          </p>
        </div>
      `;
    } else if (type === "completed") {
      subject = "Cancelamento concluído - NuraCan AI";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Cancelamento concluído</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Sua assinatura <strong>${plan_name}</strong> foi cancelada com sucesso.</p>
          <p>A partir de agora sua conta está no plano genérico.</p>
          <p>Esperamos vê-lo novamente em breve! Se tiver alguma dúvida, entre em contato conosco.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            Atenciosamente,<br>
            Equipe NuraCan AI
          </p>
        </div>
      `;
    } else if (type === "reverted") {
      subject = "Cancelamento revertido - NuraCan AI";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Cancelamento revertido</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Sua solicitação de cancelamento do plano <strong>${plan_name}</strong> foi revertida com sucesso.</p>
          <p>Sua assinatura continua ativa e você manterá todos os benefícios do seu plano.</p>
          <p>Obrigado por continuar conosco!</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            Atenciosamente,<br>
            Equipe NuraCan AI
          </p>
        </div>
      `;
    }

    // Send email using Brevo API
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": Deno.env.get("BREVO_API_KEY") || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "NuraCan AI", email: "noreply@nuracan.ai" },
        to: [{ email: to, name }],
        subject,
        htmlContent: html,
      }),
    });

    if (!brevoResponse.ok) {
      const error = await brevoResponse.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});