import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { einlesen, EinleseFehler } from "../src/merge/einlesen";
import { BEREICHE_SEMANTIK, zusammenfuehren, type Eintrag } from "../src/merge/zusammenfuehren";
import { semantikSchluessel } from "../src/merge/sammeln";
import type { ConceptDescription, Element, Submodel, Umgebung } from "../src/merge/typen";

const vorlageText = readFileSync(new URL("../vorlagen/IDTA-02003-TechnicalData-2.0.json", import.meta.url), "utf8");
const vorlage: Umgebung = JSON.parse(vorlageText);
// Das Beispiel enthält lizenzierte ECLASS-Inhalte und liegt nur lokal, nicht im Repo.
const beispielPfad = new URL("../beispiele/AAS-6455.json", import.meta.url);
const beispiel = existsSync(beispielPfad) ? einlesen("AAS-6455.json", readFileSync(beispielPfad, "utf8")) : undefined;

const ARBITRARY = "https://admin-shell.io/SMT/General/Arbitrary";

function eintraegeAus(...quellen: ReturnType<typeof einlesen>[]): Eintrag[] {
  return quellen.flatMap((q) =>
    q.submodels.map((s) => ({ datei: q.datei, submodel: s.submodel, conceptDescriptions: q.conceptDescriptions })),
  );
}

function bereichsInhalt(u: Umgebung): Element[] {
  const td = u.submodels![0];
  const bereiche = td.submodelElements!.find((e) => semantikSchluessel(e.semanticId) === BEREICHE_SEMANTIK)!;
  const liste = bereiche.value as Element[];
  expect(liste).toHaveLength(1);
  return liste[0].value as Element[];
}

function prop(idShort: string, sem: string, valueType = "xs:string", extra: Partial<Element> = {}): Element {
  return {
    modelType: "Property",
    idShort,
    valueType,
    semanticId: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: sem }] },
    ...extra,
  };
}

function cd(id: string): ConceptDescription {
  return { modelType: "ConceptDescription", id };
}

function datei(name: string, submodels: Submodel[], cds: ConceptDescription[]) {
  return einlesen(name, JSON.stringify({ submodels, conceptDescriptions: cds }));
}

function sm(idShort: string, elemente: Element[]): Submodel {
  return { modelType: "Submodel", id: `urn:${idShort}`, idShort, submodelElements: elemente };
}

describe.skipIf(!beispiel)("mit AAS-6455", () => {
  // Der Rumpf läuft beim Einsammeln auch beim Überspringen; mit leerer Quelle bleiben die Tests sichtbar.
  const quelle = beispiel ?? { datei: "", submodels: [], conceptDescriptions: [] };
  const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(quelle));
  const inhalt = bereichsInhalt(umgebung);

  it("liest das Beispiel als ein Submodel mit 123 Blättern", () => {
    expect(quelle.submodels).toHaveLength(1);
    expect(quelle.submodels[0].elementzahl).toBe(123);
  });

  it("legt genau einen Bereich ohne Platzhalter an", () => {
    expect(inhalt.some((e) => semantikSchluessel(e.semanticId) === ARBITRARY)).toBe(false);
    expect(inhalt).toHaveLength(123);
    expect(bericht.uebernommen).toHaveLength(123);
    expect(bericht.gelesen).toBe(123);
  });

  it("nimmt Vorlagen-Semantiken auf, ohne ihre ConceptDescription zu verdoppeln", () => {
    const vorlagenSemantik = ["0173-1#02-AAO676#005", "0173-1#02-AAO677#004", "0173-1#02-AAW338#003"];
    expect(bericht.cdAusVorlage.map((f) => f.semanticId).sort()).toEqual(vorlagenSemantik);
    for (const s of vorlagenSemantik) {
      expect(inhalt.some((e) => semantikSchluessel(e.semanticId) === s)).toBe(true);
      expect(umgebung.conceptDescriptions!.filter((c) => c.id === s)).toHaveLength(1);
    }
  });

  it("enthält jede ConceptDescription-id nur einmal", () => {
    const ids = umgebung.conceptDescriptions!.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("macht jedes Element optional und leer", () => {
    for (const e of inhalt) {
      const k = e.qualifiers!.filter((q) => q.type === "SMT/Cardinality");
      expect(k).toEqual([expect.objectContaining({ value: "ZeroToOne" })]);
      expect(e.value).toBeUndefined();
    }
  });

  it("hat zu jeder semanticId im Bereich eine ConceptDescription, aber nicht die der Klasse", () => {
    const ids = new Set(umgebung.conceptDescriptions!.map((c) => c.id));
    for (const e of inhalt) expect(ids.has(e.semanticId!.keys[0].value)).toBe(true);
    expect(ids.has("0173-1---BASIC_1_1#01-ABT934#019")).toBe(false);
    expect(bericht.neueCDs).toBe(120);
    expect(bericht.fehlendeCDs).toEqual([]);
    expect(umgebung.conceptDescriptions).toHaveLength(vorlage.conceptDescriptions!.length + 120);
    expect(umgebung.conceptDescriptions).toHaveLength(148);
  });

  it("hat eindeutige idShorts", () => {
    const namen = inhalt.map((e) => e.idShort);
    expect(new Set(namen).size).toBe(namen.length);
  });

  it("trägt in jedem idShort die ECLASS-Version seiner semanticId", () => {
    for (const e of inhalt) {
      const version = e.semanticId!.keys[0].value.slice(-3);
      expect(e.idShort).toMatch(new RegExp(`_v${version}$`));
    }
    expect(inhalt.map((e) => e.idShort)).toContain("Manufacturer_name_v004");
  });

  it("lässt IDs und alle anderen Teile der Vorlage unverändert", () => {
    const vorher = vorlage.submodels![0];
    const nachher = umgebung.submodels![0];
    expect(umgebung.assetAdministrationShells).toEqual(vorlage.assetAdministrationShells);
    for (const feld of ["id", "idShort", "kind", "semanticId", "administration"]) {
      expect(nachher[feld]).toEqual(vorher[feld]);
    }
    const ohneBereiche = (s: Submodel) =>
      s.submodelElements!.filter((e) => semantikSchluessel(e.semanticId) !== BEREICHE_SEMANTIK);
    expect(ohneBereiche(nachher)).toEqual(ohneBereiche(vorher));
    expect(umgebung.conceptDescriptions!.slice(0, vorlage.conceptDescriptions!.length)).toEqual(
      vorlage.conceptDescriptions,
    );
  });

  it("verändert die Vorlage selbst nicht", () => {
    expect(JSON.stringify(vorlage)).toBe(JSON.stringify(JSON.parse(vorlageText)));
  });

  it("übernimmt die Bereichshülle der Vorlage", () => {
    const td = umgebung.submodels![0];
    const bereiche = td.submodelElements!.find((e) => semantikSchluessel(e.semanticId) === BEREICHE_SEMANTIK)!;
    const bereich = (bereiche.value as Element[])[0];
    expect(semantikSchluessel(bereich.semanticId)).toBe("0173-1#02-ABL358#002/0173-1#01-AHX773#002");
    expect(bereich.modelType).toBe("SubmodelElementCollection");
  });
});

describe("Merge-Regeln", () => {
  it("führt Überschneidungen zweier Dateien zusammen, erster Treffer gewinnt", () => {
    const a = datei("a.json", [sm("A", [prop("Breite", "X#1"), prop("Hoehe", "X#2")])], [cd("X#1"), cd("X#2")]);
    const b = datei("b.json", [sm("B", [prop("Width", "X#1"), prop("Tiefe", "X#3")])], [cd("X#1"), cd("X#3")]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(a, b));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["Breite", "Hoehe", "Tiefe"]);
    expect(bericht.mehrfach).toEqual([
      { idShort: "Breite", semanticId: "X#1", quelle: "a.json › A", weitere: ["b.json › B"] },
    ]);
    expect(umgebung.conceptDescriptions!.filter((c) => c.id === "X#1")).toHaveLength(1);
  });

  it("zählt Mehrfaches je Eigenschaft, und die Bilanz geht auf", () => {
    const d = datei(
      "d.json",
      [
        sm("A", [prop("W", "X#1"), prop("H", "X#2")]),
        sm("B", [prop("W", "X#1"), prop("H", "X#2", "xs:int")]),
        sm("C", [prop("W", "X#1"), prop("Ohne", "")]),
      ],
      [],
    );
    d.submodels[2].submodel.submodelElements![1].semanticId = undefined;
    const { bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bericht.mehrfach).toEqual([
      { idShort: "W", semanticId: "X#1", quelle: "d.json › A", weitere: ["d.json › B", "d.json › C"] },
    ]);
    const weitere = bericht.mehrfach.reduce((s, m) => s + m.weitere.length, 0);
    expect(bericht.gelesen).toBe(
      bericht.uebernommen.length + weitere + bericht.konflikte.length + bericht.ohneSemanticId.length,
    );
    expect([bericht.uebernommen.length, weitere, bericht.konflikte.length, bericht.ohneSemanticId.length]).toEqual([
      2, 2, 1, 1,
    ]);
  });

  it("liest mehrere Submodels aus einer Datei", () => {
    const d = datei("d.json", [sm("A", [prop("P1", "X#1")]), sm("B", [prop("P2", "X#2")])], [cd("X#1"), cd("X#2")]);
    expect(d.submodels.map((s) => s.name)).toEqual(["A", "B"]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bericht.submodelZahl).toBe(2);
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["P1", "P2"]);
  });

  it("behandelt dieselbe IRDI in anderer Version als eigene Eigenschaft", () => {
    const d = datei(
      "d.json",
      [sm("A", [prop("Temp", "0173-1#02-BAA039#011"), prop("Temp", "0173-1#02-BAA039#012")])],
      [],
    );
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["Temp_v011", "Temp_v012"]);
    expect(bericht.umbenannt).toEqual([]);
    expect(bericht.fehlendeCDs).toHaveLength(2);
  });

  it("zählt hoch, wenn zwei Eigenschaften gleichen Namen und gleiche Version haben", () => {
    const d = datei("d.json", [sm("A", [prop("X", "0173-1#02-AAA111#004"), prop("X", "0173-1#02-BBB222#004")])], []);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["X_v004", "X_v004_2"]);
    expect(bericht.umbenannt).toEqual([
      { idShort: "X_v004_2", von: "X", semanticId: "0173-1#02-BBB222#004", quelle: "d.json › A" },
    ]);
  });

  it("hängt ohne ECLASS-Version nichts an und verdoppelt ein vorhandenes Suffix nicht", () => {
    const d = datei(
      "d.json",
      [sm("A", [prop("Url", "https://example.com/merkmal/1"), prop("Schon_v005", "0173-1#02-CCC333#005")])],
      [],
    );
    const { umgebung } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["Url", "Schon_v005"]);
  });

  it("meldet abweichende Typen derselben semanticId als Konflikt", () => {
    const d = datei("d.json", [sm("A", [prop("P", "X#1", "xs:float")]), sm("B", [prop("P", "X#1", "xs:string")])], []);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung)).toHaveLength(1);
    expect(bericht.konflikte).toEqual([
      expect.objectContaining({ erwartet: "Property (xs:float)", gefunden: "Property (xs:string)" }),
    ]);
    expect(bericht.mehrfach).toEqual([]);
  });

  it("flacht verschachtelte Quellen ab und entfernt Instanzwerte", () => {
    const smc: Element = {
      modelType: "SubmodelElementCollection",
      idShort: "Gruppe",
      semanticId: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: "G#1" }] },
      value: [prop("P", "X#1", "xs:int", { value: "5", valueId: { type: "ExternalReference", keys: [] } })],
    };
    const d = datei("d.json", [sm("A", [smc])], [cd("X#1"), cd("G#1")]);
    const { umgebung } = zusammenfuehren(vorlage, eintraegeAus(d));
    const inhalt = bereichsInhalt(umgebung);
    expect(inhalt.map((e) => e.idShort)).toEqual(["P"]);
    expect(inhalt[0].value).toBeUndefined();
    expect(inhalt[0].valueId).toBeUndefined();
    expect(umgebung.conceptDescriptions!.some((c) => c.id === "G#1")).toBe(false);
  });

  it("übernimmt keine CD, die die Vorlage schon führt", () => {
    // Die Section-CD steht in der Vorlage, ohne dass ein Element außerhalb der Bereiche sie benutzt.
    const section = "https://admin-shell.io//IDTA/TechnicalData/Section/1/0";
    const d = datei("d.json", [sm("A", [prop("S", section)])], [cd(section)]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["S"]);
    expect(umgebung.conceptDescriptions!.filter((c) => c.id === section)).toHaveLength(1);
    expect(bericht.neueCDs).toBe(0);
  });

  it("nimmt ein Element der Vorlage erneut auf und behält deren ConceptDescription", () => {
    const id = "0173-1#02-AAO677#004";
    const fremd: ConceptDescription = { modelType: "ConceptDescription", id, idShort: "AusDerQuelle" };
    const d = datei("d.json", [sm("A", [prop("Manufacturer_name", id)])], [fremd]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["Manufacturer_name_v004"]);
    const treffer = umgebung.conceptDescriptions!.filter((c) => c.id === id);
    expect(treffer).toEqual([vorlage.conceptDescriptions!.find((c) => c.id === id)]);
    expect(bericht.cdAusVorlage.map((f) => f.idShort)).toEqual(["Manufacturer_name_v004"]);
    expect(bericht.neueCDs).toBe(0);
  });

  it("legt eine CD nur einmal an, wenn zwei semanticIds auf dieselbe id zeigen", () => {
    // Zwei Elemente, zwei Merge-Schlüssel, aber derselbe letzte Schlüssel und damit dieselbe CD.
    const zweiteilig = prop("Zweiteilig", "X#1");
    zweiteilig.semanticId!.keys.unshift({ type: "GlobalReference", value: "Block#1" });
    const d = datei("d.json", [sm("A", [prop("Einfach", "X#1"), zweiteilig])], [cd("X#1")]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d));
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["Einfach", "Zweiteilig"]);
    expect(umgebung.conceptDescriptions!.filter((c) => c.id === "X#1")).toHaveLength(1);
    expect(bericht.neueCDs).toBe(1);
  });

  it("ersetzt eine vorhandene Kardinalität statt sie zu verdoppeln", () => {
    const mitQualifier = prop("P", "X#1", "xs:string", {
      qualifiers: [
        { type: "SMT/Cardinality", valueType: "xs:string", value: "One" },
        { type: "Andere", valueType: "xs:string", value: "bleibt" },
      ],
    });
    const { umgebung } = zusammenfuehren(vorlage, eintraegeAus(datei("d.json", [sm("A", [mitQualifier])], [])));
    expect(bereichsInhalt(umgebung)[0].qualifiers!.map((q) => `${q.type}=${q.value}`)).toEqual([
      "Andere=bleibt",
      "SMT/Cardinality=ZeroToOne",
    ]);
  });

  it("lässt Elemente ohne semanticId weg und nennt sie", () => {
    const ohne: Element = { modelType: "Property", idShort: "Frei", valueType: "xs:string" };
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(datei("d.json", [sm("A", [ohne])], [])));
    expect(bereichsInhalt(umgebung)).toEqual([]);
    expect(bericht.ohneSemanticId.map((f) => f.idShort)).toEqual(["Frei"]);
  });

  it("vergibt einen Namen, wenn ein Blatt aus einer Liste keinen idShort hat", () => {
    const { idShort: _weg, ...ohneName } = prop("x", "X#1");
    const sml: Element = { modelType: "SubmodelElementList", idShort: "L", value: [ohneName] };
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(datei("d.json", [sm("A", [sml])], [])));
    expect(bereichsInhalt(umgebung)[0].idShort).toBe("Eigenschaft");
    expect(bericht.umbenannt).toHaveLength(1);
  });

  it("meldet idShorts, die gegen die AAS-Regel verstoßen", () => {
    const { bericht } = zusammenfuehren(vorlage, eintraegeAus(datei("d.json", [sm("A", [prop("1abc", "X#1"), prop("mit-strich", "X#2"), prop("gut_1", "X#3")])], [])));
    expect(bericht.ungueltigeIdShorts.map((f) => f.idShort)).toEqual(["1abc", "mit-strich"]);
  });

  it("ohne Auswahl bleibt der Bereich leer, die Platzhalter sind trotzdem weg", () => {
    const { umgebung } = zusammenfuehren(vorlage, []);
    expect(bereichsInhalt(umgebung)).toEqual([]);
  });
});

describe("einlesen", () => {
  it("meldet kaputtes JSON mit Dateinamen", () => {
    expect(() => einlesen("kaputt.json", "{ nein")).toThrow(EinleseFehler);
    expect(() => einlesen("kaputt.json", "{ nein")).toThrow(/kaputt\.json: kein gültiges JSON/);
  });

  it("meldet eine Datei ohne Submodels", () => {
    expect(() => einlesen("leer.json", JSON.stringify({ conceptDescriptions: [] }))).toThrow(/enthält keine Submodels/);
    expect(() => einlesen("liste.json", "[]")).toThrow(/JSON-Objekt/);
  });

  it("nimmt auch ein einzelnes Submodel an", () => {
    const q = einlesen("sm.json", JSON.stringify(sm("Solo", [prop("P", "X#1")])));
    expect(q.submodels.map((s) => s.name)).toEqual(["Solo"]);
  });
});
