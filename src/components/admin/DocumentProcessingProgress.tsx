import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DocumentProcessingProgressProps {
  documentId: string;
  onComplete?: () => void;
}

interface ProcessingStatus {
  status: string;
  progress: number;
  error?: string;
  jobs?: Array<{
    job_type: string;
    status: string;
    progress: number;
  }>;
}

const STAGES = [
  { key: "extraction", label: "Extração de Texto", order: 1 },
  { key: "chunking", label: "Chunking", order: 2 },
  { key: "embedding", label: "Vetorização", order: 3 },
  { key: "indexing", label: "Indexação", order: 4 },
];

export function DocumentProcessingProgress({ documentId, onComplete }: DocumentProcessingProgressProps) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!polling) return;

    const checkStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("document-status", {
          body: { doc_id: documentId }
        });

        if (error) throw error;

        setStatus(data);

        // Stop polling if ready or error
        if (data.status === "ready" || data.status === "error") {
          setPolling(false);
          if (data.status === "ready" && onComplete) {
            onComplete();
          }
        }
      } catch (error) {
        console.error("Error checking status:", error);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 3 seconds
    const interval = setInterval(checkStatus, 3000);

    return () => clearInterval(interval);
  }, [documentId, polling, onComplete]);

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando status...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {status.status === "ready" && "Documento indexado e pesquisável"}
            {status.status === "processing" && "Processando documento..."}
            {status.status === "queued" && "Na fila para processamento..."}
            {status.status === "error" && "Erro no processamento"}
          </span>
          <span className="text-muted-foreground">{status.progress}%</span>
        </div>
        <Progress value={status.progress} className="h-2" />
      </div>

      {/* Stage Progress */}
      <div className="space-y-2">
        {STAGES.map((stage) => {
          const stageProgress = Math.min(100, Math.max(0, (status.progress - (stage.order - 1) * 25) * 4));
          const isComplete = stageProgress >= 100;
          const isActive = stageProgress > 0 && stageProgress < 100;

          return (
            <div key={stage.key} className="flex items-center gap-2 text-sm">
              {isComplete ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-muted" />
              )}
              <span className={isComplete ? "text-foreground" : "text-muted-foreground"}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error Message */}
      {status.error && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4 mt-0.5" />
          <span>{status.error}</span>
        </div>
      )}
    </div>
  );
}
