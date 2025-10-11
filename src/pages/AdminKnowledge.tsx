import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { Loader2, Upload, FileText, Trash2 } from "lucide-react";

type KnowledgeType = "medical" | "legal" | "veterinary";

interface Document {
  id: string;
  title: string;
  file_name: string;
  knowledge_type: KnowledgeType;
  created_at: string;
}

const AdminKnowledge = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("medical");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    checkAdmin();
    loadDocuments();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth/login");
      return;
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!userRole) {
      toast.error("Acesso negado. Apenas administradores podem acessar esta página.");
      navigate("/app");
    }
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Accept both PDF and TXT files
    if (!file.name.endsWith('.pdf') && !file.name.endsWith('.txt')) {
      toast.error("Por favor, envie apenas arquivos PDF ou TXT");
      e.target.value = '';
      return;
    }

    setFileName(file.name);
    setSelectedFile(file);
    
    // For text files, read the content immediately
    if (file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setContent(event.target?.result as string);
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      // For PDFs, clear content - will be extracted on server
      setContent("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      toast.error("Preencha o título do documento");
      return;
    }

    if (!selectedFile && (!content || content.trim().length < 50)) {
      toast.error("Adicione um arquivo ou digite pelo menos 50 caracteres");
      return;
    }

    setIsUploading(true);
    try {
      let filePath = null;
      let extractedText = content;

      // Upload file to storage if provided
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        filePath = `${knowledgeType}/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('knowledge-documents')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        // If PDF, extract text using parse-document edge function
        if (selectedFile.name.endsWith('.pdf')) {
          toast.info("Extraindo texto do PDF...");
          
          const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-pdf", {
            body: { filePath },
          });

          if (parseError) {
            console.error("Error parsing PDF:", parseError);
            throw new Error("Erro ao extrair texto do PDF");
          }

          extractedText = parseData.text;
          toast.success("Texto extraído do PDF!");
        }
      }

      if (!extractedText || extractedText.trim().length < 50) {
        throw new Error("Não foi possível extrair texto suficiente do documento");
      }

      // Insert document
      const { data: document, error: insertError } = await supabase
        .from("knowledge_documents")
        .insert({
          title,
          file_name: fileName || "manual-entry.txt",
          content: extractedText.trim(),
          knowledge_type: knowledgeType,
          file_path: filePath,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success("Documento salvo! Processando embeddings...");

      // Process document to create embeddings
      const { error: processError } = await supabase.functions.invoke("process-document", {
        body: { documentId: document.id },
      });

      if (processError) {
        console.error("Error processing document:", processError);
        toast.error("Documento salvo, mas houve erro ao processar embeddings.");
      } else {
        toast.success("Documento processado com sucesso!");
      }

      // Reset form
      setTitle("");
      setContent("");
      setFileName("");
      setSelectedFile(null);
      loadDocuments();
    } catch (error: any) {
      toast.error("Erro ao enviar documento: " + error.message);
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
      loadDocuments();
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
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Base de Conhecimento - Administração</h1>
          <p className="text-muted-foreground">
            Gerencie os documentos que alimentam as IAs especializadas (RAG)
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Upload Form */}
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
                    placeholder="Ex: Estudo sobre CBD em epilepsia"
                  />
                </div>

                <div>
                  <Label htmlFor="file">Arquivo</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".txt,.pdf"
                    onChange={handleFileUpload}
                  />
                  {fileName && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Arquivo: {fileName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Arquivos PDF e TXT aceitos (até 50 páginas para PDF, máx 10MB)
                  </p>
                </div>

                {(!selectedFile || selectedFile.name.endsWith('.txt')) && (
                  <div>
                    <Label htmlFor="content">Conteúdo do Documento</Label>
                    <Textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Cole ou digite o conteúdo do documento aqui..."
                      rows={10}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isUploading}
                >
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

          {/* Documents List */}
          <Card>
            <CardHeader>
              <CardTitle>Documentos Cadastrados</CardTitle>
              <CardDescription>
                {documents.length} documento(s) na base
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-center text-muted-foreground p-8">
                  Nenhum documento cadastrado ainda
                </p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {documents.map((doc) => (
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
      </div>
    </div>
  );
};

export default AdminKnowledge;
