import { useEffect, useRef } from 'react';
import { setPromoBannerHeight } from '@/hooks/usePromoBannerHeight';

const PromoBanner = () => {
  const text = "• PROMO DE LANÇAMENTO 15% DE DESCONTO EM TODOS OS PLANOS •";
  const bannerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const updateHeight = () => {
      if (bannerRef.current) {
        setPromoBannerHeight(bannerRef.current.offsetHeight);
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    
    return () => {
      window.removeEventListener('resize', updateHeight);
      setPromoBannerHeight(0); // Reset when unmounting
    };
  }, []);
  
  return (
    <div 
      ref={bannerRef}
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
