import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileText, Table, Image } from 'lucide-react';

interface Citation {
  type: 'text' | 'table' | 'image';
  content: string;
  page_number?: number;
  page_range?: string;
  similarity: number;
  document_title: string;
  section_title?: string;
  table_data?: any;
}

interface CitationsModalProps {
  open: boolean;
  onClose: () => void;
  citations: Citation[];
}

export const CitationsModal: React.FC<CitationsModalProps> = ({
  open,
  onClose,
  citations
}) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'table':
        return <Table className="h-4 w-4" />;
      case 'image':
        return <Image className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'table':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'image':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default:
        return 'bg-green-500/10 text-green-500 border-green-500/20';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Fontes e Citações ({citations.length})
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh]">
          <div className="space-y-4 pr-4">
            {citations.map((citation, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={`${getTypeColor(citation.type)} flex items-center gap-1`}
                    >
                      {getTypeIcon(citation.type)}
                      {citation.type}
                    </Badge>
                    {citation.page_number && (
                      <Badge variant="secondary">
                        Página {citation.page_number}
                      </Badge>
                    )}
                    {citation.page_range && (
                      <Badge variant="secondary">
                        Páginas {citation.page_range}
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline">
                    {Math.round(citation.similarity * 100)}% relevante
                  </Badge>
                </div>

                {citation.section_title && (
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    📍 {citation.section_title}
                  </p>
                )}

                <div className="bg-muted/50 rounded p-3 border">
                  {citation.type === 'table' && citation.table_data ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            {citation.table_data.headers?.map((header: string, i: number) => (
                              <th key={i} className="text-left p-2 font-medium">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {citation.table_data.rows?.slice(0, 5).map((row: string[], i: number) => (
                            <tr key={i} className="border-b">
                              {row.map((cell, j) => (
                                <td key={j} className="p-2">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {citation.table_data.rows?.length > 5 && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          ... e mais {citation.table_data.rows.length - 5} linhas
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">
                      {citation.content}
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  📄 {citation.document_title}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
