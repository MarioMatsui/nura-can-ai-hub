import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Trash2, Search } from "lucide-react";

type KnowledgeType = "medical" | "legal" | "veterinary";

interface Document {
  id: string;
  title: string;
  file_name: string;
  content?: string;
  knowledge_type: KnowledgeType;
  created_at: string;
}

const KnowledgeManagement = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("medical");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load documents whenever knowledgeType changes
  useEffect(() => {
    loadDocuments(knowledgeType);
  }, [knowledgeType]);

  // Auto-fill title when file is selected
  useEffect(() => {
    if (fileName) {
      const titleFromFile = fileName.replace(/\.(txt|md)$/i, '');
      setTitle(titleFromFile);
    }
  }, [fileName]);

  const loadDocuments = async (filterType: KnowledgeType) => {
    setIsLoading(true);
    setSearchQuery(""); // Reset search when changing type
    try {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, file_name, content, knowledge_type, created_at")
        .eq("knowledge_type", filterType)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter documents based on search query (title, file_name, and content)
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    
    const query = searchQuery.toLowerCase().trim();
    return documents.filter((doc) => {
      const titleMatch = doc.title.toLowerCase().includes(query);
      const fileNameMatch = doc.file_name.toLowerCase().includes(query);
      const contentMatch = doc.content?.toLowerCase().includes(query) || false;
      return titleMatch || fileNameMatch || contentMatch;
    });
  }, [documents, searchQuery]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      toast.error("Por favor, envie apenas arquivos TXT ou MD.");
      e.target.value = '';
      return;
    }

    setFileName(file.name);
    setSelectedFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setContent(event.target?.result as string);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If no title, use filename without extension
    let finalTitle = title.trim();
    if (!finalTitle && fileName) {
      finalTitle = fileName.replace(/\.(txt|md)$/i, '');
    }
    
    if (!finalTitle) {
      toast.error("Preencha o título do documento ou selecione um arquivo");
      return;
    }

    if (!selectedFile && (!content || content.trim().length < 50)) {
      toast.error("Adicione um arquivo ou digite pelo menos 50 caracteres");
      return;
    }

    setIsUploading(true);
    try {
      const extractedText = content;

      if (!extractedText || extractedText.trim().length < 50) {
        throw new Error("O conteúdo deve ter pelo menos 50 caracteres");
      }

      const { data: document, error: insertError } = await supabase
        .from("knowledge_documents")
        .insert({
          title: finalTitle,
          file_name: fileName || "manual-entry.txt",
          content: extractedText.trim(),
          knowledge_type: knowledgeType,
          file_path: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success("Documento salvo! Processando embeddings...");

      const { error: processError } = await supabase.functions.invoke("process-document", {
        body: { documentId: document.id },
      });

      if (processError) {
        console.error("Error processing document:", processError);
        toast.error("Documento salvo, mas houve erro ao processar embeddings.");
      } else {
        toast.success("Documento processado com sucesso!");
      }

      setTitle("");
      setContent("");
      setFileName("");
      setSelectedFile(null);
      loadDocuments(knowledgeType);
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este documento?")) return;

    try {
      const { error } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Documento excluído com sucesso");
      loadDocuments(knowledgeType);
    } catch (error: any) {
      toast.error("Erro ao excluir documento: " + error.message);
    }
  };

  const getKnowledgeTypeLabel = (type: KnowledgeType) => {
    const labels = {
      medical: "Médico",
      legal: "Jurídico",
      veterinary: "Veterinário",
    };
    return labels[type];
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Adicionar Documento</CardTitle>
          <CardDescription>
            Faça upload de documentos para a base de conhecimento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="knowledge-type">Tipo de Base</Label>
              <Select
                value={knowledgeType}
                onValueChange={(value) => setKnowledgeType(value as KnowledgeType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medical">Médico</SelectItem>
                  <SelectItem value="legal">Jurídico</SelectItem>
                  <SelectItem value="veterinary">Veterinário</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title">Título do Documento</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Estudo sobre CBD"
              />
            </div>

            <div>
              <Label htmlFor="file">Arquivo</Label>
              <Input
                id="file"
                type="file"
                accept=".txt,.md"
                onChange={handleFileUpload}
              />
              {fileName && (
                <p className="text-sm text-muted-foreground mt-1">
                  Arquivo: {fileName}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="content">Conteúdo do Documento</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Cole ou digite o conteúdo..."
                rows={10}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Enviar Documento
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos Cadastrados - {getKnowledgeTypeLabel(knowledgeType)}</CardTitle>
          <CardDescription>
            {filteredDocuments.length} documento(s) {searchQuery && `encontrado(s) de ${documents.length}`} na base {getKnowledgeTypeLabel(knowledgeType).toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por título, arquivo ou conteúdo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-center text-muted-foreground p-8">
              Nenhum documento cadastrado
            </p>
          ) : filteredDocuments.length === 0 ? (
            <p className="text-center text-muted-foreground p-8">
              Nenhum documento encontrado para "{searchQuery}"
            </p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <FileText className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{doc.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {getKnowledgeTypeLabel(doc.knowledge_type)} • {doc.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc.id)}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeManagement;
