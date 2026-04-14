# Neutron DB

A simple JSON database for TypeScript projects with both synchronous and asynchronous implementations.

## How to use

The database is initialized with a schema-shaped object. `neutron-db` does not publicly export `Schema` or `DbObject`; TypeScript's structural typing means your own local types work as long as they match the expected shape.

One valid schema shape is:

```ts
interface Schema {
  tables: string[]; // names of the tables
  dbname: string; // base name of the JSON database file
  oneIndexed?: boolean; // if true, id generation starts at 1 instead of 0
  compressedJson?: boolean; // if true, the database file is written on a single line
  writeDebounceMs?: number; // async only: debounce delay before persisting changes
  autoSaveIntervalMs?: number; // async only: periodic flush interval
  location: string; // path to the database directory or exact JSON file
}
```

Stored rows only need an `id: number` field. For example:

```ts
interface DbObject {
  id: number;
}
```

`location` can be either:

- a directory path, in which case the database file is created as `dbName.json`
- an exact file path, in which case that file is created directly

The library creates the directory and the database file automatically if they do not exist.

## Usage

### Sync database

```ts
import path from 'path';
import { Database } from 'neutron-db';

interface AppUser {
  id: number;
  name: string;
}

const db = new Database({
  tables: ['users', 'posts'],
  dbname: 'app-data',
  location: path.join(__dirname, 'data'),
  oneIndexed: true,
  compressedJson: false,
});

const alice = db.insert<AppUser>({ id: -1, name: 'Alice' }, 'users');
const users = db.getAll<AppUser>('users');
```

### Async database

```ts
import path from 'path';
import { AsyncDatabase } from 'neutron-db';

interface AppUser {
  id: number;
  name: string;
}

const db = await AsyncDatabase.create({
  tables: ['users', 'posts'],
  dbname: 'app-data',
  location: path.join(__dirname, 'data'),
  oneIndexed: true,
  compressedJson: false,
  writeDebounceMs: 150,
  autoSaveIntervalMs: 5000,
});

const alice = await db.insert<AppUser>({ id: -1, name: 'Alice' }, 'users');
const users = await db.getAll<AppUser>('users');
```

## API

### Sync `Database`

```ts
insert<T extends DbObject>(row: T, tablename: string): T
update<T extends DbObject>(row: T, tablename: string): T
getAll<T extends DbObject>(tablename: string): T[]
get<T extends DbObject>(id: number, tablename: string): T | null
delete(id: number, tablename: string): void
clear(tablename: string): void
count(tablename: string): number
```

### Async `AsyncDatabase`

```ts
static create(schema: Schema): Promise<AsyncDatabase>
insert<T extends DbObject>(row: T, tablename: string): Promise<T>
update<T extends DbObject>(row: T, tablename: string): Promise<T>
getAll<T extends DbObject>(tablename: string): Promise<T[]>
get<T extends DbObject>(id: number, tablename: string): Promise<T | null>
delete(id: number, tablename: string): Promise<void>
clear(tablename: string): Promise<void>
count(tablename: string): Promise<number>
dispose(): Promise<void>
```

## Notes

- The sync implementation performs immediate file writes.
- The async implementation caches data in memory and flushes changes to disk with debounce and auto-save support.
- Call `dispose()` on `AsyncDatabase` to flush any pending writes and stop internal timers.
- The async implementation does not automatically reload changes made to the JSON file by external processes.
- Table names must be declared in the schema.
- Duplicate IDs are rejected when explicitly provided.
- The file and parent directory are created automatically if needed.

---

Heavily inspired by [electron-db](https://github.com/alexiusacademia/electron-db)
