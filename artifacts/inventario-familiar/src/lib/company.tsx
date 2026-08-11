import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setCompanyIdGetter, useListCompanies, getListCompaniesQueryKey, type Company } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';

const STORAGE_KEY = 'activeCompanyId';

type CompanyContextValue = {
  companies: Company[];
  activeCompany: Company | null;
  selectCompany: (company: Company) => void;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const companiesQuery = useListCompanies({ query: { queryKey: getListCompaniesQueryKey(), enabled: isLoaded && isSignedIn } });
  const companies = useMemo(() => companiesQuery.data ?? [], [companiesQuery.data]);

  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? Number(stored) : null;
    return Number.isInteger(parsed) ? parsed : null;
  });

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null,
    [companies, activeCompanyId],
  );

  useEffect(() => {
    setCompanyIdGetter(activeCompany ? () => activeCompany.id : null);
    if (activeCompany && activeCompany.id !== activeCompanyId) {
      localStorage.setItem(STORAGE_KEY, String(activeCompany.id));
    }
  }, [activeCompany, activeCompanyId]);

  const selectCompany = useCallback(
    (company: Company) => {
      setActiveCompanyId(company.id);
      localStorage.setItem(STORAGE_KEY, String(company.id));
      queryClient.clear();
    },
    [queryClient],
  );

  const value = useMemo(
    () => ({ companies, activeCompany, selectCompany }),
    [companies, activeCompany, selectCompany],
  );

  if (!isLoaded) return <div className="grid min-h-[50vh] place-items-center text-sm text-[hsl(var(--muted-foreground))]">Cargando…</div>;

  if (isSignedIn) {
    if (companiesQuery.isError) {
      return <div className="grid min-h-[50vh] place-items-center text-sm text-[hsl(var(--muted-foreground))]">
        <div className="text-center">
          <p>No pudimos cargar tus negocios.</p>
          <button type="button" onClick={() => companiesQuery.refetch()} className="mt-3 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))]">Intentar de nuevo</button>
        </div>
      </div>;
    }
    if (!companiesQuery.isSuccess) {
      return <div className="grid min-h-[50vh] place-items-center text-sm text-[hsl(var(--muted-foreground))]">Cargando…</div>;
    }
  }

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
