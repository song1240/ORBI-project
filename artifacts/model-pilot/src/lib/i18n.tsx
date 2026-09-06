import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'ko' | 'en';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  tr: (english: string, korean: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'model-pilot-language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
    return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      tr: (english, korean) => (language === 'ko' ? korean : english),
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}