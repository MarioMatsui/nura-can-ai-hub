import Header from "@/components/Header";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import PromoBanner from "@/components/PromoBanner";

const Planos = () => {
  return (
    <div className="min-h-screen bg-background">
      <PromoBanner />
      <Header />
      <main className="pt-20">
        <Pricing showFree={false} />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default Planos;
