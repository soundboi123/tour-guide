import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new Database(join(__dirname, '../routes.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
    CREATE TABLE IF NOT EXISTS routes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS route_monuments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id        INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
        monument_id     TEXT NOT NULL,
        monument_label  TEXT NOT NULL,
        monument_coord  TEXT NOT NULL,
        position        INTEGER NOT NULL
    );
`)

function withMonuments(row) {
    return {
        ...row,
        monuments: db
            .prepare('SELECT * FROM route_monuments WHERE route_id = ? ORDER BY position')
            .all(row.id),
    }
}

export function getAllRoutes() {
    return db.prepare('SELECT * FROM routes ORDER BY created_at DESC').all().map(withMonuments)
}

export function getRouteById(id) {
    const row = db.prepare('SELECT * FROM routes WHERE id = ?').get(id)
    return row ? withMonuments(row) : null
}

export function createRoute(name, monuments) {
    const insertRoute = db.prepare('INSERT INTO routes (name) VALUES (?)')
    const insertMonument = db.prepare(
        'INSERT INTO route_monuments (route_id, monument_id, monument_label, monument_coord, position) VALUES (?, ?, ?, ?, ?)',
    )

    const run = db.transaction(() => {
        const { lastInsertRowid: routeId } = insertRoute.run(name)
        monuments.forEach((m, i) => {
            insertMonument.run(routeId, m.id, m.label, m.coord, i)
        })
        return routeId
    })

    return getRouteById(run())
}

export function deleteRoute(id) {
    db.prepare('DELETE FROM routes WHERE id = ?').run(id)
}
