export interface DbObject {
  id: number;
}

export interface Tables {
  [key: string]: DbObject[];
}

export interface Schema {
  tables: string[];
  dbname: string;
  oneIndexed?: boolean;
  compressedJson?: boolean;
  writeDebounceMs?: number;
  autoSaveIntervalMs?: number;
  location: string;
}
