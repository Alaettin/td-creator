// Schmale AAS-3.0-Typen: nur was der Merge liest. Alles Übrige wandert unverändert mit.

export interface LangString {
  language: string;
  text: string;
}

export interface Key {
  type: string;
  value: string;
}

export interface Reference {
  type: string;
  keys: Key[];
}

export interface Qualifier {
  type: string;
  valueType: string;
  value?: string;
  semanticId?: Reference;
  kind?: string;
}

export interface Element {
  modelType: string;
  idShort?: string;
  semanticId?: Reference;
  valueType?: string;
  qualifiers?: Qualifier[];
  displayName?: LangString[];
  value?: unknown;
  [weiteres: string]: unknown;
}

export interface Submodel {
  id: string;
  idShort?: string;
  kind?: string;
  semanticId?: Reference;
  displayName?: LangString[];
  submodelElements?: Element[];
  [weiteres: string]: unknown;
}

export interface ConceptDescription {
  id: string;
  idShort?: string;
  [weiteres: string]: unknown;
}

export interface Umgebung {
  assetAdministrationShells?: unknown[];
  submodels?: Submodel[];
  conceptDescriptions?: ConceptDescription[];
}
