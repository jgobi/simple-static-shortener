const { readFileSync, appendFileSync, writeFileSync, renameSync, unlinkSync } = require("fs");

function openDB(file) {
    let raw = ''
    try {
        raw = readFileSync(file, { encoding: 'utf-8' })
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw new Error('Could not open file')
        }
    }
    const events = raw.split('\n')

    const data = {};

    for (let i = 0; i < events.length; i++) {
        const event = events[i]
        if (!event) continue

        const [timestamp, key, ...rem] = event.split('\t')
        const rawRow = rem.join('\t').trim()
        const row = rawRow ? JSON.parse(rawRow) : undefined

        if (!timestamp || !key) throw new Error(`Invalid data at line ${i + 1}:\n\t${event}`)

        data[key] = { updatedAt: timestamp, value: row }
    }

    return {
        put(key, value, replace = true) {
            if (value === undefined) return del(key)
            if (this.get(key) && !replace) throw new Error(`Key "${key}" already exists.`)

            const json = JSON.stringify(value)
            if (data[key] && json === JSON.stringify(data[key].value)) return value

            data[key] = { updatedAt: Date.now(), value }

            appendFileSync(file, `${data[key].updatedAt}\t${key}\t${json}\n`, { encoding: 'utf-8' })

            return value
        },

        del(key) {
            if (!data[key] || data[key].value === undefined) return

            data[key] = { updatedAt: Date.now(), value: undefined }

            appendFileSync(file, `${data[key].updatedAt}\t${key}\n`, { encoding: 'utf-8' })
        },

        get(key, includeDeleted = false) {
            const row = data[key]
            if (!row || (row.value === undefined && !includeDeleted)) return undefined

            return row
        },

        list(includeDeleted = false) {
            const rows = Object.entries(data)
            return includeDeleted ? rows : rows.filter(([_, v]) => v.value !== undefined)
        },

        vacuum() {
            const raw = this.list()
                .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
                .map(v => `${v[1].updatedAt}\t${v[0]}\t${JSON.stringify(v[1].value)}\n`)
                .join('')

            renameSync(file, file + '.bkp');
            writeFileSync(file, raw, { encoding: 'utf-8' })
            unlinkSync(file + '.bkp')

            const allKeys = Object.keys(data)
            for (let k of allKeys) {
                if (data[k].value === undefined) delete data[k]
            }
        }
    }
}

module.exports = {
    openDB
}