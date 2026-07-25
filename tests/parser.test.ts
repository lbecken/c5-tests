import { describe, expect, it } from 'vitest';
import { compile } from '../src/dbml';
import { tokenize, TokenKind } from '../src/dbml/lexer';

/** Compile and assert there were no errors, returning the schema. */
function ok(source: string) {
  const result = compile(source);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  expect(errors.map((e) => e.message)).toEqual([]);
  return result.schema;
}

describe('lexer', () => {
  it('skips line and block comments', () => {
    const tokens = tokenize(`// leading\n/* block\n comment */ Table`);
    expect(tokens.map((t) => t.kind)).toEqual([TokenKind.Identifier, TokenKind.EOF]);
  });

  it('reads triple-quoted notes and strips shared indentation', () => {
    const [token] = tokenize(`'''\n    line one\n    line two\n    '''`);
    expect(token.value).toBe('line one\nline two');
    expect(token.multiline).toBe(true);
  });

  it('distinguishes the one-to-one operator from a negative number', () => {
    expect(tokenize('-').map((t) => t.kind)[0]).toBe(TokenKind.Relation);
    expect(tokenize('-42')[0]).toMatchObject({ kind: TokenKind.Number, value: '-42' });
  });

  it('tracks which tokens begin a line', () => {
    const tokens = tokenize('id integer\nname varchar');
    expect(tokens.map((t) => t.startsLine)).toEqual([true, false, true, false, false]);
  });

  it('rejects malformed colours', () => {
    expect(() => tokenize('#12')).toThrow(/Invalid colour/);
  });
});

describe('tables', () => {
  it('parses columns, settings and defaults', () => {
    const schema = ok(`
      Table users as U [headercolor: #3498db, note: 'people'] {
        id integer [pk, increment]
        username varchar(255) [not null, unique, note: 'unique handle']
        role varchar [default: 'guest']
        created_at timestamp [default: \`now()\`]
        score decimal(10,2) [default: -1]
        active boolean [default: true]
      }
    `);
    const [table] = schema.tables;
    expect(table.id).toBe('public.users');
    expect(table.alias).toBe('U');
    expect(table.headerColor).toBe('#3498db');
    expect(table.note).toBe('people');
    expect(table.columns.map((c) => c.type)).toEqual([
      'integer',
      'varchar(255)',
      'varchar',
      'timestamp',
      'decimal(10,2)',
      'boolean',
    ]);
    expect(table.columns[0]).toMatchObject({ pk: true, increment: true });
    expect(table.columns[1]).toMatchObject({ notNull: true, unique: true, note: 'unique handle' });
    expect(table.columns[2].default).toEqual({ type: 'string', value: 'guest' });
    expect(table.columns[3].default).toEqual({ type: 'expression', value: 'now()' });
    expect(table.columns[4].default).toEqual({ type: 'number', value: '-1' });
    expect(table.columns[5].default).toEqual({ type: 'boolean', value: 'true' });
  });

  it('supports schemas, quoted names and array types', () => {
    const schema = ok(`
      Table ecommerce."order items" {
        "line total" decimal
        tags text[]
      }
    `);
    expect(schema.tables[0].id).toBe('ecommerce.order items');
    expect(schema.tables[0].columns.map((c) => c.name)).toEqual(['line total', 'tags']);
    expect(schema.tables[0].columns[1].type).toBe('text[]');
  });

  it('parses table notes in both block and inline form', () => {
    const schema = ok(`
      Table a { id int
        Note: 'inline'
      }
      Table b { id int
        Note { 'block' }
      }
    `);
    expect(schema.tables.map((t) => t.note)).toEqual(['inline', 'block']);
  });

  it('parses indexes', () => {
    const schema = ok(`
      Table bookings {
        id int
        country varchar
        booking_date date
        indexes {
          (id, country) [pk]
          booking_date [name: 'idx_date', unique]
          \`id*2\` [type: hash]
        }
      }
    `);
    const [table] = schema.tables;
    expect(table.indexes).toHaveLength(3);
    expect(table.indexes[0]).toMatchObject({ pk: true });
    expect(table.indexes[0].columns.map((c) => c.value)).toEqual(['id', 'country']);
    expect(table.indexes[1]).toMatchObject({ name: 'idx_date', unique: true });
    expect(table.indexes[2].columns[0]).toEqual({ kind: 'expression', value: 'id*2' });
  });

  it('reports a column with no type', () => {
    const { diagnostics } = compile(`Table t {\n  id\n}`);
    expect(diagnostics.some((d) => /missing a type/.test(d.message))).toBe(true);
  });
});

describe('relationships', () => {
  const base = `
    Table users { id integer [pk] }
    Table posts { id integer [pk] user_id integer }
  `;

  it('maps every operator to the right cardinalities', () => {
    const cases: [string, string, string][] = [
      ['<', '1', '*'],
      ['>', '*', '1'],
      ['-', '1', '1'],
      ['<>', '*', '*'],
    ];
    for (const [operator, left, right] of cases) {
      const schema = ok(`${base}\nRef: users.id ${operator} posts.user_id`);
      expect(schema.refs[0].endpoints.map((e) => e.relation)).toEqual([left, right]);
    }
  });

  it('parses inline refs on columns', () => {
    const schema = ok(`
      Table users { id integer [pk] }
      Table posts { user_id integer [ref: > users.id] }
    `);
    expect(schema.refs).toHaveLength(1);
    expect(schema.refs[0].endpoints[0]).toMatchObject({
      tableId: 'public.posts',
      columnNames: ['user_id'],
      relation: '*',
    });
    expect(schema.refs[0].endpoints[1]).toMatchObject({
      tableId: 'public.users',
      relation: '1',
    });
  });

  it('parses named refs, block form and referential actions', () => {
    const schema = ok(`
      ${base}
      Ref author_fk: posts.user_id > users.id [delete: cascade, update: no action]
      Ref { posts.id - users.id }
    `);
    expect(schema.refs[0]).toMatchObject({
      name: 'author_fk',
      onDelete: 'cascade',
      onUpdate: 'no action',
    });
    expect(schema.refs[1].endpoints.map((e) => e.relation)).toEqual(['1', '1']);
  });

  it('resolves composite endpoints and aliases', () => {
    const schema = ok(`
      Table merchants as M { id int country_code int }
      Table merchant_periods { merchant_id int country_code int }
      Ref: merchant_periods.(merchant_id, country_code) > M.(id, country_code)
    `);
    expect(schema.refs[0].endpoints[1]).toMatchObject({
      tableId: 'public.merchants',
      columnNames: ['id', 'country_code'],
    });
  });

  it('reports unknown tables and columns', () => {
    const { diagnostics } = compile(`${base}\nRef: users.id < comments.user_id`);
    expect(diagnostics[0].message).toMatch(/Unknown table "comments"/);

    const missingColumn = compile(`${base}\nRef: users.nope < posts.user_id`);
    expect(missingColumn.diagnostics[0].message).toMatch(/no column "nope"/);
  });

  it('rejects mismatched composite arity', () => {
    const { diagnostics } = compile(`
      Table a { x int y int }
      Table b { x int }
      Ref: a.(x, y) > b.(x)
    `);
    expect(diagnostics[0].message).toMatch(/same number of columns/);
  });
});

describe('enums, groups, notes, partials', () => {
  it('links a column type to a declared enum', () => {
    const schema = ok(`
      Enum job_status {
        created [note: 'queued']
        running
        done
      }
      Table jobs { status job_status }
    `);
    expect(schema.enums[0].values.map((v) => v.name)).toEqual(['created', 'running', 'done']);
    expect(schema.enums[0].values[0].note).toBe('queued');
    expect(schema.tables[0].columns[0].enumId).toBe('public.job_status');
  });

  it('assigns tables to groups', () => {
    const schema = ok(`
      Table a { id int }
      Table b { id int }
      TableGroup core [color: #345] {
        a
        b
        Note: 'the core'
      }
    `);
    expect(schema.groups[0]).toMatchObject({ name: 'core', color: '#345', note: 'the core' });
    expect(schema.groups[0].tableIds).toEqual(['public.a', 'public.b']);
    expect(schema.tables[0].groupId).toBe('group-core');
  });

  it('reads sticky notes', () => {
    const schema = ok(`Note reminder [color: #fff] { 'ship it' }`);
    expect(schema.stickyNotes[0]).toMatchObject({ name: 'reminder', content: 'ship it' });
  });

  it('injects table partials', () => {
    const schema = ok(`
      TablePartial timestamps [headercolor: #aaa] {
        created_at timestamp
        updated_at timestamp
      }
      Table users {
        ~timestamps
        id int [pk]
      }
    `);
    const [table] = schema.tables;
    expect(table.columns.map((c) => c.name)).toEqual(['created_at', 'updated_at', 'id']);
    expect(table.columns[0].fromPartial).toBe('timestamps');
    expect(table.headerColor).toBe('#aaa');
  });

  it('reads the project block', () => {
    const schema = ok(`
      Project shop {
        database_type: 'PostgreSQL'
        Note: 'demo'
      }
    `);
    expect(schema.project).toMatchObject({ name: 'shop', databaseType: 'PostgreSQL', note: 'demo' });
  });
});

describe('error tolerance', () => {
  it('contains a bad column to its own line', () => {
    const { schema, diagnostics } = compile(`
      Table half_typed {
        id
        email varchar
      }
      Table fine { id int }
    `);
    expect(diagnostics.some((d) => /missing a type/.test(d.message))).toBe(true);
    expect(schema.tables.map((t) => t.name)).toEqual(['half_typed', 'fine']);
    expect(schema.tables[0].columns.map((c) => c.name)).toEqual(['email']);
  });

  it('keeps finished tables when the last block is still open', () => {
    const { schema, diagnostics } = compile(`
      Table users { id int }
      Table posts {
    `);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(schema.tables.map((t) => t.name)).toEqual(['users']);
  });

  it('flags duplicates', () => {
    const dupTable = compile(`Table a { id int }\nTable a { id int }`);
    expect(dupTable.diagnostics[0].message).toMatch(/already defined/);

    const dupColumn = compile(`Table a { id int\n id int }`);
    expect(dupColumn.diagnostics[0].message).toMatch(/Column "id" is already defined/);
  });

  it('warns about unknown settings without dropping the column', () => {
    const { schema, diagnostics } = compile(`Table a { id int [nonsense] }`);
    expect(diagnostics[0]).toMatchObject({ severity: 'warning' });
    expect(schema.tables[0].columns).toHaveLength(1);
  });

  it('points diagnostics at the right line', () => {
    const { diagnostics } = compile(`Table a { id int }\n\nRef: a.id < nope.id`);
    expect(diagnostics[0].span.start.line).toBe(3);
  });
});
