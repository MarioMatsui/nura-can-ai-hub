import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";

const signUpSchema = z.object({
  fullName: z.string()
    .min(3, "Nome completo deve ter no mínimo 3 caracteres")
    .max(100, "Nome completo deve ter no máximo 100 caracteres"),
  phone: z.string()
    .optional()
    .refine((val) => !val || /^\+?[\d\s()-]+$/.test(val), {
      message: "Formato de telefone inválido",
    }),
  email: z.string()
    .email("E-mail inválido")
    .max(255, "E-mail deve ter no máximo 255 caracteres"),
  birthDate: z.string()
    .refine((val) => {
      const date = new Date(val);
      const today = new Date();
      const age = today.getFullYear() - date.getFullYear();
      return age >= 18 && age <= 120;
    }, "Você deve ter pelo menos 18 anos"),
  cpf: z.string()
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/, "CPF inválido (use formato 000.000.000-00 ou 00000000000)")
    .refine((cpf) => {
      // Remove formatting
      const cleanCpf = cpf.replace(/\D/g, '');
      
      // Check if has 11 digits
      if (cleanCpf.length !== 11) return false;
      
      // Check for known invalid CPFs (all same digits)
      if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
      
      // Validate check digits
      let sum = 0;
      let remainder;
      
      // First check digit
      for (let i = 1; i <= 9; i++) {
        sum += parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
      }
      remainder = (sum * 10) % 11;
      if (remainder === 10 || remainder === 11) remainder = 0;
      if (remainder !== parseInt(cleanCpf.substring(9, 10))) return false;
      
      // Second check digit
      sum = 0;
      for (let i = 1; i <= 10; i++) {
        sum += parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
      }
      remainder = (sum * 10) % 11;
      if (remainder === 10 || remainder === 11) remainder = 0;
      if (remainder !== parseInt(cleanCpf.substring(10, 11))) return false;
      
      return true;
    }, "CPF inválido - verifique os dígitos"),
  crmCrv: z.string().optional(),
  password: z.string()
    .min(8, "Senha deve ter no mínimo 8 caracteres")
    .max(100, "Senha deve ter no máximo 100 caracteres")
    .regex(/[A-Z]/, "Senha deve conter pelo menos uma letra maiúscula")
    .regex(/[a-z]/, "Senha deve conter pelo menos uma letra minúscula")
    .regex(/[0-9]/, "Senha deve conter pelo menos um número"),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "Você deve aceitar os termos de serviço",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type SignUpFormData = z.infer<typeof signUpSchema>;

const SignUp = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      birthDate: "",
      cpf: "",
      crmCrv: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const onSubmit = async (data: SignUpFormData) => {
    setIsLoading(true);

    try {
      // Call server-side validation and signup endpoint
      const { data: signupData, error: signupError } = await supabase.functions.invoke(
        "validate-signup",
        {
          body: {
            email: data.email,
            password: data.password,
            full_name: data.fullName,
            phone: data.phone || null,
            birth_date: data.birthDate,
            cpf: data.cpf,
            crm_crv: data.crmCrv || null,
          },
        }
      );

      if (signupError) {
        console.error("Signup error:", signupError);
        toast.error(signupError.message || "Erro ao criar conta. Tente novamente.");
        return;
      }

      if (!signupData?.success) {
        toast.error(signupData?.error || "Erro ao criar conta.");
        return;
      }

      // Add contact to Brevo
      try {
        const { error: brevoError } = await supabase.functions.invoke("add-brevo-contact", {
          body: {
            email: data.email,
            fullName: data.fullName,
            phone: data.phone || undefined,
            birthDate: data.birthDate,
            cpf: data.cpf,
            crmCrv: data.crmCrv || undefined,
          },
        });

        if (brevoError) {
          // Log error without sensitive data
          console.error("Failed to sync contact to mailing list");
        }
      } catch (brevoError) {
        // Don't block signup if Brevo fails
        console.error("Mailing list sync failed");
      }

      toast.success("Cadastro realizado com sucesso! Você já pode fazer login.");
      navigate("/auth/login");
    } catch (error: any) {
      toast.error("Erro ao realizar cadastro. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <img src={logo} alt="NuraCan AI" className="h-10 w-auto" />
            <span className="text-2xl font-bold">
              Nura<span className="text-primary">Can</span> AI
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Criar Conta</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Preencha seus dados para começar
          </p>
        </div>

        <div className="gradient-card border-border p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo *</FormLabel>
                    <FormControl>
                      <Input placeholder="João Silva" {...field} />
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
                    <FormLabel>Celular (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        {...field}
                      />
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
                    <FormLabel>Data de Nascimento *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                name="crmCrv"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CRM/CRV (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="CRM 123456 ou CRV 123456" {...field} />
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
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar Senha *</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
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
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <Label className="text-sm font-normal cursor-pointer">
                        Aceito os{" "}
                        <a
                          href="#"
                          className="text-primary hover:underline"
                          onClick={(e) => e.preventDefault()}
                        >
                          Termos de Serviço
                        </a>{" "}
                        e{" "}
                        <a
                          href="#"
                          className="text-primary hover:underline"
                          onClick={(e) => e.preventDefault()}
                        >
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
                    Criando conta...
                  </>
                ) : (
                  "Criar Conta"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Já tenho uma conta.{" "}
              <Link
                to="/auth/login"
                className="text-primary font-medium hover:underline"
              >
                Fazer Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
