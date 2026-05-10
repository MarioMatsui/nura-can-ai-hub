import { useState, useRef } from "react";
import { Play } from "lucide-react";

const HowItWorks = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleVideoEnd = () => setIsPlaying(false);
  const handleVideoPause = () => setIsPlaying(false);
  const handleVideoPlay = () => setIsPlaying(true);

  return (
    <section id="como-funciona" className="py-20 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-10 sm:mb-14">
          Conheça melhor a Nura
        </h2>

        <div
          className="relative rounded-[1.5rem] overflow-hidden shadow-glow cursor-pointer mx-auto"
          onClick={handlePlayPause}
        >
          <video
            ref={videoRef}
            src="/apreNura.mp4"
            className="w-full block"
            onEnded={handleVideoEnd}
            onPause={handleVideoPause}
            onPlay={handleVideoPlay}
            preload="none"
            playsInline
          />

          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-foreground/20 transition-opacity">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                <Play className="w-7 h-7 sm:w-9 sm:h-9 text-primary ml-1" />
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-muted-foreground text-base sm:text-lg mt-8 max-w-2xl mx-auto leading-relaxed">
          Seu novo assistente de consulta, disposto a te responder tudo sobre o cuidado com a planta.
        </p>
      </div>
    </section>
  );
};

export default HowItWorks;
