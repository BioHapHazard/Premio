import { useState, useEffect } from 'react';

// Owns the transient toast notification: triggerToast(message, type) shows one
// (stripping decorative emoji so the type icon carries the state), and it
// auto-dismisses after 4s. Fully self-contained.
export function useToast() {
  const [toast, setToast] = useState(null);

  const triggerToast = (message, type = 'success') => {
    // Strip any decorative emoji from toast copy — the type icon conveys state now.
    const clean = (message || '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    setToast({ message: clean, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return { toast, triggerToast };
}
