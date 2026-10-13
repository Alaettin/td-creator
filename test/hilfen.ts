import { existsSync, readFileSync } from "node:fs";
import { expect } from "vitest";
import { einlesen, type Quelle } from "../src/merge/einlesen";
import { BEREICHE_SEMANTIK, type Eintrag } from "../src/merge/zusammenfuehren";
import { semantikSchluessel } from "../src/merge/sammeln";
import type { ConceptDescription, Element, Submodel, Umgebung } from "../src/merge/typen";

export const vorlageText = readFileSync(
  new URL("../vorlagen/IDTA-02003-TechnicalData-2.0.json", import.meta.url),
  "utf8",
);
export const vorlage: Umgebung = JSON.parse(vorlageText);

/** Die Beispiele enthalten lizenzierte ECLASS-Inhalte und liegen nur lokal, nicht im Repo. */
export function beispiel(name: string): Quelle | undefined {
  const pfad = new URL(`../beispiele/${name}`, import.meta.url);
  return existsSync(pfad) ? einlesen(name, readFileSync(pfad, "utf8")) : undefined;
}

/** Ersatz, damit übersprungene Gruppen ihre Tests trotzdem registrieren. */
export const leereQuelle: Quelle = { datei: "", submodels: [], conceptDescriptions: [] };

export function eintraegeAus(...quellen: Quelle[]): Eintrag[] {
  return quellen.flatMap((q) =>
    q.submodels.map((s) => ({ datei: q.datei, submodel: s.submodel, conceptDescriptions: q.conceptDescriptions })),
  );
}

export function bereichsInhalt(u: Umgebung): Element[] {
  const td = u.submodels![0];
  const bereiche = td.submodelElements!.find((e) => semantikSchluessel(e.semanticId) === BEREICHE_SEMANTIK)!;
  const liste = bereiche.value as Element[];
  expect(liste).toHaveLength(1);
  return liste[0].value as Element[];
}

export function prop(idShort: string, sem: string, valueType = "xs:string", extra: Partial<Element> = {}): Element {
  return {
    modelType: "Property",
    idShort,
    valueType,
    semanticId: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: sem }] },
    ...extra,
  };
}

export function block(idShort: string, sem: string, kinder: Element[]): Element {
  return {
    modelType: "SubmodelElementCollection",
    idShort,
    semanticId: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: sem }] },
    value: kinder,
  };
}

export function cd(id: string): ConceptDescription {
  return { modelType: "ConceptDescription", id };
}

export function datei(name: string, submodels: Submodel[], cds: ConceptDescription[]) {
  return einlesen(name, JSON.stringify({ submodels, conceptDescriptions: cds }));
}

export function sm(idShort: string, elemente: Element[]): Submodel {
  return { modelType: "Submodel", id: `urn:${idShort}`, idShort, submodelElements: elemente };
}
