import type { ConceptDescription, Element, Qualifier, Reference, Submodel, Umgebung } from "./typen";
import { leererBericht, type Bericht, type Fund, type Mehrfach } from "./bericht";
import { blaetter, cdId, semantikSchluessel } from "./sammeln";

export const TD_SEMANTIK = "0173-1#01-AHX837#002";
export const BEREICHE_SEMANTIK = "0173-1#02-ABK163#002";
const KARDINALITAET_SEMANTIK = "https://admin-shell.io/SubmodelTemplates/SMT/Cardinality/1/0";
// AAS 3.0 (aas-core3.0): Buchstabe am Anfang, danach nur Buchstaben, Ziffern, Unterstrich.
const IDSHORT_REGEL = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const BLOCK = "SubmodelElementCollection";

/** Werte, die zu einer Instanz gehören und im Template nichts verloren haben. */
const INSTANZWERTE = ["value", "valueId", "min", "max"];

/** basic: alle Eigenschaften flach in einem Bereich; advanced: ECLASS-Blöcke bleiben als Struktur erhalten. */
export type Modus = "basic" | "advanced";

export interface Eintrag {
  datei: string;
  submodel: Submodel;
  conceptDescriptions: ConceptDescription[];
}

export interface Ergebnis {
  umgebung: Umgebung;
  bericht: Bericht;
}

export class MergeFehler extends Error {}

/** Eine Ebene im Ergebnis: der Bereich selbst oder ein Block. Entdoppelung und idShorts gelten je Ebene. */
interface Behaelter {
  liste: Element[];
  index: Map<string, { quelle: Element; ziel: Element; fund: Fund }>;
  namen: Set<string>;
  /** idShort-Pfad für den Bericht, z. B. "Identification_v010.Manufacturer_v010." */
  pfad: string;
  /** Pfad aus semanticIds, damit Mehrfach-Funde je Ort gezählt werden. */
  ort: string;
}

function neuerBehaelter(liste: Element[], pfad: string, ort: string): Behaelter {
  return { liste, index: new Map(), namen: new Set(), pfad, ort };
}

export function zusammenfuehren(
  vorlage: Umgebung,
  eintraege: Eintrag[],
  { modus }: { modus: Modus } = { modus: "basic" },
): Ergebnis {
  const umgebung = structuredClone(vorlage);
  const bericht = leererBericht();

  const td = umgebung.submodels?.find((s) => semantikSchluessel(s.semanticId) === TD_SEMANTIK);
  if (!td) throw new MergeFehler("Die Vorlage enthält kein Technical-Data-Submodel");
  const bereiche = td.submodelElements?.find(
    (e) => semantikSchluessel(e.semanticId) === BEREICHE_SEMANTIK,
  );
  const bereichsVorlage = Array.isArray(bereiche?.value) ? (bereiche.value as Element[])[0] : undefined;
  if (!bereiche || !bereichsVorlage) {
    throw new MergeFehler("Die Vorlage enthält keine TechnicalPropertyAreas mit Bereichseintrag");
  }

  const cdIndex = new Map<string, ConceptDescription>();
  for (const eintrag of eintraege) {
    for (const cd of eintrag.conceptDescriptions) if (!cdIndex.has(cd.id)) cdIndex.set(cd.id, cd);
  }

  const wurzel = neuerBehaelter([], "", "");
  const kinderVon = new Map<Element, Behaelter>();
  const mehrfach = new Map<string, Mehrfach>();
  const neueCDs: ConceptDescription[] = [];
  // Ein Element darf doppelt im Submodel stehen, eine ConceptDescription nie: maßgeblich ist ihre id.
  const vorlageCDs = new Set((umgebung.conceptDescriptions ?? []).map((cd) => cd.id));
  const uebernommeneCDs = new Set<string>();

  /** Erst die ganze id; kennt sie niemand, die Teile einer zusammengesetzten Block-id (02-…/01-…). */
  function cdsUebernehmen(referenz: Reference | undefined, fund: Fund) {
    const ganz = cdId(referenz);
    if (!ganz) return;
    const bekannt = vorlageCDs.has(ganz) || uebernommeneCDs.has(ganz) || cdIndex.has(ganz);
    const kandidaten = bekannt ? [ganz] : ganz.split("/").map((t) => t.trim()).filter(Boolean);
    for (const id of kandidaten) {
      if (vorlageCDs.has(id)) {
        bericht.cdAusVorlage.push(fund);
        continue;
      }
      if (uebernommeneCDs.has(id)) continue;
      const cd = cdIndex.get(id);
      if (cd) {
        neueCDs.push(structuredClone(cd));
        uebernommeneCDs.add(id);
      } else {
        bericht.fehlendeCDs.push({ ...fund, cdId: id });
      }
    }
  }

  function einfuegen(quelle: Element, ziel: Behaelter, herkunft: string) {
    const istBlock = modus === "advanced" && quelle.modelType === BLOCK;
    const semanticId = semantikSchluessel(quelle.semanticId);
    const fund: Fund = { idShort: ziel.pfad + (quelle.idShort ?? ""), semanticId: semanticId ?? "", quelle: herkunft };

    if (!semanticId) {
      if (istBlock) {
        // Ohne semanticId gibt es keinen Block, mit dem man zusammenführen könnte: Inhalt eine Ebene höher.
        bericht.aufgeloesteBloecke.push(fund);
        for (const kind of (quelle.value as Element[] | undefined) ?? []) einfuegen(kind, ziel, herkunft);
      } else {
        bericht.gelesen++;
        bericht.ohneSemanticId.push(fund);
      }
      return;
    }
    if (!istBlock) bericht.gelesen++;

    const frueher = ziel.index.get(semanticId);
    if (frueher) {
      const erwartet = typBeschreibung(frueher.quelle);
      const gefunden = typBeschreibung(quelle);
      if (erwartet !== gefunden) {
        // Ein abgewiesener Block zählt als eine gelesene Einheit, damit die Bilanz aufgeht.
        if (istBlock) bericht.gelesen++;
        bericht.konflikte.push({ ...fund, erwartet, gefunden });
      } else if (istBlock) {
        for (const kind of (quelle.value as Element[] | undefined) ?? []) {
          einfuegen(kind, kinderVon.get(frueher.ziel)!, herkunft);
        }
      } else {
        const schluessel = `${ziel.ort}|${semanticId}`;
        const eintrag = mehrfach.get(schluessel) ?? { ...frueher.fund, weitere: [] };
        eintrag.weitere.push(herkunft);
        mehrfach.set(schluessel, eintrag);
      }
      return;
    }

    const element = istBlock ? alsBlockHuelle(quelle) : alsTemplateElement(quelle);
    const gewuenscht = mitVersion(quelle.idShort || "Eigenschaft", quelle.semanticId);
    element.idShort = freierName(gewuenscht, ziel.namen);
    const angelegt: Fund = { ...fund, idShort: ziel.pfad + element.idShort };
    if (element.idShort !== gewuenscht || !quelle.idShort) {
      bericht.umbenannt.push({ ...angelegt, von: quelle.idShort ?? "" });
    }
    if (!IDSHORT_REGEL.test(element.idShort)) bericht.ungueltigeIdShorts.push(angelegt);
    ziel.namen.add(element.idShort);
    ziel.index.set(semanticId, { quelle, ziel: element, fund: angelegt });
    ziel.liste.push(element);
    cdsUebernehmen(quelle.semanticId, angelegt);

    if (istBlock) {
      bericht.bloecke++;
      const innen = neuerBehaelter(element.value as Element[], `${angelegt.idShort}.`, `${ziel.ort}/${semanticId}`);
      kinderVon.set(element, innen);
      for (const kind of (quelle.value as Element[] | undefined) ?? []) einfuegen(kind, innen, herkunft);
    } else {
      bericht.uebernommen.push(angelegt);
    }
  }

  for (const eintrag of eintraege) {
    bericht.submodelZahl++;
    const herkunft = `${eintrag.datei} › ${eintrag.submodel.idShort ?? eintrag.submodel.id}`;
    const elemente = eintrag.submodel.submodelElements ?? [];
    for (const element of modus === "advanced" ? elemente : blaetter(elemente)) einfuegen(element, wurzel, herkunft);
  }

  ohneLeereListen(wurzel.liste);
  const bereich: Element = { ...structuredClone(bereichsVorlage), value: wurzel.liste };
  bereiche.value = [bereich];
  umgebung.conceptDescriptions = [...(umgebung.conceptDescriptions ?? []), ...neueCDs];
  bericht.neueCDs = neueCDs.length;
  bericht.mehrfach = [...mehrfach.values()];

  return { umgebung, bericht };
}

/** Version einer IRDI wie 0173-1#02-AAO677#004: die drei Ziffern nach dem letzten #. */
export function eclassVersion(referenz: Reference | undefined): string | undefined {
  return cdId(referenz)?.match(/#(\d{3})$/)?.[1];
}

/** Hängt _v<Version> an, sofern die semanticId eine hat und der Name sie noch nicht trägt. */
function mitVersion(idShort: string, referenz: Reference | undefined): string {
  const version = eclassVersion(referenz);
  if (!version || idShort.endsWith(`_v${version}`)) return idShort;
  return `${idShort}_v${version}`;
}

function typBeschreibung(e: Element): string {
  return e.valueType ? `${e.modelType} (${e.valueType})` : e.modelType;
}

function freierName(gewuenscht: string, belegt: Set<string>): string {
  if (!belegt.has(gewuenscht)) return gewuenscht;
  let n = 2;
  while (belegt.has(`${gewuenscht}_${n}`)) n++;
  return `${gewuenscht}_${n}`;
}

function mitKardinalitaet(element: Element): Element {
  const kardinalitaet: Qualifier = {
    semanticId: {
      type: "ExternalReference",
      keys: [{ type: "GlobalReference", value: KARDINALITAET_SEMANTIK }],
    },
    type: "SMT/Cardinality",
    valueType: "xs:string",
    value: "ZeroToOne",
  };
  const uebrige = (element.qualifiers ?? []).filter((q) => q.type !== "SMT/Cardinality");
  element.qualifiers = [...uebrige, kardinalitaet];
  return element;
}

/** AAS 3.0 verbietet value: [] (aas-core: "Value must be either not set or have at least one item"). */
function ohneLeereListen(elemente: Element[]) {
  for (const e of elemente) {
    if (e.modelType !== BLOCK || !Array.isArray(e.value)) continue;
    if (e.value.length === 0) delete e.value;
    else ohneLeereListen(e.value as Element[]);
  }
}

/** Block ohne Inhalt; die Kinder kommen einzeln über einfuegen hinzu. */
function alsBlockHuelle(block: Element): Element {
  const { value: _inhalt, ...rest } = block;
  return mitKardinalitaet({ ...structuredClone(rest), value: [] } as Element);
}

/**
 * Blatt ohne Instanzwerte. Listen und Entities (Basic löst sie nicht auf, Advanced übernimmt sie als Ganzes)
 * behalten ihre Kinder; geleert werden nur deren Blätter.
 */
function alsTemplateElement(quelle: Element): Element {
  return mitKardinalitaet(ohneInstanzwerte(structuredClone(quelle)));
}

function ohneInstanzwerte(element: Element): Element {
  const kinder = element.modelType === "Entity" ? element.statements : element.value;
  const istBehaelter = ["SubmodelElementCollection", "SubmodelElementList", "Entity"].includes(element.modelType);
  if (istBehaelter) {
    if (Array.isArray(kinder)) (kinder as Element[]).forEach(ohneInstanzwerte);
    return element;
  }
  for (const feld of INSTANZWERTE) delete element[feld];
  return element;
}
