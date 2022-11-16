# Neutron DB

This is an attempt at creating a (sync) JSON db for electron using typescript.

## How to use

The DB is initialized with a "schema" :

```
interface Schema {
  tables: string[]; // names of the tables
  dbname: string; // name of the database used to create the JSON file
  oneIndexed?: boolean; // specify if the id of the objects should start from 1 or 0, by default the ids will start from 0
  location?: string; // path to the database location
}
```

The objects have to inherit from `DbObject` to expose an id

```
interface DbObject {
  id: number;
}
```

To use the database just instantiate the class `Database` by providing a schema.

The exposed primitives are :

```
insert<T extends DbObject>(row: T, tablename: string): T
update<T extends DbObject>(row: T, tablename: string): T | null
getAll<T extends DbObject>(tablename: string): T[]
get<T extends DbObject>(id: number, tablename: string): T | null
delete(id: number, tablename: string): void

clear(tablename: string): void
count(tablename: string): number
```

---

Heavily inspired by [electron-db](https://github.com/alexiusacademia/electron-db)
