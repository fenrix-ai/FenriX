import { useCallback, useEffect, useRef, useState } from 'react';

export type ActionReceipt = { id: number; label: string };

export function useActionReceipt(scope: string): {
  receipt: ActionReceipt | null;
  run: <T>(label: string, operation: () => Promise<T>) => Promise<T>;
} {
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const nextId = useRef(0);
  const scopeRef = useRef(scope);
  const generation = useRef(0);

  useEffect(() => {
    scopeRef.current = scope;
    generation.current += 1;
    setReceipt(null);
    return () => {
      generation.current += 1;
    };
  }, [scope]);

  const run = useCallback(async <T,>(label: string, operation: () => Promise<T>): Promise<T> => {
    const operationScope = scopeRef.current;
    const operationGeneration = generation.current;
    const value = await operation();

    if (scopeRef.current === operationScope && generation.current === operationGeneration) {
      nextId.current += 1;
      setReceipt({ id: nextId.current, label });
    }

    return value;
  }, []);

  return {
    receipt,
    run,
  };
}
