import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchScopeOptions } from '@/lib/api';

const ScopeContext = createContext();

const STORAGE_KEY = 'netsentinel-scope';

const defaultScope = {
  mode: 'all',
  profileId: '',
  assetId: '',
};

const safeParse = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
};

export const useScope = () => {
  const context = useContext(ScopeContext);
  if (!context) {
    throw new Error('useScope must be used within a ScopeProvider');
  }
  return context;
};

export const ScopeProvider = ({ children }) => {
  const [scope, setScope] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultScope;
    }
    const parsed = safeParse(window.localStorage.getItem(STORAGE_KEY), defaultScope);
    return {
      ...defaultScope,
      ...parsed,
    };
  });
  const [options, setOptions] = useState({ profiles: [], assets: [], assignments: [] });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
    }
  }, [scope]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const result = await fetchScopeOptions();
        setOptions({
          profiles: Array.isArray(result.profiles) ? result.profiles : [],
          assets: Array.isArray(result.assets) ? result.assets : [],
          assignments: Array.isArray(result.assignments) ? result.assignments : [],
        });
      } catch (error) {
        console.error('Failed to load scope options:', error);
      }
    };
    loadOptions();
  }, []);

  const value = useMemo(() => {
    const scopeKey = [scope.mode, scope.profileId, scope.assetId].join(':');
    return {
      scope,
      setScope,
      options,
      scopeKey,
    };
  }, [scope, options]);

  return (
    <ScopeContext.Provider value={value}>
      {children}
    </ScopeContext.Provider>
  );
};

export default ScopeContext;
