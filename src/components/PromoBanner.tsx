const PromoBanner = () => {
  const text = "• PROMO DE LANÇAMENTO 15% DE DESCONTO EM TODOS OS PLANOS •";
  
  return (
    <div 
      className="w-full overflow-hidden py-2 z-[60]"
      style={{ backgroundColor: '#e6685d' }}
    >
      <div className="animate-marquee whitespace-nowrap flex">
        {/* Repeat text multiple times for seamless loop */}
        {[...Array(10)].map((_, i) => (
          <span 
            key={i} 
            className="mx-8 text-white font-semibold text-sm tracking-wide"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
};

export default PromoBanner;
