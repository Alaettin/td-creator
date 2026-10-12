import type { ConceptDescription, Element, Qualifier, Reference, Submodel, Umgebung } from "./typen";
import { leererBericht, type Bericht, type Fund, type Mehrfach } from "./bericht";
import { blaetter, cdId, semantikSchluessel } from "./sammeln";

export const TD_SEMANTIK = "0173-1#01-AHX837#002";
export const BEREICHE_SEMANTIK = "0173-1#02-ABK163#002";
const KARDINALITAET_SEMANTIK = "https://admin-shell.io/SubmodelTemplates/SMT/Cardinality/1/0";
// AAS 3.0 (aas-core3.0): Buchstabe am Anfang, danach nur Buchstaben, Ziffern, Unterstrich.
const IDSHORT_REGEL = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Werte, die zu einer Instanz gehören und im Template nichts verloren haben. */
const INSTANZWERTE = ["value", "valueId", "min", "max"];

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

export function zusammenfuehren(vorlage: Umgebung, eintraege: Eintrag[]): Ergebnis {
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

  const inhalt: Element[] = [];
  const erste = new Map<string, { blatt: Element; fund: Fund }>();
  const mehrfach = new Map<string, Mehrfach>();
  const idShorts = new Set<string>();
  const neueCDs: ConceptDescription[] = [];
  // Ein Element darf doppelt im Submodel stehen, eine ConceptDescription nie: maßgeblich ist ihre id.
  const vorlageCDs = new Set((umgebung.conceptDescriptions ?? []).map((cd) => cd.id));
  const uebernommeneCDs = new Set<string>();

  for (const eintrag of eintraege) {
    bericht.submodelZahl++;
    const quelle = `${eintrag.datei} › ${eintrag.submodel.idShort ?? eintrag.submodel.id}`;

    for (const blatt of blaetter(eintrag.submodel.submodelElements ?? [])) {
      bericht.gelesen++;
      const semanticId = semantikSchluessel(blatt.semanticId);
      const fund: Fund = { idShort: blatt.idShort ?? "", semanticId: semanticId ?? "", quelle };

      if (!semanticId) {
        bericht.ohneSemanticId.push(fund);
        continue;
      }
      const frueher = erste.get(semanticId);
      if (frueher) {
        const erwartet = typBeschreibung(frueher.blatt);
        const gefunden = typBeschreibung(blatt);
        if (erwartet !== gefunden) {
          bericht.konflikte.push({ ...fund, erwartet, gefunden });
        } else {
          const eintrag = mehrfach.get(semanticId) ?? { ...frueher.fund, weitere: [] };
          eintrag.weitere.push(quelle);
          mehrfach.set(semanticId, eintrag);
        }
        continue;
      }

      const element = alsTemplateElement(blatt);
      const gewuenscht = mitVersion(blatt.idShort || "Eigenschaft", blatt.semanticId);
      element.idShort = freierName(gewuenscht, idShorts);
      if (element.idShort !== gewuenscht || !blatt.idShort) {
        bericht.umbenannt.push({ ...fund, idShort: element.idShort, von: blatt.idShort ?? "" });
      }
      if (!IDSHORT_REGEL.test(element.idShort)) bericht.ungueltigeIdShorts.push({ ...fund, idShort: element.idShort });
      idShorts.add(element.idShort);
      const uebernommen = { ...fund, idShort: element.idShort };
      erste.set(semanticId, { blatt, fund: uebernommen });
      inhalt.push(element);
      bericht.uebernommen.push(uebernommen);

      const id = cdId(blatt.semanticId)!;
      if (vorlageCDs.has(id)) {
        bericht.cdAusVorlage.push({ ...fund, idShort: element.idShort });
        continue;
      }
      if (uebernommeneCDs.has(id)) continue;
      const cd = cdIndex.get(id);
      if (cd) {
        neueCDs.push(structuredClone(cd));
        uebernommeneCDs.add(id);
      } else {
        bericht.fehlendeCDs.push(fund);
      }
    }
  }

  const bereich: Element = { ...structuredClone(bereichsVorlage), value: inhalt };
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

function alsTemplateElement(blatt: Element): Element {
  const element = structuredClone(blatt);
  for (const feld of INSTANZWERTE) delete element[feld];
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
