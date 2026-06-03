import { createContext, useContext, type ReactNode } from "react";
import { Eye } from "lucide-react";

const ReadOnlyContext = createContext<boolean>(false);

export function ReadOnlyProvider({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

export function ReadOnlyBanner() {
  const readOnly = useReadOnly();
  if (!readOnly) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-2 text-sm text-amber-800">
      <Eye className="h-4 w-4 flex-shrink-0" />
      <span>View only — you can browse this section but cannot make changes. Contact your club admin to request edit access.</span>
    </div>
  );
}
