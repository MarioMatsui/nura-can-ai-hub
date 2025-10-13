import React from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProcessingStage {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message?: string;
}

interface DocumentProcessingStatusProps {
  stages: ProcessingStage[];
}

export const DocumentProcessingStatus: React.FC<DocumentProcessingStatusProps> = ({ stages }) => {
  return (
    <div className="space-y-3 py-4">
      {stages.map((stage) => (
        <div key={stage.id} className="flex items-start gap-3">
          <div className="mt-0.5">
            {stage.status === 'processing' && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {stage.status === 'completed' && (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {stage.status === 'error' && (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            {stage.status === 'pending' && (
              <div className="h-5 w-5 rounded-full border-2 border-muted" />
            )}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-medium ${
              stage.status === 'processing' ? 'text-foreground' : 
              stage.status === 'completed' ? 'text-muted-foreground' : 
              stage.status === 'error' ? 'text-destructive' :
              'text-muted-foreground'
            }`}>
              {stage.label}
            </p>
            {stage.message && (
              <p className="text-xs text-muted-foreground mt-1">{stage.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
