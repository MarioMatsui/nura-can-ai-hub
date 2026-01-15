import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import App from "./App.tsx";
import "./index.css";

// Apply theme based on user preference or default to light
const initializeTheme = () => {
  const storedTheme = localStorage.getItem("vite-ui-theme");
  
  if (storedTheme === "dark") {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else if (storedTheme === "light" || !storedTheme) {
    // Default to light mode
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    if (!storedTheme) {
      localStorage.setItem("vite-ui-theme", "light");
    }
  } else if (storedTheme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }
};

initializeTheme();

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
