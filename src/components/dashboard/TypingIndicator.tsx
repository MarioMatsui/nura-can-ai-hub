import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const THINKING_PHRASES = [
  'Analisando sua pergunta',
  'Estou pensando',
  'Ponderando a resposta',
  'Processando informações',
  'Consultando base de conhecimento',
];

const LONG_WAIT_MESSAGE = 'Ainda estou processando… obrigado pela paciência 🙏';
const LONG_WAIT_THRESHOLD = 12000; // 12 seconds
const PHRASE_INTERVAL = 2500; // 2.5 seconds

interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator = ({ className }: TypingIndicatorProps) => {
  const [currentPhrase, setCurrentPhrase] = useState(THINKING_PHRASES[0]);
  const [isLongWait, setIsLongWait] = useState(false);

  useEffect(() => {
    let phraseIndex = 0;
    
    // Rotate through phrases every 2.5 seconds
    const phraseInterval = setInterval(() => {
      if (!isLongWait) {
        phraseIndex = (phraseIndex + 1) % THINKING_PHRASES.length;
        setCurrentPhrase(THINKING_PHRASES[phraseIndex]);
      }
    }, PHRASE_INTERVAL);

    // Show long wait message after 12 seconds
    const longWaitTimeout = setTimeout(() => {
      setIsLongWait(true);
      setCurrentPhrase(LONG_WAIT_MESSAGE);
    }, LONG_WAIT_THRESHOLD);

    return () => {
      clearInterval(phraseInterval);
      clearTimeout(longWaitTimeout);
    };
  }, [isLongWait]);

  return (
    <div className={cn('flex justify-start', className)}>
      <div className="max-w-[85%] sm:max-w-[75%] rounded-lg p-3 sm:p-4 bg-muted">
        <div className="flex items-center gap-1 text-sm sm:text-base text-muted-foreground">
          <span>{currentPhrase}</span>
          <span className="inline-flex">
            <span className="animate-pulse-dot">.</span>
            <span className="animate-pulse-dot" style={{ animationDelay: '0.2s' }}>.</span>
            <span className="animate-pulse-dot" style={{ animationDelay: '0.4s' }}>.</span>
          </span>
        </div>
      </div>
    </div>
  );
};
