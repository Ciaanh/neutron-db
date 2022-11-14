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
  location?: string;
}
