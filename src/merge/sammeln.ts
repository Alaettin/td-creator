import type { Element, Reference } from "./typen";

const BEHAELTER = new Set(["SubmodelElementCollection", "SubmodelElementList", "Entity"]);

/** Alle Blätter in Dokumentreihenfolge; Collections, Listen und Entities werden aufgelöst. */
export function blaetter(elemente: Element[]): Element[] {
  const ergebnis: Element[] = [];
  for (const element of elemente) {
    if (!BEHAELTER.has(element.modelType)) {
      ergebnis.push(element);
      continue;
    }
    const kinder = element.modelType === "Entity" ? element.statements : element.value;
    if (Array.isArray(kinder)) ergebnis.push(...blaetter(kinder as Element[]));
  }
  return ergebnis;
}

/** Exakter Vergleichsschlüssel einer semanticId, Version eingeschlossen. */
export function semantikSchluessel(referenz: Reference | undefined): string | undefined {
  const werte = referenz?.keys?.map((k) => k.value.trim()).filter(Boolean) ?? [];
  return werte.length > 0 ? werte.join(" | ") : undefined;
}

/** Die ConceptDescription zu einer semanticId trägt die id des letzten Schlüssels. */
export function cdId(referenz: Reference | undefined): string | undefined {
  const keys = referenz?.keys ?? [];
  return keys.length > 0 ? keys[keys.length - 1].value.trim() : undefined;
}
