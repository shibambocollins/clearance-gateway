// The demo admin code lives in React state only (SPEC §12: session memory, never localStorage).
import { createContext, useContext, useState, type ReactNode } from "react";

const AdminCodeContext = createContext<{ code: string; setCode: (code: string) => void }>({
  code: "",
  setCode: () => {},
});

export function AdminCodeProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState("");
  return <AdminCodeContext.Provider value={{ code, setCode }}>{children}</AdminCodeContext.Provider>;
}

export const useAdminCode = () => useContext(AdminCodeContext);
