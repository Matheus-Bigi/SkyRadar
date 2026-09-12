import { create } from "zustand";

/** Ephemeral (not persisted) selection / mode state. */
interface SelectionStore {
  selectedAircraftId: string | null;
  cardExpanded: boolean;
  lookHereActive: boolean;
  skyViewActive: boolean;
  overlapChoices: string[] | null;

  select: (id: string | null) => void;
  setExpanded: (v: boolean) => void;
  setLookHereActive: (v: boolean) => void;
  setSkyViewActive: (v: boolean) => void;
  setOverlapChoices: (ids: string[] | null) => void;
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
  selectedAircraftId: null,
  cardExpanded: false,
  lookHereActive: false,
  skyViewActive: false,
  overlapChoices: null,

  select: (id) =>
    set({
      selectedAircraftId: id,
      cardExpanded: false,
      lookHereActive: false,
      overlapChoices: null,
    }),
  setExpanded: (v) => set({ cardExpanded: v }),
  setLookHereActive: (v) => set({ lookHereActive: v }),
  setSkyViewActive: (v) => set({ skyViewActive: v }),
  setOverlapChoices: (ids) => set({ overlapChoices: ids }),
}));
