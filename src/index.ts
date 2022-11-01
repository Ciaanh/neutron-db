import { CreationResult, DbObject } from './types';

import path = require('path');
import fs = require('fs');
import os = require('os');

let pack = null;
try {
  pack = require('../../package.json');
} catch (e) {}

const platform = os.platform();

let appName = '';
if (pack !== null) {
  appName = pack.name;
}

let userData: string = '';

if (platform === 'win32') {
  userData = path.join(process.env.APPDATA ?? '', appName);
} else if (platform === 'darwin') {
  userData = path.join(process.env.HOME ?? '', 'Library', 'Application Support', appName);
} else {
  userData = path.join('var', 'local', appName);
}

function getDbname(tableName: string, location?: string) {
  return location ? path.join(location, tableName + '.json') : path.join(userData, tableName + '.json');
}

function createTable(tableName: string, location?: string): CreationResult {
  const dbname = getDbname(tableName, location);
  const exists = fs.existsSync(dbname);

  if (exists) {
    return {
      created: false,
      message: tableName + '.json already exists!',
    };
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = {};
      obj[tableName] = [];
      const json = JSON.stringify(obj, null, 2);
      fs.writeFileSync(dbname, json);
      return {
        created: true,
        message: 'Success!',
      };
    } catch (err: any) {
      return {
        created: false,
        message: err.toString(),
      };
    }
  }
}

function valid(tableName: string, location?: string) {
  const dbname = getDbname(tableName, location);

  const content = fs.readFileSync(dbname, 'utf-8');
  try {
    JSON.parse(content);
  } catch (e) {
    return false;
  }
  return true;
}

function getMaxId<T extends DbObject>(table: T[]): number | null {
  return table.length > 0 ? Math.max(...table.map((c) => c.id)) : null;
}

function insertTableContent<T extends DbObject>(tableName: string, row: T, location?: string): T {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  if (exists) {
    const database = JSON.parse(fs.readFileSync(dbname).toString()) as { [key: string]: T[] };
    const table = database[tableName];

    if (row.id === undefined || row.id === null || row.id === -1) {
      const maxId = getMaxId(table);
      row.id = maxId === null ? 0 : maxId + 1;
    }

    table.push(row);

    try {
      const json = JSON.stringify(table, null, 2);
      fs.writeFileSync(dbname, json);

      return row;
    } catch (err: any) {
      throw new Error(`Error writing object. ${err.toString()}`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function getAll<T extends DbObject>(tableName: string, location?: string): T[] {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  if (exists) {
    try {
      const database = JSON.parse(fs.readFileSync(dbname).toString()) as { [key: string]: T[] };
      const table = database[tableName];

      return table;
    } catch (err: any) {
      throw new Error(`Error reading table. ${err.toString()}`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function getField<T extends DbObject>(tableName: string, key: string, location?: string): T[] {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  if (exists) {
    const database = JSON.parse(fs.readFileSync(dbname).toString()) as { [key: string]: T[] };
    const table = database[tableName];

    const rows: T[] = [];

    for (const iterator of table) {
      if (iterator.hasOwnProperty(key)) {
        rows.push(iterator);
      }
    }

    return rows;
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function clearTable(tableName: string, location?: string): void {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  if (exists) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = {};
    obj[tableName] = [];

    // Write the object to json file
    try {
      fs.writeFileSync(dbname, JSON.stringify(obj, null, 2));
      return;
    } catch (err: any) {
      throw new Error(`Error writing object. ${err.toString()}`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function count(tableName: string, location?: string) {
  const results = getAll(tableName, location);
  if (results) {
    return results.length;
  }
  return 0;
}

function getRows<T extends DbObject>(tableName: string, where: any, location?: string): T[] {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  let whereKeys;
  if (typeof where === 'object') {
    whereKeys = Object.keys(where);
    if (whereKeys.length === 0) {
      throw new Error('No conditions passed to the WHERE clause.');
    }
  } else {
    throw new Error('WHERE clause must be an object.');
  }

  if (exists) {
    try {
      const database = JSON.parse(fs.readFileSync(dbname).toString()) as { [key: string]: T[] };
      const table = database[tableName];

      const objs = [];

      for (let i = 0; i < table.length; i++) {
        let matched = 0;
        for (let j = 0; j < whereKeys.length; j++) {
          if (table[i].hasOwnProperty(whereKeys[j])) {
            if ((table[i] as any)[whereKeys[j]] === where[whereKeys[j]]) {
              matched++;
            }
          }
        }

        if (matched === whereKeys.length) {
          objs.push(table[i]);
        }
      }

      return objs;
    } catch (err: any) {
      throw new Error(`Error reading table. ${err.toString()}`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function updateRow<T extends DbObject>(tableName: string, where: any, set: T, location?: string) {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  let whereKeys;
  if (typeof where === 'object') {
    whereKeys = Object.keys(where);
    if (whereKeys.length === 0) {
      throw new Error('No conditions passed to the WHERE clause.');
    }
  } else {
    throw new Error('WHERE clause must be an object.');
  }

  const setKeys = Object.keys(set);

  if (exists) {
    try {
      const database = JSON.parse(fs.readFileSync(dbname, null).toString()) as { [key: string]: T[] };
      const table = database[tableName];

      let matched = 0;
      let matchedIndex = 0;

      for (var i = 0; i < table.length; i++) {
        for (var j = 0; j < whereKeys.length; j++) {
          if (table[i].hasOwnProperty(whereKeys[j])) {
            if ((table[i] as any)[whereKeys[j]] === where[whereKeys[j]]) {
              matched++;
              matchedIndex = i;
            }
          }
        }
      }

      if (matched === whereKeys.length) {
        try {
          for (var k = 0; k < setKeys.length; k++) {
            (table[matchedIndex] as any)[setKeys[k]] = (set as any)[setKeys[k]];
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const obj: any = {};
          obj[tableName] = table;

          try {
            const json = JSON.stringify(obj, null, 2);
            fs.writeFileSync(dbname, json);

            return table[matchedIndex];
          } catch (err: any) {
            throw new Error(`Error writing object. ${err.toString()}`);
          }
        } catch (err: any) {
          throw new Error(`Error updating row. ${err.toString()}`);
        }
      }
      throw new Error(`No rows matched the WHERE clause.`);
    } catch (err: any) {
      throw new Error(`Error reading table. ${err.toString()}`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function search<T extends DbObject>(tableName: string, field: string, keyword: string, location?: string): T[] {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);

  if (exists) {
    const database = JSON.parse(fs.readFileSync(dbname).toString()) as { [key: string]: T[] };
    const table = database[tableName];

    if (table.length > 0) {
      const rows = [];

      for (const row of table) {
        if (row.hasOwnProperty(field)) {
          const value = (row as any)[field].toString().toLowerCase();
          const n = value.search(keyword.toString().toLowerCase());

          if (n !== -1) {
            rows.push(row);
          }
        }
      }

      return rows;
    } else {
      throw new Error(`Table "${tableName}" is empty.`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function deleteRow<T extends DbObject>(tableName: string, where: any, location?: string) {
  const dbname = getDbname(tableName, location);

  const exists = fs.existsSync(dbname);
  let whereKeys;
  if (typeof where === 'object') {
    whereKeys = Object.keys(where);
    if (whereKeys.length === 0) {
      throw new Error('No conditions passed to the WHERE clause.');
    }
  } else {
    throw new Error('WHERE clause must be an object.');
  }

  if (exists) {
    const database = JSON.parse(fs.readFileSync(dbname).toString()) as { [key: string]: T[] };
    const table = database[tableName];

    if (table.length > 0) {
      let matched = 0;
      let matchedIndices = [];

      for (let i = 0; i < table.length; i++) {
        // Iterate throught the rows
        for (var j = 0; j < whereKeys.length; j++) {
          // Test if there is a matched key with where clause and single row of table
          if (table[i].hasOwnProperty(whereKeys[j])) {
            if ((table[i] as any)[whereKeys[j]] === where[whereKeys[j]]) {
              matched++;
              matchedIndices.push(i);
            }
          }
        }
      }

      if (matchedIndices.length === 0) {
        return 0;
      }

      for (const indice of matchedIndices) {
        table.splice(indice, 1);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = {};
      obj[tableName] = table;

      // Write the object to json file
      try {
        const json = JSON.stringify(obj, null, 2);
        fs.writeFileSync(dbname, json);
        return;
      } catch (err: any) {
        throw new Error(`Error writing object. ${err.toString()}`);
      }
    } else {
      throw new Error(`Table "${tableName}" is empty.`);
    }
  }
  throw new Error(`Table/json file "${tableName}" doesn't exist!`);
}

function tableExists(tableName: string, location?: string) {
  const dbname = getDbname(tableName, location);

  return fs.existsSync(dbname);
}

const db = {
  createTable,
  insertTableContent,
  getAll,
  getRows,
  updateRow,
  search,
  deleteRow,
  valid,
  clearTable,
  getField,
  count,
  tableExists,
};

export default db;
