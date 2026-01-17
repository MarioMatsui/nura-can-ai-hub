import { useState, useEffect } from 'react';

// Simple state management for banner height
let bannerHeight = 0;
const listeners = new Set<() => void>();

export const setPromoBannerHeight = (height: number) => {
  bannerHeight = height;
  listeners.forEach(listener => listener());
};

export const usePromoBannerHeight = () => {
  const [height, setHeight] = useState(bannerHeight);
  
  useEffect(() => {
    const listener = () => setHeight(bannerHeight);
    listeners.add(listener);
    // Set initial value
    setHeight(bannerHeight);
    return () => { listeners.delete(listener); };
  }, []);
  
  return height;
};
