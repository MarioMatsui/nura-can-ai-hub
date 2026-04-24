import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

const schema = z
  .object({
    cpf: z
      .string()
      .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/, "CPF inválido (use formato 000.000.000-00 ou 00000000000)")
      .refine((cpf) => {
        const c = cpf.replace(/\D/g, "");
        if (c.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(c)) return false;
        let sum = 0;
        for (let i = 1; i <= 9; i++) sum += parseInt(c.substring(i - 1, i)) * (11 - i);
        let r = (sum * 10) % 11;
        if (r === 10 || r === 11) r = 0;
        if (r !== parseInt(c.substring(9, 10))) return false;
        sum = 0;
        for (let i = 1; i <= 10; i++) sum += parseInt(c.substring(i - 1, i)) * (12 - i);
        r = (sum * 10) % 11;
        if (r === 10 || r === 11) r = 0;
        if (r !== parseInt(c.substring(10, 11))) return false;
        return true;
      }, "CPF inválido - verifique os dígitos"),
    birthDate: z.string().refine((val) => {
      const date = new Date(val);
      if (isNaN(date.getTime())) return false;
      const today = new Date();
      let age = today.getFullYear() - date.getFullYear();
      const m = today.getMonth() - date.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
      return age >= 18 && age <= 120;
    }, "Você deve ter pelo menos 18 anos"),
    phone: z
      .string()
      .optional()
      .refine((val) => !val || /^\+?[\d\s()-]+$/.test(val), { message: "Formato de telefone inválido" }),
    password: z
      .string()
      .min(1, "Senha obrigatória")
      .regex(/[A-Z]/, "A senha deve conter pelo menos 1 letra maiúscula")
      .regex(/[0-9]/, "A senha deve conter pelo menos 1 número"),
    acceptTerms: z.boolean().refine((v) => v === true, {
      message: "Você deve aceitar os termos",
    }),
  });

type FormData = z.infer<typeof schema>;

const CompletarCadastro = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [firstName, setFirstName] = useState<string>("");
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth/login", { replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, profile_completed")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.profile_completed) {
        navigate("/app", { replace: true });
        return;
      }

      const fullName =
        (profile?.full_name as string | undefined) ||
        (session.user.user_metadata?.full_name as string | undefined) ||
        (session.user.user_metadata?.name as string | undefined) ||
        session.user.email?.split("@")[0] ||
        "";
      setFirstName(fullName.split(" ")[0] || "");
      setChecking(false);
    };
    init();
  }, [navigate]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { cpf: "", birthDate: "", phone: "", password: "", acceptTerms: false },
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("complete-profile", {
        body: {
          cpf: data.cpf,
          birth_date: data.birthDate,
          phone: data.phone || null,
          password: data.password,
          accept_terms: data.acceptTerms,
        },
      });

      if (error) {
        let message = "Erro ao finalizar cadastro.";
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } else if (ctx?.body) {
            const body = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (body?.error) message = body.error;
          } else if (error.message && !error.message.includes("non-2xx")) {
            message = error.message;
          }
        } catch {
          /* ignore parse errors, use default message */
        }
        toast.error(message);
        return;
      }
      if (!result?.success) {
        toast.error(result?.error || "Erro ao finalizar cadastro.");
        return;
      }

      toast.success("Cadastro finalizado com sucesso!");
      navigate("/app", { replace: true });
    } catch (e) {
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <span className="text-2xl font-bold">
              Nura<span className="text-primary">Can</span> AI
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Completar Cadastro</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {firstName ? `Olá, ${firstName}! ` : ""}
            Faltam só alguns dados para você começar.
          </p>
        </div>

        <div className="gradient-card border-border p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF *</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de nascimento *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº de celular</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Crie uma senha"
                          className="pr-10"
                          autoComplete="new-password"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          tabIndex={-1}
                        >
                          {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="acceptTerms"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <Label className="text-sm font-normal cursor-pointer">
                        Aceito os{" "}
                        <a href="#" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Termos de Serviço
                        </a>{" "}
                        e{" "}
                        <a href="#" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Política de Privacidade
                        </a>
                      </Label>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Finalizar Cadastro"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default CompletarCadastro;
