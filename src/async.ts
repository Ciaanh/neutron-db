import { Tables, DbObject, Schema } from './types';
import fs = require('fs');
import path = require('path');

export class AsyncDatabase {
  private static readonly DEFAULT_WRITE_DEBOUNCE_MS = 150;
  private static readonly DEFAULT_AUTO_SAVE_INTERVAL_MS = 5000;

  public static async create(schema: Schema): Promise<AsyncDatabase> {
    if (!schema.location || schema.location === '') {
      throw new Error('Database location not provided!');
    }

    const normalizedLocation = path.normalize(schema.location);
    const locationExists = await AsyncDatabase.exists(normalizedLocation);
    const databaseFileName = schema.dbname.trim().endsWith('.json')
      ? schema.dbname.trim()
      : `${schema.dbname.trim()}.json`;

    let dbdirectory!: string;
    let dbpath!: string;

    if (locationExists) {
      const metadata = await fs.promises.lstat(normalizedLocation);
      if (metadata.isDirectory()) {
        dbdirectory = normalizedLocation;
        dbpath = path.join(dbdirectory, databaseFileName);
      } else if (metadata.isFile()) {
        dbpath = normalizedLocation;
      } else {
        throw new Error('Database location not found!');
      }
    } else {
      const locationExt = path.extname(normalizedLocation).toLowerCase();
      if (locationExt === '.json') {
        dbpath = normalizedLocation;
        dbdirectory = path.dirname(dbpath);
      } else {
        dbdirectory = normalizedLocation;
        dbpath = path.join(dbdirectory, databaseFileName);
      }

      if (!(await AsyncDatabase.exists(dbdirectory))) {
        await fs.promises.mkdir(dbdirectory, { recursive: true });
      }
    }

    const database = new AsyncDatabase(schema, dbpath);
    await database.initdb();
    database.startAutoSaveTimer();
    return database;
  }

  private readonly schema: Schema;
  private readonly dbpath: string;
  private readonly tableNames: Set<string>;
  private memoryDb: Tables | null = null;
  private tableIndexes = new Map<string, Map<number, DbObject>>();
  private dirty = false;
  private pendingWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWritePromise: Promise<void> | null = null;
  private pendingWriteResolvers: Array<() => void> = [];
  private pendingWriteRejecters: Array<(reason?: unknown) => void> = [];
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(schema: Schema, dbpath: string) {
    this.schema = schema;
    this.dbpath = dbpath;
    this.validateSchema();
    this.tableNames = new Set(schema.tables);
  }

  private static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async dbExists(): Promise<boolean> {
    return AsyncDatabase.exists(this.dbpath);
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

  private validateTableName(table: string): void {
    if (!this.tableNames.has(table)) {
      throw new Error(`Table "${table}" doesn't exist!`);
    }
  }

  private tableExists(table: string, db: Tables): boolean {
    return this.tableNames.has(table) && Object.prototype.hasOwnProperty.call(db, table);
  }

  private async ensureLoaded(): Promise<Tables> {
    if (this.memoryDb !== null) {
      return this.memoryDb;
    }

    this.memoryDb = await this.loadDatabaseFromDisk();
    this.rebuildIndexes();
    return this.memoryDb;
  }

  private rebuildIndexes(): void {
    if (!this.memoryDb) {
      return;
    }

    this.tableIndexes.clear();
    this.schema.tables.forEach((tableName) => {
      const rows = this.memoryDb?.[tableName] ?? [];
      const index = new Map<number, DbObject>();
      rows.forEach((row) => index.set(row.id, row));
      this.tableIndexes.set(tableName, index);
    });
  }

  private rebuildIndexForTable(tablename: string): void {
    if (!this.memoryDb || !this.memoryDb[tablename]) {
      return;
    }

    const index = new Map<number, DbObject>();
    this.memoryDb[tablename].forEach((row) => index.set(row.id, row));
    this.tableIndexes.set(tablename, index);
  }

  private async initdb(): Promise<void> {
    if (await this.dbExists()) {
      return;
    }

    try {
      const database: Tables = {};
      this.schema.tables.forEach((table) => {
        database[table] = [];
      });

      const jsondb = JSON.stringify(database, null, 2);
      await fs.promises.writeFile(this.dbpath, jsondb, 'utf8');
      this.memoryDb = database;
      this.rebuildIndexes();
    } catch (err: unknown) {
      throw new Error(`Error creating database. ${this.errorToString(err)}`, { cause: err });
    }
  }

  private validateLoadedDatabase(database: Tables): void {
    this.schema.tables.forEach((tableName) => {
      if (!Object.prototype.hasOwnProperty.call(database, tableName)) {
        throw new Error(`Database file missing required table: ${tableName}`);
      }
      if (!Array.isArray(database[tableName])) {
        throw new Error(`Database table ${tableName} is not an array`);
      }
    });
  }

  private async loadDatabaseFromDisk(): Promise<Tables> {
    try {
      const json = await fs.promises.readFile(this.dbpath, 'utf8');
      const database = JSON.parse(json) as Tables;
      this.validateLoadedDatabase(database);
      return database;
    } catch (err: unknown) {
      throw new Error(`Error reading database. ${this.errorToString(err)}`, { cause: err });
    }
  }

  private async saveDatabaseToDisk(database: Tables): Promise<void> {
    try {
      const jsondb = this.schema.compressedJson
        ? JSON.stringify(database, null, 0)
        : JSON.stringify(database, null, 2);

      await fs.promises.writeFile(this.dbpath, jsondb, 'utf8');
    } catch (err: unknown) {
      throw new Error(`Error writing object. ${this.errorToString(err)}`, { cause: err });
    }
  }

  private getMaxId<T extends DbObject>(table: T[]): number | null {
    return table.length > 0 ? Math.max(...table.map((c) => c.id)) : null;
  }

  private getWriteDebounceMs(): number {
    return this.schema.writeDebounceMs ?? AsyncDatabase.DEFAULT_WRITE_DEBOUNCE_MS;
  }

  private getAutoSaveIntervalMs(): number {
    return this.schema.autoSaveIntervalMs ?? AsyncDatabase.DEFAULT_AUTO_SAVE_INTERVAL_MS;
  }

  private errorToString(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private startAutoSaveTimer(): void {
    const intervalMs = this.getAutoSaveIntervalMs();
    if (intervalMs <= 0 || this.autoSaveTimer) {
      return;
    }

    this.autoSaveTimer = setInterval(() => {
      void this.flushDirtyToDisk();
    }, intervalMs);

    if (typeof this.autoSaveTimer?.unref === 'function') {
      this.autoSaveTimer.unref();
    }
  }

  private scheduleSave(): Promise<void> {
    this.dirty = true;
    const debounceMs = this.getWriteDebounceMs();

    if (debounceMs <= 0) {
      return this.flushDirtyToDisk();
    }

    if (!this.pendingWritePromise) {
      this.pendingWritePromise = new Promise<void>((resolve, reject) => {
        this.pendingWriteResolvers.push(resolve);
        this.pendingWriteRejecters.push(reject);
      });
    }

    if (this.pendingWriteTimer) {
      clearTimeout(this.pendingWriteTimer);
    }

    this.pendingWriteTimer = setTimeout(async () => {
      try {
        await this.flushDirtyToDisk();
        this.pendingWriteResolvers.forEach((resolve) => resolve());
      } catch (err) {
        this.pendingWriteRejecters.forEach((reject) => reject(err));
      } finally {
        this.pendingWriteTimer = null;
        this.pendingWritePromise = null;
        this.pendingWriteResolvers = [];
        this.pendingWriteRejecters = [];
      }
    }, debounceMs);

    if (typeof this.pendingWriteTimer?.unref === 'function') {
      this.pendingWriteTimer.unref();
    }

    return this.pendingWritePromise;
  }

  private async flushDirtyToDisk(): Promise<void> {
    if (!this.dirty || !this.memoryDb) {
      return;
    }

    await this.saveDatabaseToDisk(this.memoryDb);
    this.dirty = false;
  }

  public async dispose(): Promise<void> {
    if (this.pendingWriteTimer) {
      clearTimeout(this.pendingWriteTimer);
      this.pendingWriteTimer = null;
    }

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    try {
      await this.flushDirtyToDisk();
      if (this.pendingWritePromise) {
        this.pendingWriteResolvers.forEach((resolve) => resolve());
      }
    } catch (err) {
      if (this.pendingWritePromise) {
        this.pendingWriteRejecters.forEach((reject) => reject(err));
      }
      throw err;
    } finally {
      this.pendingWritePromise = null;
      this.pendingWriteResolvers = [];
      this.pendingWriteRejecters = [];
    }
  }

  public async insert<T extends DbObject>(row: T, tablename: string): Promise<T> {
    this.validateTableName(tablename);
    const database = await this.ensureLoaded();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const table = database[tablename];

    if (row.id === undefined || row.id === null || row.id === -1) {
      const maxId = this.getMaxId(table);
      row.id = maxId === null ? (this.schema.oneIndexed ? 1 : 0) : maxId + 1;
    } else {
      const existingRow = table.find((existingRow) => existingRow.id === row.id);
      if (existingRow) {
        throw new Error(`Row with id ${row.id} already exists in table "${tablename}"!`);
      }
    }

    table.push(row);
    database[tablename] = table;
    this.tableIndexes.get(tablename)?.set(row.id, row);
    await this.scheduleSave();
    return row;
  }

  public async getAll<T extends DbObject>(tablename: string): Promise<T[]> {
    this.validateTableName(tablename);
    const database = await this.ensureLoaded();

    if (this.tableExists(tablename, database)) {
      try {
        return database[tablename] as T[];
      } catch (err: unknown) {
        throw new Error(`Error reading table. ${this.errorToString(err)}`, { cause: err });
      }
    } else {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }
  }

  public async get<T extends DbObject>(id: number, tablename: string): Promise<T | null> {
    this.validateTableName(tablename);
    const database = await this.ensureLoaded();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const row = this.tableIndexes.get(tablename)?.get(id);
    return (row as T) ?? null;
  }

  public async delete(id: number, tablename: string): Promise<void> {
    this.validateTableName(tablename);
    const database = await this.ensureLoaded();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const table = database[tablename];
    const matchingRows = table.filter((row) => row.id === id);

    if (matchingRows.length > 1) {
      throw new Error(`More than one row with id ${id} found!`);
    }
    if (matchingRows.length === 0) {
      throw new Error(`Row with id ${id} not found in table "${tablename}"!`);
    }

    const index = table.indexOf(matchingRows[0]);
    table.splice(index, 1);
    database[tablename] = table;
    this.rebuildIndexForTable(tablename);
    await this.scheduleSave();
  }

  public async update<T extends DbObject>(row: T, tablename: string): Promise<T> {
    this.validateTableName(tablename);
    if (row.id === undefined || row.id === null) {
      throw new Error('Row id must be provided for update.');
    }

    const database = await this.ensureLoaded();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    const table = database[tablename];
    const matchingRows = table.filter((existingRow) => existingRow.id === row.id);

    if (matchingRows.length > 1) {
      throw new Error(`More than one row with id ${row.id} found!`);
    }
    if (matchingRows.length === 0) {
      throw new Error(`Row with id ${row.id} not found!`);
    }

    const index = table.indexOf(matchingRows[0]);
    table[index] = row;
    database[tablename] = table;
    this.tableIndexes.get(tablename)?.set(row.id, row);
    await this.scheduleSave();
    return table[index] as T;
  }

  public async clear(tablename: string): Promise<void> {
    this.validateTableName(tablename);
    const database = await this.ensureLoaded();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    database[tablename] = [];
    this.tableIndexes.set(tablename, new Map<number, DbObject>());
    await this.scheduleSave();
  }

  public async count(tablename: string): Promise<number> {
    this.validateTableName(tablename);
    const database = await this.ensureLoaded();

    if (!this.tableExists(tablename, database)) {
      throw new Error(`Table "${tablename}" doesn't exist!`);
    }

    return database[tablename].length;
  }
}
