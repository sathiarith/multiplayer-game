import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth.jsx";

const SelectionContext = createContext(null);

export function SelectedCharacterProvider({ children }) {
  const { user } = useAuth();
  const [selection, setSelection] = useState(null); // { userId, character }

  // A choice only counts for the user who made it.
  const selected =
    selection && selection.userId === user?.id ? selection.character : null;

  const select = useCallback(
    (character) => setSelection({ userId: user?.id, character }),
    [user?.id],
  );

  const value = useMemo(() => ({ selected, select }), [selected, select]);
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelectedCharacter() {
  const ctx = useContext(SelectionContext);
  if (!ctx)
    throw new Error(
      "useSelectedCharacter must be used inside <SelectedCharacterProvider>",
    );
  return ctx;
}
