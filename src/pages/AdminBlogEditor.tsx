import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BlogEditor from "@/components/admin/BlogEditor";
import { Loader2 } from "lucide-react";

const AdminBlogEditor = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth/login");
        return;
      }

      const { data, error } = await supabase.functions.invoke("verify-admin");
      
      if (error || !data?.admin) {
        navigate("/");
        return;
      }

      setLoading(false);
    };

    checkAdmin();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <BlogEditor />
    </div>
  );
};

export default AdminBlogEditor;
