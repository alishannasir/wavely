import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FiltersState {
  preferredGender: string | null;
  preferredCountry: string | null;
  setPreferredGender: (gender: string | null) => void;
  setPreferredCountry: (country: string | null) => void;
}

export const useFilters = create<FiltersState>()(
  persist(
    (set) => ({
      preferredGender: null,
      preferredCountry: null,
      setPreferredGender: (preferredGender) => set({ preferredGender }),
      setPreferredCountry: (preferredCountry) => set({ preferredCountry }),
    }),
    { name: 'ovc-filters' },
  ),
);
