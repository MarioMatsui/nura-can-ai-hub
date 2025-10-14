import Header from "@/components/Header";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const Planos = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20">
        <Pricing showFreePlan={false} />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default Planos;
