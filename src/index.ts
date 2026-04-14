export { AsyncDatabase } from './async';

import { Tables, DbObject, Schema } from './types';

import path = require('path');
import fs = require('fs');

export class Database {
  private readonly schema: Schema;
  private readonly dbpath: string;
  private readonly dbdirectory: string;

  constructor(schema: Schema) {
    this.schema = schema;
    this.validateSchema();

    const normalizedLocation = path.normalize(schema.location);
    const locationExists = fs.existsSync(normalizedLocation);
    const locationStats = locationExists ? fs.lstatSync(normalizedLocation) : undefined;
    const databaseFileName = schema.dbname.trim().endsWith('.json') ? schema.dbname.trim() : `${schema.dbname.trim()}.json`;

    if (locationExists && locationStats?.isDirectory()) {
      this.dbdirectory = normalizedLocation;
      this.dbpath = path.join(this.dbdirectory, databaseFileName);
    } else if (locationExists && locationStats?.isFile()) {
      this.dbpath = normalizedLocation;
      this.dbdirectory = path.dirname(this.dbpath);
    } else {
      const locationExt = path.extname(normalizedLocation);
      if (locationExt === '') {
        this.dbdirectory = normalizedLocation;
        this.dbpath = path.join(this.dbdirectory, databaseFileName);
      } else {
        this.dbpath = normalizedLocation;
        this.dbdirectory = path.dirname(this.dbpath);
      }
    }

    this.initdb();
  }

  //////////////////////////////////////////
  //////////////////////////////////////////

  private dbExists(): boolean {
    return fs.existsSync(this.dbpath);
  }

  private tableExists(table: string, db: Tables): boolean {
    return this.schema.tables.includes(table) && Object.prototype.hasOwnProperty.call(db, table);
  }

  private validateSchema(): void {
    if (!this.schema.location || this.schema.location.trim() === '') {
      throw new Error('Database location not provided!');
    }

    if (!this.schema.dbname || this.schema.dbname.trim() === '') {
      throw new Error('Database name not provided!');
    }

    if (!Array.isArray(this.schema.tables) || this.schema.tables.length === 0) {
      throw new Error('Database schema must include at least one table.');
    }

    for (const table of this.schema.tables) {
      if (typeof table !== 'string' || table.trim() === '') {
        throw new Error('Table names must be non-empty strings.');
      }
    }
  }

  private initdb(): boolean {
    if (!fs.existsSync(this.dbdirectory)) {
      fs.mkdirSync(this.dbdirectory, { recursive: true });
    }

    if (this.dbExists()) {
      return false;
    } else {
      try {
        const database: Tables = {};

        this.schema.tables.forEach((table) => {
          database[table] = [];
        });

        const jsondb = JSON.stringify(database, null, 2);
        fs.writeFileSync(this.dbpath, jsondb, 'utf8');
        return true;
      } catch (err: unknown) {
        throw new Error(`Error writing object. ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
    }
  }

  private loadDatabase(): Tables {
    try {
      const json = fs.readFileSync(this.dbpath, 'utf8');
      return JSON.parse(json) as Tables;
    } catch (err: unknown) {
      throw new Error(`Error reading database. ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }

  private saveDatabase(database: Tables): void {
    try {
      let jsondb = '';
      if (this.schema.compressedJson) {
        jsondb = JSON.stringify(database, null, 0);
      } else {
        jsondb = JSON.stringify(database, null, 2);
      }

      fs.writeFileSync(this.dbpath, jsondb, 'utf8');
    } catch (err: unknown) {
      throw new Error(`Error writing object. ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }

  private getMaxId<T extends DbObject>(table: T[]): number | null {
    return table.length > 0 ? Math.max(...table.map((c) => c.id)) : null;
  }

  //////////////////////////////////////////
  //////////////////////////////////////////

  public insert<T extends DbObject>(row: T, tablename: string): T {
    const database = this.loadDatabase();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const table = database[tablename];

    if (row.id !== undefined && row.id !== null && row.id !== -1) {
      const existingRow = table.find((existingRow) => existingRow.id === row.id);
      if (existingRow) {
        throw new Error(`Row with id ${row.id} already exists in table "${tablename}"!`);
      }
    } else {
      const maxId = this.getMaxId(table);
      row.id = maxId === null ? (this.schema.oneIndexed ? 1 : 0) : maxId + 1;
    }

    table.push(row);
    database[tablename] = table;
    this.saveDatabase(database);

    return row;
  }

  public getAll<T extends DbObject>(tablename: string): T[] {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      try {
        const table = database[tablename];

        return table as T[];
      } catch (err: unknown) {
        throw new Error(`Error reading table. ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }

  public get<T extends DbObject>(id: number, tablename: string): T | null {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      const table = database[tablename];

      const rows = table.filter((row) => row.id === id);
      if (rows.length > 1) {
        throw new Error(`More than one row with id ${id} found!`);
      } else if (rows.length === 1) {
        return rows[0] as T;
      } else {
        return null;
      }
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }

  public delete(id: number, tablename: string): void {
    const database = this.loadDatabase();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const table = database[tablename];
    const matchingRows = table.filter((row) => row.id === id);

    if (matchingRows.length > 1) {
      throw new Error(`More than one row with id ${id} found!`);
    } else if (matchingRows.length === 0) {
      throw new Error(`Row with id ${id} not found in table "${tablename}"!`);
    }

    const index = table.indexOf(matchingRows[0]);
    table.splice(index, 1);
    database[tablename] = table;
    this.saveDatabase(database);
  }

  public update<T extends DbObject>(row: T, tablename: string): T {
    if (row.id === undefined || row.id === null) {
      throw new Error('Row id must be provided for update.');
    }

    const database = this.loadDatabase();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const table = database[tablename];
    const matchingRows = table.filter((existingRow) => existingRow.id === row.id);

    if (matchingRows.length > 1) {
      throw new Error(`More than one row with id ${row.id} found!`);
    } else if (matchingRows.length === 0) {
      throw new Error(`Row with id ${row.id} not found!`);
    }

    const index = table.indexOf(matchingRows[0]);
    table[index] = row;
    database[tablename] = table;
    this.saveDatabase(database);

    return table[index] as T;
  }

  public clear(tablename: string): void {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      database[tablename] = [];
      this.saveDatabase(database);
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }

  public count(tablename: string): number {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      return database[tablename].length;
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }
}
