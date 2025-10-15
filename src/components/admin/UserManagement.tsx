import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import UserDialog from "./UserDialog";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string;
  cpf: string;
  crm_crv: string | null;
}

interface UserSubscription {
  id: string;
  user_id: string;
  plan_type: string;
  status: "active" | "inactive" | "cancelled" | "expired" | "scheduled_cancellation";
  billing_period: string | null;
  started_at: string;
  expires_at: string | null;
}

interface UserData {
  profile: UserProfile;
  subscriptions: UserSubscription[];
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter((user) =>
        user.profile.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.profile.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from("user_subscriptions")
        .select("*");

      if (subscriptionsError) throw subscriptionsError;

      const usersData: UserData[] = (profiles || []).map((profile) => ({
        profile,
        subscriptions: subscriptions?.filter((sub) => sub.user_id === profile.id) || [],
      }));

      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserClick = (user: UserData) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const getStatusBadge = (subscriptions: UserSubscription[]) => {
    if (!subscriptions || subscriptions.length === 0) {
      return <Badge variant="secondary">Sem Plano</Badge>;
    }

    const activeSub = subscriptions.find(sub => sub.status === "active");
    if (activeSub) {
      const isExpired = activeSub.expires_at && new Date(activeSub.expires_at) < new Date();
      if (isExpired) {
        return <Badge variant="destructive">Expirado</Badge>;
      }
      return <Badge className="bg-primary text-primary-foreground">Ativo</Badge>;
    }

    return <Badge variant="secondary">{subscriptions[0].status}</Badge>;
  };

  const getPlanLabels = (subscriptions: UserSubscription[]) => {
    if (!subscriptions || subscriptions.length === 0) return "—";
    
    return subscriptions
      .map(sub => {
        const labels: Record<string, string> = {
          free: "Gratuito",
          medical: "Médico",
          legal: "Jurídico",
          veterinary: "Veterinário",
          specialist: "Especialista",
        };
        return labels[sub.plan_type] || sub.plan_type;
      })
      .join(", ");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Usuários Cadastrados</CardTitle>
          <CardDescription>
            {filteredUsers.length} usuário(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center p-8">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">
                {searchTerm ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow
                      key={user.profile.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleUserClick(user)}
                    >
                      <TableCell className="font-medium">{user.profile.full_name}</TableCell>
                      <TableCell>{user.profile.email}</TableCell>
                      <TableCell>
                        {getPlanLabels(user.subscriptions)}
                      </TableCell>
                      <TableCell>{getStatusBadge(user.subscriptions)}</TableCell>
                      <TableCell>
                        {user.subscriptions[0]?.expires_at
                          ? new Date(user.subscriptions[0].expires_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUserClick(user);
                          }}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDialog
        user={selectedUser}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdate={loadUsers}
      />
    </>
  );
};

export default UserManagement;
