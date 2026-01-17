import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DOMPurify from "dompurify";
interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  cover_image_url: string | null;
  published_at: string | null;
}

// Separate component to handle sanitized HTML content
const SanitizedContent = ({ content }: { content: string }) => {
  const sanitizedContent = useMemo(() => {
    // Configure DOMPurify to allow safe HTML tags used by TipTap editor
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 's',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'a', 'img',
        'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr', 'div', 'span'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'target', 'rel',
        'width', 'height', 'style'
      ],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target'],
      // Force links to open in new tab safely
      FORCE_BODY: true,
    });
  }, [content]);

  return (
    <article 
      className="prose prose-lg dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      if (!slug) return;

      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, content, cover_image_url, published_at")
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setPost(data);
      }
      setLoading(false);
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-8" />
          <Skeleton className="h-64 w-full mb-8 rounded-lg" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-4 w-32 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold mb-4">Artigo não encontrado</h1>
          <p className="text-muted-foreground mb-8">
            O artigo que você procura não existe ou foi removido.
          </p>
          <Button onClick={() => navigate("/blog")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Blog
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/blog")}
          className="mb-8"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Blog
        </Button>

        {post.cover_image_url && (
          <div className="aspect-video mb-8 rounded-lg overflow-hidden">
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
          {post.title}
        </h1>

        {post.published_at && (
          <p className="text-muted-foreground mb-8">
            Publicado em {format(new Date(post.published_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        )}

        <SanitizedContent content={post.content} />
      </main>

      <Footer />
    </div>
  );
};

export default BlogPost;
