import type { ConceptDescription, Submodel, Umgebung } from "./typen";
import { blaetter } from "./sammeln";

export interface QuellSubmodel {
  schluessel: string;
  datei: string;
  submodel: Submodel;
  name: string;
  elementzahl: number;
}

export interface Quelle {
  datei: string;
  submodels: QuellSubmodel[];
  conceptDescriptions: ConceptDescription[];
}

export class EinleseFehler extends Error {}

/** Liest eine AAS-Umgebung (oder ein einzelnes Submodel) aus JSON-Text. */
export function einlesen(datei: string, text: string): Quelle {
  let daten: unknown;
  try {
    daten = JSON.parse(text);
  } catch (e) {
    throw new EinleseFehler(`${datei}: kein gültiges JSON (${(e as Error).message})`);
  }
  if (typeof daten !== "object" || daten === null || Array.isArray(daten)) {
    throw new EinleseFehler(`${datei}: erwartet wird ein JSON-Objekt mit "submodels"`);
  }

  const objekt = daten as Umgebung & { modelType?: string };
  const submodels: Submodel[] =
    objekt.modelType === "Submodel" ? [objekt as unknown as Submodel] : (objekt.submodels ?? []);
  if (!Array.isArray(submodels) || submodels.length === 0) {
    throw new EinleseFehler(`${datei}: enthält keine Submodels`);
  }

  return {
    datei,
    submodels: submodels.map((submodel, index) => ({
      schluessel: `${datei}#${index}`,
      datei,
      submodel,
      name: submodel.idShort ?? submodel.id ?? `Submodel ${index + 1}`,
      elementzahl: blaetter(submodel.submodelElements ?? []).length,
    })),
    conceptDescriptions: Array.isArray(objekt.conceptDescriptions) ? objekt.conceptDescriptions : [],
  };
}
