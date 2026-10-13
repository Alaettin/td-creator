import { describe, expect, it } from "vitest";
import { zusammenfuehren } from "../src/merge/zusammenfuehren";
import { semantikSchluessel } from "../src/merge/sammeln";
import type { Element, Submodel } from "../src/merge/typen";
import { beispiel, bereichsInhalt, block, cd, datei, eintraegeAus, leereQuelle, prop, sm, vorlage } from "./hilfen";

const ADVANCED = { modus: "advanced" } as const;
const lapp = beispiel("AAS-Lapp.json");
const flach = beispiel("AAS-6455.json");

const istBlock = (e: Element) => e.modelType === "SubmodelElementCollection";
const kinder = (e: Element) => (e.value as Element[] | undefined) ?? [];

/** Alle Orte als "Pfad aus Block-semanticIds > semanticId", für Blöcke und Blätter. */
function orte(elemente: Element[], pfad = ""): string[] {
  return elemente.flatMap((e) => {
    const ort = `${pfad} > ${semantikSchluessel(e.semanticId)}`;
    return istBlock(e) ? [ort, ...orte(kinder(e), ort)] : [ort];
  });
}

function alleElemente(elemente: Element[]): Element[] {
  return elemente.flatMap((e) => (istBlock(e) ? [e, ...alleElemente(kinder(e))] : [e]));
}

function behaelter(elemente: Element[]): Element[][] {
  return [elemente, ...elemente.filter(istBlock).flatMap((e) => behaelter(kinder(e)))];
}

describe.skipIf(!lapp)("mit AAS-Lapp (ECLASS Advanced)", () => {
  const quelle = lapp ?? leereQuelle;
  const basic = zusammenfuehren(vorlage, eintraegeAus(quelle));
  const advanced = zusammenfuehren(vorlage, eintraegeAus(quelle), ADVANCED);
  const baum = bereichsInhalt(advanced.umgebung);

  it("Basic: 320 Eigenschaften flach, kein Block", () => {
    const inhalt = bereichsInhalt(basic.umgebung);
    expect(inhalt).toHaveLength(320);
    expect(inhalt.some(istBlock)).toBe(false);
    expect(basic.bericht.bloecke).toBe(0);
  });

  it("Advanced: 24 Blöcke und dieselben 320 Eigenschaften im Baum", () => {
    expect(advanced.bericht.bloecke).toBe(24);
    expect(alleElemente(baum).filter(istBlock)).toHaveLength(24);
    expect(alleElemente(baum).filter((e) => !istBlock(e))).toHaveLength(320);
    expect(advanced.bericht.uebernommen).toHaveLength(320);
  });

  it("übernimmt jeden Block und jede Eigenschaft genau an ihrem Ort in den Quellen", () => {
    const ausQuellen = new Set(quelle.submodels.flatMap((s) => orte(s.submodel.submodelElements ?? [])));
    const imErgebnis = orte(baum);
    expect(new Set(imErgebnis).size).toBe(imErgebnis.length);
    expect(new Set(imErgebnis)).toEqual(ausQuellen);
  });

  it("baut Identification mit Supplier, product_identifier und Manufacturer", () => {
    const identification = baum.find((e) => e.idShort === "Identification_v010")!;
    expect(kinder(identification).map((e) => e.idShort)).toEqual([
      "Supplier_v009",
      "product_identifier_v001",
      "Manufacturer_v010",
    ]);
    const manufacturer = kinder(identification).find((e) => e.idShort === "Manufacturer_v010")!;
    expect(kinder(manufacturer).map((e) => e.idShort)).toContain("Manufacturer_name_v002");
  });

  it("behält leere Blöcke, ohne leere value-Liste (AAS 3.0 verbietet value: [])", () => {
    const commercial = baum.find((e) => e.idShort === "Commercial_v009")!;
    expect(commercial).toBeDefined();
    expect("value" in commercial).toBe(false);
    expect(alleElemente(baum).filter((e) => Array.isArray(e.value) && e.value.length === 0)).toEqual([]);
  });

  it("hat je Behälter eindeutige semanticIds und idShorts, überall ZeroToOne und keine Werte", () => {
    for (const liste of behaelter(baum)) {
      const sems = liste.map((e) => semantikSchluessel(e.semanticId));
      const namen = liste.map((e) => e.idShort);
      expect(new Set(sems).size).toBe(sems.length);
      expect(new Set(namen).size).toBe(namen.length);
    }
    for (const e of alleElemente(baum)) {
      expect(e.qualifiers!.filter((q) => q.type === "SMT/Cardinality").map((q) => q.value)).toEqual(["ZeroToOne"]);
      if (!istBlock(e)) expect(e.value).toBeUndefined();
    }
  });

  it("übernimmt die 02-Teil-CD eines zusammengesetzten Blocks und meldet den fehlenden 01-Teil", () => {
    const ids = advanced.umgebung.conceptDescriptions!.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("0173-1#02-AAQ373#010");
    expect(ids).not.toContain("0173-1#02-AAQ373#010/0173-1#01-ADN198#010");
    expect(advanced.bericht.fehlendeCDs.map((f) => f.cdId)).toContain("0173-1#01-ADN198#010");
  });

  it("Bilanz geht auf", () => {
    const b = advanced.bericht;
    const weitere = b.mehrfach.reduce((s, m) => s + m.weitere.length, 0);
    expect(b.gelesen).toBe(b.uebernommen.length + weitere + b.konflikte.length + b.ohneSemanticId.length);
  });
});

describe.skipIf(!flach)("flache Quelle im Modus Advanced", () => {
  it("ergibt dasselbe wie Basic", () => {
    const e = eintraegeAus(flach ?? leereQuelle);
    expect(zusammenfuehren(vorlage, e, ADVANCED).umgebung).toEqual(zusammenfuehren(vorlage, e).umgebung);
  });
});

describe("Advanced-Regeln", () => {
  const ident = (k: Element[]) => block("Identification", "0173-1#01-ADN228#010", k);

  it("vereinigt gleiche Blöcke aus zwei Quellen", () => {
    const a = datei("a.json", [sm("A", [ident([prop("Name", "X#1")])])], []);
    const b = datei("b.json", [sm("B", [ident([prop("Name", "X#1"), prop("Marke", "X#2")])])], []);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(a, b), ADVANCED);
    const inhalt = bereichsInhalt(umgebung);
    expect(inhalt.map((e) => e.idShort)).toEqual(["Identification_v010"]);
    expect(kinder(inhalt[0]).map((e) => e.idShort)).toEqual(["Name", "Marke"]);
    expect(bericht.bloecke).toBe(1);
    expect(bericht.mehrfach).toEqual([
      {
        idShort: "Identification_v010.Name",
        semanticId: "X#1",
        quelle: "a.json › A",
        weitere: ["b.json › B"],
      },
    ]);
  });

  it("hält dieselbe Eigenschaft an zwei Orten in Advanced getrennt, in Basic einmal", () => {
    const d = datei("d.json", [sm("A", [prop("Name", "X#1"), ident([prop("Name", "X#1")])])], []);
    const advanced = bereichsInhalt(zusammenfuehren(vorlage, eintraegeAus(d), ADVANCED).umgebung);
    expect(advanced.map((e) => e.idShort)).toEqual(["Name", "Identification_v010"]);
    expect(kinder(advanced[1]).map((e) => e.idShort)).toEqual(["Name"]);
    const basic = bereichsInhalt(zusammenfuehren(vorlage, eintraegeAus(d)).umgebung);
    expect(basic.map((e) => e.idShort)).toEqual(["Name"]);
  });

  it("vergibt idShorts je Ebene: gleicher Name in zwei Blöcken bleibt ohne Zähler", () => {
    const d = datei(
      "d.json",
      [sm("A", [block("Lieferant", "B#1", [prop("Name", "X#1")]), block("Hersteller", "B#2", [prop("Name", "X#2")])])],
      [],
    );
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d), ADVANCED);
    expect(bereichsInhalt(umgebung).flatMap((b) => kinder(b).map((e) => e.idShort))).toEqual(["Name", "Name"]);
    expect(bericht.umbenannt).toEqual([]);
  });

  it("meldet Block gegen Eigenschaft mit gleicher semanticId als Konflikt, und die Bilanz geht auf", () => {
    const d = datei("d.json", [sm("A", [prop("X", "S#1")]), sm("B", [block("X", "S#1", [prop("Y", "Y#1")])])], []);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d), ADVANCED);
    expect(bereichsInhalt(umgebung).map((e) => e.modelType)).toEqual(["Property"]);
    expect(bericht.konflikte).toEqual([
      expect.objectContaining({ erwartet: "Property (xs:string)", gefunden: "SubmodelElementCollection" }),
    ]);
    expect(bericht.gelesen).toBe(bericht.uebernommen.length + bericht.konflikte.length);
  });

  it("nimmt bei zusammengesetzter Block-id die vorhandenen Teil-CDs und meldet die fehlenden", () => {
    const zusammen = "0173-1#02-AAQ373#010/0173-1#01-ADN198#010";
    const d = datei("d.json", [sm("A", [block("Manufacturer", zusammen, [])])], [cd("0173-1#02-AAQ373#010")]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d), ADVANCED);
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["Manufacturer_v010"]);
    const ids = umgebung.conceptDescriptions!.map((c) => c.id);
    expect(ids).toContain("0173-1#02-AAQ373#010");
    expect(bericht.fehlendeCDs.map((f) => f.cdId)).toEqual(["0173-1#01-ADN198#010"]);
  });

  it("nimmt die CD unter der ganzen id, wenn es sie gibt", () => {
    const zusammen = "0173-1#02-AAQ373#010/0173-1#01-ADN198#010";
    const d = datei("d.json", [sm("A", [block("Manufacturer", zusammen, [])])], [cd(zusammen), cd("0173-1#02-AAQ373#010")]);
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(d), ADVANCED);
    const ids = umgebung.conceptDescriptions!.map((c) => c.id);
    expect(ids).toContain(zusammen);
    expect(ids).not.toContain("0173-1#02-AAQ373#010");
    expect(bericht.fehlendeCDs).toEqual([]);
  });

  it("löst einen Block ohne semanticId auf und meldet ihn", () => {
    const ohne: Element = { modelType: "SubmodelElementCollection", idShort: "Gruppe", value: [prop("P", "X#1")] };
    const { umgebung, bericht } = zusammenfuehren(vorlage, eintraegeAus(datei("d.json", [sm("A", [ohne])], [])), ADVANCED);
    expect(bereichsInhalt(umgebung).map((e) => e.idShort)).toEqual(["P"]);
    expect(bericht.aufgeloesteBloecke.map((f) => f.idShort)).toEqual(["Gruppe"]);
  });

  it("übernimmt eine Liste als Ganzes, ohne den Kindern idShorts zu geben", () => {
    const liste: Element = {
      modelType: "SubmodelElementList",
      idShort: "Liste",
      semanticId: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: "L#1" }] },
      value: [{ ...prop("x", "X#1", "xs:int", { value: "3" }), idShort: undefined }],
    };
    const quelle: Submodel = sm("A", [liste]);
    const { umgebung } = zusammenfuehren(vorlage, eintraegeAus(datei("d.json", [quelle], [])), ADVANCED);
    const [ergebnis] = bereichsInhalt(umgebung);
    expect(ergebnis.modelType).toBe("SubmodelElementList");
    expect(kinder(ergebnis)).toHaveLength(1);
    expect(kinder(ergebnis)[0].idShort).toBeUndefined();
    expect(kinder(ergebnis)[0].value).toBeUndefined();
  });
});
