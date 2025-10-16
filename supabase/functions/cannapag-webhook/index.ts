import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, http_cp_access_token, x-webhook-token',
};

// Mapa de planos conforme documentação
const PLAN_MAP: Record<string, { type: string; billing: string }> = {
  PLAN_MEDICO_MENSAL:       { type: "medico",       billing: "mensal" },
  PLAN_JURIDICO_MENSAL:     { type: "juridico",     billing: "mensal" },
  PLAN_VETERINARIO_MENSAL:  { type: "veterinario",  billing: "mensal" },
  PLAN_ESPECIALISTA_MENSAL: { type: "especialista", billing: "mensal" },
  PLAN_MEDICO_ANUAL:        { type: "medico",       billing: "anual"  },
  PLAN_JURIDICO_ANUAL:      { type: "juridico",     billing: "anual"  },
  PLAN_VETERINARIO_ANUAL:   { type: "veterinario",  billing: "anual"  },
  PLAN_ESPECIALISTA_ANUAL:  { type: "especialista", billing: "anual"  },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[cannapag][${requestId}] Webhook received`);

  try {
    const WEBHOOK_TOKEN = Deno.env.get('CANNAPAG_WEBHOOK_TOKEN');
    const ALLOW_DEBUG = Deno.env.get('ALLOW_WEBHOOK_DEBUG') === 'true';
    
    if (!WEBHOOK_TOKEN) {
      console.error(`[cannapag][${requestId}] CANNAPAG_WEBHOOK_TOKEN not configured`);
      return new Response(JSON.stringify({ error: 'Webhook token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const data = body.data || {};

    // Validar token de todos os formatos possíveis (case-insensitive)
    const receivedToken = 
      req.headers.get('HTTP_CP_ACCESS_TOKEN') ||
      req.headers.get('http_cp_access_token') ||
      req.headers.get('x-webhook-token') ||
      req.headers.get('X-Webhook-Token') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    
    const validToken = receivedToken === WEBHOOK_TOKEN;
    
    // Debug mode: logar headers quando token falhar
    if (!validToken && ALLOW_DEBUG) {
      try {
        const sampleHeaders: Record<string, string> = {};
        let i = 0;
        for (const [key, value] of req.headers.entries()) {
          if (i++ > 20) break;
          // Não logar tokens/senhas
          if (/authorization|token|password|secret/i.test(key)) {
            sampleHeaders[key] = '[REDACTED]';
          } else {
            sampleHeaders[key] = value;
          }
        }
        console.warn(`[cannapag][${requestId}] DEBUG token_invalid received_token=${receivedToken?.substring(0, 8)}... headers=`, JSON.stringify(sampleHeaders));
      } catch (err) {
        console.error(`[cannapag][${requestId}] DEBUG error logging headers:`, err);
      }
    }
    
    // Produção: bloquear tokens inválidos (exceto no modo debug)
    if (!validToken && !ALLOW_DEBUG) {
      console.warn(`[cannapag][${requestId}] token=fail - Invalid token received (returning 401)`);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Debug mode: aceitar mas logar warning
    if (!validToken && ALLOW_DEBUG) {
      console.warn(`[cannapag][${requestId}] token=fail - ALLOW_DEBUG=true, accepting webhook anyway`);
    }

    // Extrair campos do payload com fallbacks
    const event = body.event || "";
    const status = (data.status || body.status || "").toLowerCase();
    const rawRef = data.reference || body.reference || data.external_reference || body.external_reference || "";
    const chargeId = data.charge_id || body.charge_id || data.id || body.id || "";
    const payerEmail = (data.payer?.email || body.payer?.email || "").trim().toLowerCase();
    
    // Extrair referência usando regex
    const match = rawRef.match(/PLAN_[A-Z_]+$/);
    const reference = match ? match[0] : null;

    console.log(`[cannapag][${requestId}] token=ok charge=${chargeId} email=${payerEmail} ref=${reference} status=${status} rawRef=${rawRef}`);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gravar evento no webhook_events (idempotência)
    let eventRecord;
    try {
      const { data: existing } = await supabase
        .from('webhook_events')
        .select('id, processed')
        .eq('charge_id', chargeId)
        .single();

      if (existing) {
        console.log(`[cannapag][${requestId}] idemp=skip - Webhook already processed`);
        return new Response(JSON.stringify({ 
          message: 'Webhook already processed',
          request_id: requestId 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: newEvent, error: insertError } = await supabase
        .from('webhook_events')
        .insert({
          event_id: body.event_id || null,
          event_type: event,
          charge_id: chargeId,
          status: status,
          reference: reference,
          external_reference: rawRef,
          payer_email: payerEmail,
          valid_token: true,
          provider: 'cannapag',
          payload: body,
          processed: false,
          request_id: requestId,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      eventRecord = newEvent;
      console.log(`[cannapag][${requestId}] idemp=apply - New webhook event recorded`);
    } catch (error) {
      console.error(`[cannapag][${requestId}] Error recording webhook event:`, error);
      // Ainda retorna 200 para não quebrar reenvios
      return new Response(JSON.stringify({ 
        message: 'Error processing webhook',
        request_id: requestId 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Retorna 200 imediatamente e processa async
    const processingPromise = processWebhookAsync(
      supabase,
      requestId,
      eventRecord.id,
      status,
      reference,
      payerEmail,
      chargeId,
      body
    );

    // Não espera o processamento - processa em background
    processingPromise.catch(err => 
      console.error(`[cannapag][${requestId}] Background processing error:`, err)
    );

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Webhook received and processing',
      request_id: requestId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[cannapag][${requestId}] Error:`, error);
    return new Response(JSON.stringify({ 
      error: 'Erro ao processar webhook',
      request_id: requestId
    }), {
      status: 200, // Ainda retorna 200 para não quebrar reenvios
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processWebhookAsync(
  supabase: any,
  requestId: string,
  eventId: string,
  status: string,
  reference: string | null,
  payerEmail: string,
  chargeId: string,
  payload: any
) {
  try {
    console.log(`[cannapag][${requestId}] Starting async processing`);

    // Só processa se status for confirmado e reference válido
    const confirmedStatuses = ['pago', 'aprovado', 'paid', 'approved'];
    if (!confirmedStatuses.includes(status)) {
      console.log(`[cannapag][${requestId}] Status ${status} não é confirmado - ignorando`);
      await supabase
        .from('webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', eventId);
      return;
    }

    if (!reference || !PLAN_MAP[reference]) {
      console.error(`[cannapag][${requestId}] Referência inválida: ${reference}`);
      await supabase
        .from('webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', eventId);
      return;
    }

    // Buscar usuário por email
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error(`[cannapag][${requestId}] Error listing users:`, authError);
      throw authError;
    }

    const user = authUsers.users.find((u: any) => 
      u.email?.toLowerCase() === payerEmail
    );

    if (!user) {
      console.warn(`[cannapag][${requestId}] Usuário não encontrado para email: ${payerEmail}`);
      
      // Registrar pagamento como review_needed
      await supabase
        .from('payments')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000', // UUID nulo para indicar sem usuário
          provider: 'cannapag',
          charge_id: chargeId,
          reference: reference,
          plan_type: PLAN_MAP[reference].type,
          billing_cycle: PLAN_MAP[reference].billing,
          amount: payload.data?.amount || 0,
          status: 'review_needed',
          payer_email: payerEmail,
          payload_raw: payload,
          request_id: requestId,
        });

      await supabase
        .from('webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', eventId);
      return;
    }

    console.log(`[cannapag][${requestId}] Usuário encontrado: ${user.id}`);

    // Registrar/atualizar pagamento
    const { error: paymentError } = await supabase
      .from('payments')
      .upsert({
        user_id: user.id,
        provider: 'cannapag',
        charge_id: chargeId,
        reference: reference,
        plan_type: PLAN_MAP[reference].type,
        billing_cycle: PLAN_MAP[reference].billing,
        amount: payload.data?.amount || 0,
        status: 'paid',
        payer_email: payerEmail,
        payload_raw: payload,
        request_id: requestId,
      }, {
        onConflict: 'charge_id',
      });

    if (paymentError) {
      console.error(`[cannapag][${requestId}] Error upserting payment:`, paymentError);
    } else {
      console.log(`[cannapag][${requestId}] Payment recorded`);
    }

    // Ativar plano
    const planInfo = PLAN_MAP[reference];
    const planType = planInfo.type;
    const billingCycle = planInfo.billing;

    console.log(`[cannapag][${requestId}] Activating plan: ${planType} (${billingCycle})`);

    if (planType === 'especialista') {
      // Desativar planos individuais
      const { error: deactivateError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'inactive' })
        .eq('user_id', user.id)
        .in('plan_type', ['medico', 'juridico', 'veterinario']);

      if (deactivateError) {
        console.error(`[cannapag][${requestId}] Error deactivating individual plans:`, deactivateError);
      } else {
        console.log(`[cannapag][${requestId}] Individual plans deactivated`);
      }

      // Ativar/atualizar plano especialista
      const { data: existingSub } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_type', 'especialista')
        .single();

      if (existingSub) {
        await supabase
          .from('user_subscriptions')
          .update({
            status: 'active',
            billing_period: billingCycle,
            started_at: new Date().toISOString(),
            expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id);
        console.log(`[cannapag][${requestId}] Specialist plan updated`);
      } else {
        await supabase
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            plan_type: 'especialista',
            status: 'active',
            billing_period: billingCycle,
            started_at: new Date().toISOString(),
            expires_at: null,
          });
        console.log(`[cannapag][${requestId}] Specialist plan created`);
      }
    } else {
      // Plano individual
      // Verificar se já tem plano especialista
      const { data: specialistSub } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_type', 'especialista')
        .eq('status', 'active')
        .single();

      if (specialistSub) {
        console.warn(`[cannapag][${requestId}] User has active specialist plan - skipping individual plan activation`);
        await supabase
          .from('webhook_events')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('id', eventId);
        return;
      }

      // Verificar limite de 3 planos ativos
      const { data: activePlans, error: countError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .neq('plan_type', planType); // Não contar o próprio plano

      if (countError) {
        console.error(`[cannapag][${requestId}] Error counting active plans:`, countError);
      } else if (activePlans && activePlans.length >= 3) {
        console.warn(`[cannapag][${requestId}] User has 3 active plans - marking payment as review_needed`);
        
        await supabase
          .from('payments')
          .update({ status: 'review_needed' })
          .eq('charge_id', chargeId);

        await supabase
          .from('admin_notifications')
          .insert({
            type: 'subscription_limit_exceeded',
            payload: {
              user_id: user.id,
              payer_email: payerEmail,
              plan_type: planType,
              charge_id: chargeId,
              reference: reference,
            },
            status: 'unread',
          });

        await supabase
          .from('webhook_events')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('id', eventId);
        return;
      }

      // Ativar/atualizar plano individual
      const { data: existingSub } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_type', planType)
        .single();

      if (existingSub) {
        await supabase
          .from('user_subscriptions')
          .update({
            status: 'active',
            billing_period: billingCycle,
            started_at: new Date().toISOString(),
            expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id);
        console.log(`[cannapag][${requestId}] Individual plan ${planType} updated`);
      } else {
        await supabase
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            plan_type: planType,
            status: 'active',
            billing_period: billingCycle,
            started_at: new Date().toISOString(),
            expires_at: null,
          });
        console.log(`[cannapag][${requestId}] Individual plan ${planType} created`);
      }
    }

    // Marcar webhook como processado
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', eventId);

    console.log(`[cannapag][${requestId}] Processing completed successfully`);

  } catch (error) {
    console.error(`[cannapag][${requestId}] Error in async processing:`, error);
    // Não marcar como processado em caso de erro para tentar novamente
  }
}
