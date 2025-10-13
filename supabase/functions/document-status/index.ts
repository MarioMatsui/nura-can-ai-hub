import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const docId = url.searchParams.get("doc_id");

    if (!docId) {
      return new Response(
        JSON.stringify({ error: "doc_id parameter required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get document status
    const { data: document, error: docError } = await supabaseClient
      .from("knowledge_documents")
      .select("id, status, progress, error_message")
      .eq("id", docId)
      .single();

    if (docError || !document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get jobs for this document
    const { data: jobs } = await supabaseClient
      .from("processing_jobs")
      .select("job_type, status, progress, error_message")
      .eq("document_id", docId)
      .order("created_at", { ascending: true });

    return new Response(
      JSON.stringify({
        status: document.status,
        progress: document.progress,
        error: document.error_message,
        jobs: jobs || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in document-status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
