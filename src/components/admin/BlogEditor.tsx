import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Image as ImageIcon,
  Link as LinkIcon,
  ArrowLeft,
  Save,
  Send,
  Upload,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

const BlogEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingContent, setUploadingContent] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const contentImageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-lg",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Placeholder.configure({
        placeholder: "Comece a escrever seu artigo...",
      }),
    ],
    content: "",
    onUpdate: () => {
      setHasChanges(true);
    },
    editorProps: {
      attributes: {
        class: "prose prose-lg dark:prose-invert max-w-none min-h-[300px] focus:outline-none p-4",
      },
    },
  });

  useEffect(() => {
    if (isEditing && id) {
      const fetchPost = async () => {
        const { data, error } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("id", id)
          .single();

        if (error || !data) {
          toast.error("Post não encontrado");
          navigate("/admin/blog");
          return;
        }

        setTitle(data.title);
        setSlug(data.slug);
        setExcerpt(data.excerpt || "");
        setCoverImageUrl(data.cover_image_url || "");
        setStatus(data.status as "draft" | "published");
        editor?.commands.setContent(data.content || "");
        setLoading(false);
      };

      fetchPost();
    }
  }, [id, isEditing, navigate, editor]);

  useEffect(() => {
    if (!isEditing && title && !slug) {
      setSlug(generateSlug(title));
    }
  }, [title, isEditing, slug]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setHasChanges(true);
    if (!isEditing) {
      setSlug(generateSlug(value));
    }
  };

  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(fileName, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast.error("Erro ao fazer upload da imagem");
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from("blog-images")
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploadingCover(true);
    const url = await uploadImage(file, "covers");
    setUploadingCover(false);

    if (url) {
      setCoverImageUrl(url);
      setHasChanges(true);
      toast.success("Imagem de capa enviada com sucesso!");
    }

    // Reset input
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  };

  const handleContentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploadingContent(true);
    const url = await uploadImage(file, "content");
    setUploadingContent(false);

    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
      toast.success("Imagem inserida com sucesso!");
    }

    // Reset input
    if (contentImageInputRef.current) {
      contentImageInputRef.current.value = "";
    }
  };

  const removeCoverImage = () => {
    setCoverImageUrl("");
    setHasChanges(true);
  };

  const savePost = async (publishStatus: "draft" | "published") => {
    if (!title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }

    if (!slug.trim()) {
      toast.error("O slug é obrigatório");
      return;
    }

    setSaving(true);
    const content = editor?.getHTML() || "";

    const postData = {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      content,
      cover_image_url: coverImageUrl.trim() || null,
      status: publishStatus,
      published_at: publishStatus === "published" ? new Date().toISOString() : null,
    };

    let error;

    if (isEditing) {
      const result = await supabase
        .from("blog_posts")
        .update(postData)
        .eq("id", id);
      error = result.error;
    } else {
      const result = await supabase.from("blog_posts").insert(postData);
      error = result.error;
    }

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("Já existe um post com este slug");
      } else {
        toast.error("Erro ao salvar post");
      }
      return;
    }

    setHasChanges(false);
    toast.success(
      publishStatus === "published"
        ? "Post publicado com sucesso!"
        : "Rascunho salvo com sucesso!"
    );
    navigate("/admin/blog");
  };

  const handleBack = useCallback(() => {
    if (hasChanges) {
      setPendingNavigation("/admin/blog");
      setShowExitDialog(true);
    } else {
      navigate("/admin/blog");
    }
  }, [hasChanges, navigate]);

  const handleExitWithSave = async () => {
    await savePost("draft");
  };

  const handleExitWithoutSave = () => {
    setShowExitDialog(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
  };

  const addLink = useCallback(() => {
    const url = window.prompt("URL do link:");
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file inputs */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverImageUpload}
      />
      <input
        ref={contentImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleContentImageUpload}
      />

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => savePost("draft")}
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar Rascunho
          </Button>
          <Button onClick={() => savePost("published")} disabled={saving}>
            <Send className="mr-2 h-4 w-4" />
            {status === "published" ? "Atualizar" : "Publicar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{isEditing ? "Editar Post" : "Novo Post"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Digite o título do post"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="url-do-post"
                />
              </div>

              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <div className="border rounded-lg overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor?.chain().focus().toggleBold().run()}
                      className={cn(editor?.isActive("bold") && "bg-accent")}
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor?.chain().focus().toggleItalic().run()}
                      className={cn(editor?.isActive("italic") && "bg-accent")}
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor?.chain().focus().toggleUnderline().run()}
                      className={cn(editor?.isActive("underline") && "bg-accent")}
                    >
                      <UnderlineIcon className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor?.chain().focus().toggleBulletList().run()}
                      className={cn(editor?.isActive("bulletList") && "bg-accent")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                      className={cn(editor?.isActive("orderedList") && "bg-accent")}
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addLink}
                      className={cn(editor?.isActive("link") && "bg-accent")}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => contentImageInputRef.current?.click()}
                      disabled={uploadingContent}
                    >
                      {uploadingContent ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {/* Editor */}
                  <EditorContent editor={editor} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Imagem de Capa</Label>
                {coverImageUrl ? (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <img
                      src={coverImageUrl}
                      alt="Preview da capa"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={removeCoverImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                  >
                    {uploadingCover ? (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="text-sm">Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8" />
                        <span className="text-sm">Clique para enviar imagem</span>
                        <span className="text-xs text-muted-foreground">PNG, JPG até 5MB</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt">Resumo/Excerpt</Label>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={(e) => {
                    setExcerpt(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="Um breve resumo do post..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você não salvou este post</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja salvar como rascunho antes de sair?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleExitWithoutSave}>
              Não, descartar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExitWithSave}>
              Sim, salvar rascunho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BlogEditor;
