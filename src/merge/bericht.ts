export interface Fund {
  idShort: string;
  semanticId: string;
  quelle: string;
}

export interface Bericht {
  submodelZahl: number;
  gelesen: number;
  uebernommen: Fund[];
  /** Element übernommen; seine ConceptDescription steht schon in der Vorlage und wird nicht doppelt angelegt. */
  cdAusVorlage: Fund[];
  /** semanticId kam schon aus einer früheren Quelle. */
  mehrfach: Fund[];
  /** Gleiche semanticId, aber anderer modelType oder valueType als der erste Treffer. */
  konflikte: (Fund & { erwartet: string; gefunden: string })[];
  umbenannt: (Fund & { von: string })[];
  ohneSemanticId: Fund[];
  ungueltigeIdShorts: Fund[];
  fehlendeCDs: Fund[];
  neueCDs: number;
}

export function leererBericht(): Bericht {
  return {
    submodelZahl: 0,
    gelesen: 0,
    uebernommen: [],
    cdAusVorlage: [],
    mehrfach: [],
    konflikte: [],
    umbenannt: [],
    ohneSemanticId: [],
    ungueltigeIdShorts: [],
    fehlendeCDs: [],
    neueCDs: 0,
  };
}
