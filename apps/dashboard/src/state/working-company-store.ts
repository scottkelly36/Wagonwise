import { create } from 'zustand';

interface WorkingCompanyStore {
  readonly companyId: string;
  setCompanyId(companyId: string): void;
}

const useStore = create<WorkingCompanyStore>((set) => ({
  companyId: '',
  setCompanyId: (companyId) => set({ companyId }),
}));

/**
 * The company WagonWise staff are looking at, shared by every page and the top bar so that choosing one in the bar
 * (or on a page) holds when moving between pages. `''` means none chosen. It lives in memory only: a reload, or
 * the next person to sign in on this tab, starts with nothing chosen. Fleet staff have one company, from their account,
 * and never use this.
 */
export function useWorkingCompany(): readonly [string, (companyId: string) => void] {
  const companyId = useStore((s) => s.companyId);
  const setCompanyId = useStore((s) => s.setCompanyId);
  return [companyId, setCompanyId];
}
