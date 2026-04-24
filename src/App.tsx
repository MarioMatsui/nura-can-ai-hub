import { Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Planos from "./pages/Planos";
import Dashboard from "./pages/Dashboard";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCanceled from "./pages/PaymentCanceled";
import SignUp from "./pages/auth/SignUp";
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import CompletarCadastro from "./pages/auth/CompletarCadastro";
import LoginCallback from "./pages/auth/LoginCallback";
import Admin from "./pages/Admin";
import AdminBlog from "./pages/AdminBlog";
import AdminBlogEditor from "./pages/AdminBlogEditor";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import NotFound from "./pages/NotFound";

const App = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/planos" element={<Planos />} />
    <Route path="/app" element={<Dashboard />} />
    <Route path="/blog" element={<Blog />} />
    <Route path="/blog/:slug" element={<BlogPost />} />
    <Route path="/checkout/sucesso" element={<PaymentSuccess />} />
    <Route path="/checkout/cancelado" element={<PaymentCanceled />} />
    <Route path="/auth/signup" element={<SignUp />} />
    <Route path="/auth/login" element={<Login />} />
    <Route path="/auth/forgot-password" element={<ForgotPassword />} />
    <Route path="/auth/completar-cadastro" element={<CompletarCadastro />} />
    <Route path="/auth/login-callback" element={<LoginCallback />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="/admin/users" element={<Admin />} />
    <Route path="/admin/knowledge" element={<Admin />} />
    <Route path="/admin/plans" element={<Admin />} />
    <Route path="/admin/finance" element={<Admin />} />
    <Route path="/admin/blog" element={<AdminBlog />} />
    <Route path="/admin/blog/new" element={<AdminBlogEditor />} />
    <Route path="/admin/blog/edit/:id" element={<AdminBlogEditor />} />
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
