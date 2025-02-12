import { Tables, DbObject, Schema } from './types';

import path = require('path');
import fs = require('fs');

export class Database {
  private readonly schema: Schema;
  private readonly dbpath: string;
  private readonly dbdirectory: string;

  constructor(schema: Schema) {
    this.schema = schema;

    if (!schema.location || schema.location === '') {
      throw new Error('Database location not provided!');
    }

    if (fs.existsSync(schema.location) && fs.lstatSync(schema.location).isDirectory()) {
      this.dbdirectory = path.normalize(schema.location);
      this.dbpath = path.join(this.dbdirectory, schema.dbname + '.json');
    } else if (fs.existsSync(schema.location) && fs.lstatSync(schema.location).isFile()) {
      this.dbpath = path.normalize(schema.location);
      this.dbdirectory = path.dirname(this.dbpath);
    } else {
      throw new Error('Database location not found!');
    }

    this.initdb();
  }

  //////////////////////////////////////////
  //////////////////////////////////////////

  private dbExists(): boolean {
    return fs.existsSync(this.dbpath);
  }

  private tableExists(table: string, db: Tables): boolean {
    return this.schema.tables.includes(table) && db.hasOwnProperty(table);
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
      } catch (err: any) {
        throw new Error(`Error writing object. ${err.toString()}`);
      }
    }
  }

  private loadDatabase(): Tables {
    try {
      const json = fs.readFileSync(this.dbpath, 'utf8');
      return JSON.parse(json) as Tables;
    } catch (err: any) {
      throw new Error(`Error reading database. ${err.toString()}`);
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
    } catch (err: any) {
      throw new Error(`Error writing object. ${err.toString()}`);
    }
  }

  private getMaxId<T extends DbObject>(table: T[]): number | null {
    return table.length > 0 ? Math.max(...table.map((c) => c.id)) : null;
  }

  //////////////////////////////////////////
  //////////////////////////////////////////

  public insert<T extends DbObject>(row: T, tablename: string): T {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      const table = database[tablename];

      if (row.id === undefined || row.id === null || row.id === -1) {
        const maxId = this.getMaxId(table);
        row.id = maxId === null ? (this.schema.oneIndexed ? 1 : 0) : maxId + 1;
      }

      table.push(row);

      database[tablename] = table;
      this.saveDatabase(database);
      return row;
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }

  public getAll<T extends DbObject>(tablename: string): T[] {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      try {
        const table = database[tablename];

        return table as T[];
      } catch (err: any) {
        throw new Error(`Error reading table. ${err.toString()}`);
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

    if (this.tableExists(tablename, database)) {
      const table = database[tablename];

      const rows = table.filter((row) => row.id === id);
      if (rows.length > 1) {
        throw new Error(`More than one row with id ${id} found!`);
      } else if (rows.length === 1) {
        const index = table.indexOf(rows[0]);
        table.splice(index, 1);
        database[tablename] = table;

        this.saveDatabase(database);
      }
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }

  public update<T extends DbObject>(row: T, tablename: string): T | null {
    const database = this.loadDatabase();

    if (this.tableExists(tablename, database)) {
      const table = database[tablename];

      const rows = table.filter((existingrow) => existingrow.id === row.id);
      if (rows.length > 1) {
        throw new Error(`More than one row with id ${row.id} found!`);
      } else if (rows.length === 1) {
        const index = table.indexOf(rows[0]);
        table[index] = row;
        database[tablename] = table;

        this.saveDatabase(database);

        const getRows = table.filter((existingrow) => existingrow.id === row.id);
        if (getRows.length > 1) {
          throw new Error(`More than one row with id ${row.id} found!`);
        } else if (getRows.length === 1) {
          return getRows[0] as T;
        } else {
          throw new Error(`Row with id ${row.id} not found!`);
        }
      } else {
        throw new Error(`Row with id ${row.id} not found!`);
      }
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
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
