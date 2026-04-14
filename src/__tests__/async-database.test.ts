import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AsyncDatabase } from '../async';

describe('AsyncDatabase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutron-db-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  interface User {
    id: number;
    name: string;
  }

  it('creates a new database file under a directory location', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    expect(fs.existsSync(path.join(tempDir, 'testdb.json'))).toBe(true);
    expect(await db.count('users')).toBe(0);
  });

  it('creates a new database file when a file path location is provided', async () => {
    const fileLocation = path.join(tempDir, 'my-db.json');
    const db = await AsyncDatabase.create({
      location: fileLocation,
      dbname: 'ignored-name',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    expect(fs.existsSync(fileLocation)).toBe(true);
    expect(await db.count('users')).toBe(0);
    await expect(db.getAll('users')).resolves.toEqual([]);
  });

  it('inserts rows and auto-generates incremental ids', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      oneIndexed: false,
      writeDebounceMs: 0,
    });

    const alice = await db.insert({ id: -1, name: 'Alice' }, 'users');
    const bob = await db.insert({ id: -1, name: 'Bob' }, 'users');

    expect(alice.id).toBe(0);
    expect(bob.id).toBe(1);
    expect(await db.count('users')).toBe(2);
    expect(await db.get(0, 'users')).toMatchObject({ name: 'Alice' });
  });

  it('updates an existing row and persists the change', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const row = await db.insert<User>({ id: -1, name: 'Alice' }, 'users');
    const updatedRow = await db.update<User>({ id: row.id, name: 'Alice Updated' }, 'users');

    expect(updatedRow.name).toBe('Alice Updated');
    expect((await db.get<User>(row.id, 'users'))?.name).toBe('Alice Updated');
  });

  it('deletes a row and reduces the count', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const row = await db.insert({ id: -1, name: 'Alice' }, 'users');
    await db.delete(row.id, 'users');

    expect(await db.count('users')).toBe(0);
    expect(await db.get(row.id, 'users')).toBeNull();
  });

  it('flushes pending writes when disposed', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 100,
      autoSaveIntervalMs: 0,
    });

    const insertPromise = db.insert({ id: -1, name: 'Alice' }, 'users');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await db.dispose();

    await expect(insertPromise).resolves.toMatchObject({ name: 'Alice' });
    expect(await db.get(0, 'users')).toMatchObject({ name: 'Alice' });
  });

  it('throws when deleting a non-existing row', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    await expect(db.delete(42, 'users')).rejects.toThrow(/not found/i);
  });

  it('throws when a table does not exist', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    await expect(db.getAll('missing')).rejects.toThrow(/doesn't exist/i);
  });

  it('clears a table and persists the empty result', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    await db.insert({ id: -1, name: 'Alice' }, 'users');
    expect(await db.count('users')).toBe(1);
    await db.clear('users');
    expect(await db.count('users')).toBe(0);
    await expect(db.getAll('users')).resolves.toEqual([]);
  });

  it('uses oneIndexed when configured', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      oneIndexed: true,
      writeDebounceMs: 0,
    });

    const row = await db.insert({ id: -1, name: 'Alice' }, 'users');
    expect(row.id).toBe(1);
  });

  it('throws when inserting a duplicate explicit id', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    await db.insert({ id: 5, name: 'Custom' }, 'users');
    await expect(db.insert({ id: 5, name: 'Custom again' }, 'users')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('creates compressed JSON when configured', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      compressedJson: true,
      writeDebounceMs: 0,
    });

    await db.insert({ id: -1, name: 'Alice' }, 'users');
    await db.dispose();

    const content = await fs.promises.readFile(path.join(tempDir, 'testdb.json'), 'utf8');
    expect(content).not.toContain('\n');
    expect(content).toContain('{"users":[{"id":0,"name":"Alice"}]}');
  });

  it('throws when the schema location is missing', async () => {
    await expect(
      AsyncDatabase.create({
        location: '',
        dbname: 'testdb',
        tables: ['users'],
      }),
    ).rejects.toThrow(/Database location not provided/i);
  });

  it('throws when inserting into a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.insert({ id: -1, name: 'Alice' }, 'users')).rejects.toThrow(
      /Table "users" doesn't exist!/i,
    );
  });

  it('throws when getAll reads a table that is broken in memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};
    Object.defineProperty(anyDb.memoryDb, 'users', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
      configurable: true,
    });

    await expect(db.getAll('users')).rejects.toThrow(/Error reading table. boom/i);
  });

  it('throws when getAll is called for a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.getAll('users')).rejects.toThrow(/Table "users" doesn't exist!/i);
  });

  it('flushes pending writes via auto-save and resolves the pending promise', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 50,
      autoSaveIntervalMs: 10,
    });

    const first = db.insert({ id: -1, name: 'Alice' }, 'users');
    const second = db.insert({ id: -1, name: 'Bob' }, 'users');

    await Promise.all([first, second]);
    expect(await db.count('users')).toBe(2);
  });

  it('throws when inserting into a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.insert({ id: -1, name: 'Alice' }, 'users')).rejects.toThrow(
      /Table "users" doesn't exist!/i,
    );
  });

  it('rejects insert when underlying save fails during debounce', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 10,
      autoSaveIntervalMs: 0,
    });

    const anyDb = db as any;
    anyDb.saveDatabaseToDisk = jest.fn(async () => {
      throw new Error('boom');
    });

    await expect(db.insert({ id: -1, name: 'Alice' }, 'users')).rejects.toThrow(/boom/i);
  });

  it('throws when getting a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.get(0, 'users')).rejects.toThrow(/Table "users" doesn't exist!/i);
  });

  it('throws when deleting a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.delete(0, 'users')).rejects.toThrow(/Table "users" doesn't exist!/i);
  });

  it('throws when AsyncDatabase creation fails while writing the initial database', async () => {
    const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('boom'));

    await expect(
      AsyncDatabase.create({
        location: tempDir,
        dbname: 'testdb',
        tables: ['users'],
      }),
    ).rejects.toThrow(/Error creating database\./i);

    writeSpy.mockRestore();
  });

  it('throws when loading a database file missing a required table', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const filePath = path.join(tempDir, 'testdb.json');
    await fs.promises.writeFile(filePath, JSON.stringify({}), 'utf8');

    const anyDb = db as any;
    anyDb.memoryDb = null;

    await expect(db.getAll('users')).rejects.toThrow(/Database file missing required table: users/i);
  });

  it('throws when loading a database table that is not an array', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const filePath = path.join(tempDir, 'testdb.json');
    await fs.promises.writeFile(filePath, JSON.stringify({ users: { id: 0, name: 'Alice' } }), 'utf8');

    const anyDb = db as any;
    anyDb.memoryDb = null;

    await expect(db.getAll('users')).rejects.toThrow(/Database table users is not an array/i);
  });

  it('throws when reading a corrupted database file', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const filePath = path.join(tempDir, 'testdb.json');
    await fs.promises.writeFile(filePath, '{ invalid json', 'utf8');

    const anyDb = db as any;
    anyDb.memoryDb = null;

    await expect(db.count('users')).rejects.toThrow(/Error reading database\./i);
  });

  it('throws when saving the database fails during async insert', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('boom'));

    await expect(db.insert({ id: -1, name: 'Alice' }, 'users')).rejects.toThrow(/Error writing object\./i);

    writeSpy.mockRestore();
  });

  it('rejects dispose when save fails and there is a pending write', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 1000,
      autoSaveIntervalMs: 0,
    });

    const anyDb = db as any;
    anyDb.saveDatabaseToDisk = jest.fn(async () => {
      throw new Error('boom');
    });

    const insertPromise = db.insert({ id: -1, name: 'Alice' }, 'users');
    await new Promise((resolve) => setImmediate(resolve));

    await expect(db.dispose()).rejects.toThrow(/boom/i);
    await expect(insertPromise).rejects.toThrow(/boom/i);
  });

  it('throws when updating duplicate rows with the same id', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = { users: [{ id: 0, name: 'Alice' }, { id: 0, name: 'Bob' }] };

    await expect(db.update({ id: 0, name: 'Alice Updated' }, 'users')).rejects.toThrow(
      /More than one row with id 0 found/i,
    );
  });

  it('throws when updating a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.update({ id: 1, name: 'Alice' }, 'users')).rejects.toThrow(/doesn't exist/i);
  });

  it('throws when clearing a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.clear('users')).rejects.toThrow(/doesn't exist/i);
  });

  it('throws when counting a table that exists in schema but is missing from memory', async () => {
    const db = await AsyncDatabase.create({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      writeDebounceMs: 0,
    });

    const anyDb = db as any;
    anyDb.memoryDb = {};

    await expect(db.count('users')).rejects.toThrow(/doesn't exist/i);
  });
});
