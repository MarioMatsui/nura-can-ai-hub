import { useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Benefits from "@/components/Benefits";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const Index = () => {
  useEffect(() => {
    // Force light mode on landing page
    const root = document.documentElement;
    const previousTheme = root.classList.contains("dark") ? "dark" : "light";
    root.classList.remove("dark");
    root.classList.add("light");

    return () => {
      // Restore previous theme when leaving landing page
      root.classList.remove("light");
      if (previousTheme === "dark") {
        root.classList.add("dark");
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Features />
        <Benefits />
        <HowItWorks />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
