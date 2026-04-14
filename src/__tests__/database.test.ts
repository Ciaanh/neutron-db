import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('fs', () => ({ __esModule: true, ...jest.requireActual('fs') }));

import { Database } from '../index';

describe('Database', () => {
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

  it('creates a new database file under a directory location', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(fs.existsSync(path.join(tempDir, 'testdb.json'))).toBe(true);
    expect(db.count('users')).toBe(0);
  });

  it('creates a new database file when a file path location is provided', () => {
    const fileLocation = path.join(tempDir, 'my-db.json');
    const db = new Database({
      location: fileLocation,
      dbname: 'ignored-name',
      tables: ['users'],
    });

    expect(fs.existsSync(fileLocation)).toBe(true);
    expect(db.count('users')).toBe(0);
    expect(() => db.getAll('users')).not.toThrow();
  });

  it('creates a new database file when the location directory does not yet exist', () => {
    const newDir = path.join(tempDir, 'new-db-dir');
    const db = new Database({
      location: newDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(fs.existsSync(path.join(newDir, 'testdb.json'))).toBe(true);
    expect(db.count('users')).toBe(0);
  });

  it('inserts rows and auto-generates incremental ids', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
      oneIndexed: false,
    });

    const alice = db.insert({ id: -1, name: 'Alice' }, 'users');
    const bob = db.insert({ id: -1, name: 'Bob' }, 'users');

    expect(alice.id).toBe(0);
    expect(bob.id).toBe(1);
    expect(db.count('users')).toBe(2);
    expect(db.get(0, 'users')).toMatchObject({ name: 'Alice' });
  });

  it('uses oneIndexed when configured', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'oneindexed',
      tables: ['users'],
      oneIndexed: true,
    });

    const first = db.insert({ id: -1, name: 'First' }, 'users');

    expect(first.id).toBe(1);
  });

  it('throws when inserting a duplicate explicit id', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    db.insert({ id: 5, name: 'Custom' }, 'users');

    expect(() => db.insert({ id: 5, name: 'Custom again' }, 'users')).toThrow(
      /already exists/i,
    );
  });

  it('updates an existing row and persists the change', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    const row = db.insert<User>({ id: -1, name: 'Alice' }, 'users');
    const updatedRow = db.update<User>({ id: row.id, name: 'Alice Updated' }, 'users');

    expect(updatedRow.name).toBe('Alice Updated');
    expect(db.get<User>(row.id, 'users')?.name).toBe('Alice Updated');
  });

  it('deletes a row and reduces the count', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    const row = db.insert({ id: -1, name: 'Alice' }, 'users');
    db.delete(row.id, 'users');

    expect(db.count('users')).toBe(0);
    expect(db.get(row.id, 'users')).toBeNull();
  });

  it('throws when deleting a non-existing row', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.delete(42, 'users')).toThrow(/not found/i);
  });

  it('throws when deleting a table that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.delete(0, 'missing')).toThrow(/Table "missing" doesn't exist!/i);
  });

  it('throws when a table does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.getAll('missing')).toThrow(/doesn't exist/i);
  });

  it('clears a table and persists the empty result', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    db.insert({ id: -1, name: 'Alice' }, 'users');
    expect(db.count('users')).toBe(1);
    db.clear('users');
    expect(db.count('users')).toBe(0);
    expect(db.getAll('users')).toEqual([]);
  });

  it('throws when the schema location is missing', () => {
    expect(
      () =>
        new Database({
          location: '',
          dbname: 'testdb',
          tables: ['users'],
        }),
    ).toThrow(/Database location not provided/i);
  });

  it('throws when the schema dbname is missing', () => {
    expect(
      () =>
        new Database({
          location: tempDir,
          dbname: ' ',
          tables: ['users'],
        }),
    ).toThrow(/Database name not provided/i);
  });

  it('throws when the schema tables list is invalid', () => {
    expect(
      () =>
        new Database({
          location: tempDir,
          dbname: 'testdb',
          tables: [],
        }),
    ).toThrow(/must include at least one table/i);
  });

  it('throws when a table name is invalid', () => {
    expect(
      () =>
        new Database({
          location: tempDir,
          dbname: 'testdb',
          tables: ['users', ' '],
        }),
    ).toThrow(/Table names must be non-empty strings/i);
  });

  it('throws when update row id is missing', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.update({ name: 'Alice' } as any, 'users')).toThrow(
      /Row id must be provided for update/i,
    );
  });

  it('throws when updating a row that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.update({ id: 42, name: 'Alice' }, 'users')).toThrow(
      /Row with id 42 not found/i,
    );
  });

  it('throws when deleting duplicate rows with same id', () => {
    const fileLocation = path.join(tempDir, 'testdb.json');
    fs.writeFileSync(
      fileLocation,
      JSON.stringify({ users: [{ id: 0, name: 'Alice' }, { id: 0, name: 'Bob' }] }, null, 2),
      'utf8',
    );

    const db = new Database({
      location: fileLocation,
      dbname: 'ignored-name',
      tables: ['users'],
    });

    expect(() => db.delete(0, 'users')).toThrow(/More than one row with id 0 found/i);
  });

  it('throws when clearing a table that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.clear('missing')).toThrow(/Table "missing" doesn't exist!/i);
  });

  it('throws when counting a table that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.count('missing')).toThrow(/Table "missing" doesn't exist!/i);
  });

  it('throws when getting a table that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.get(0, 'missing')).toThrow(/Table "missing" doesn't exist!/i);
  });

  it('throws when getting duplicate rows by id', () => {
    const fileLocation = path.join(tempDir, 'testdb.json');
    fs.writeFileSync(
      fileLocation,
      JSON.stringify({ users: [{ id: 0, name: 'Alice' }, { id: 0, name: 'Bob' }] }, null, 2),
      'utf8',
    );

    const db = new Database({
      location: fileLocation,
      dbname: 'ignored-name',
      tables: ['users'],
    });

    expect(() => db.get(0, 'users')).toThrow(/More than one row with id 0 found/i);
  });

  it('throws when updating a table that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.update({ id: 1, name: 'Alice' }, 'missing')).toThrow(
      /Table "missing" doesn't exist!/i,
    );
  });

  it('throws when updating duplicate rows with the same id', () => {
    const fileLocation = path.join(tempDir, 'testdb.json');
    fs.writeFileSync(
      fileLocation,
      JSON.stringify({ users: [{ id: 0, name: 'Alice' }, { id: 0, name: 'Bob' }] }, null, 2),
      'utf8',
    );

    const db = new Database({
      location: fileLocation,
      dbname: 'ignored-name',
      tables: ['users'],
    });

    expect(() => db.update({ id: 0, name: 'Alice Updated' }, 'users')).toThrow(
      /More than one row with id 0 found/i,
    );
  });

  it('throws when getAll fails while reading an invalid table', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    const anyDb = db as any;
    const fakeDatabase: any = {};
    Object.defineProperty(fakeDatabase, 'users', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
      configurable: true,
    });

    anyDb.loadDatabase = jest.fn(() => fakeDatabase);

    expect(() => db.getAll('users')).toThrow(/Error reading table\./i);
  });

  it('throws when inserting into a table that does not exist', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    expect(() => db.insert({ id: -1, name: 'Alice' }, 'missing')).toThrow(
      /Table "missing" doesn't exist!/i,
    );
  });

  it('creates compressed JSON when configured in sync database', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'compressed',
      tables: ['users'],
      compressedJson: true,
    });

    db.insert({ id: -1, name: 'Alice' }, 'users');

    const content = fs.readFileSync(path.join(tempDir, 'compressed.json'), 'utf8');
    expect(content).toBe('{"users":[{"id":0,"name":"Alice"}]}');
  });

  it('throws when initdb fails to write the database file', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(
      () =>
        new Database({
          location: tempDir,
          dbname: 'testdb',
          tables: ['users'],
        }),
    ).toThrow(/Error writing object\./i);

    writeSpy.mockRestore();
  });

  it('throws when saving the database fails during insert', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(() => db.insert({ id: -1, name: 'Alice' }, 'users')).toThrow(/Error writing object\./i);

    writeSpy.mockRestore();
  });

  it('throws when reading a corrupted database file', () => {
    const db = new Database({
      location: tempDir,
      dbname: 'testdb',
      tables: ['users'],
    });

    fs.writeFileSync(path.join(tempDir, 'testdb.json'), '{ invalid json', 'utf8');

    expect(() => db.count('users')).toThrow(/Error reading database\./i);
  });
});
