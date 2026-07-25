import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { compile } from '../src/dbml';
import { describeContext } from '../src/editor/completion';
import { elementAtLine } from '../src/editor/editor';

/** Build a state from a doc where `|` marks the cursor. */
function at(source: string) {
  const pos = source.indexOf('|');
  const doc = source.replace('|', '');
  return { state: EditorState.create({ doc }), pos };
}

describe('completion context', () => {
  it('knows the top level', () => {
    const { state, pos } = at(`Table users { id int }\nTab|`);
    expect(describeContext(state, pos)).toMatchObject({ depth: 0, block: null });
  });

  it('knows it is inside a table body', () => {
    const { state, pos } = at(`Table users {\n  id in|\n}`);
    expect(describeContext(state, pos)).toMatchObject({
      block: 'table',
      blockName: 'users',
      inSettings: false,
    });
  });

  it('knows it is inside a settings list', () => {
    const { state, pos } = at(`Table users {\n  id int [pk, no|\n}`);
    expect(describeContext(state, pos).inSettings).toBe(true);
  });

  it('closes the settings list at the bracket', () => {
    const { state, pos } = at(`Table users {\n  id int [pk] |\n}`);
    expect(describeContext(state, pos).inSettings).toBe(false);
  });

  it('reports the parent table from inside an indexes block', () => {
    const { state, pos } = at(`Table orders {\n  id int\n  indexes {\n    i|\n  }\n}`);
    expect(describeContext(state, pos)).toMatchObject({
      block: 'table',
      blockName: 'orders',
      inIndexes: true,
    });
  });

  it('ignores braces inside strings and comments', () => {
    const { state, pos } = at(`Table a {\n  id int [note: '} not a brace']\n}\n\n|`);
    expect(describeContext(state, pos).depth).toBe(0);
  });

  it('handles quoted block names', () => {
    const { state, pos } = at(`Table "order items" {\n  id |\n}`);
    expect(describeContext(state, pos)).toMatchObject({
      block: 'table',
      blockName: 'order items',
    });
  });
});

describe('code to diagram mapping', () => {
  const source = `Table users {
  id int [pk]
  email varchar
}

Enum status {
  live
}

Ref: users.id < users.id`;

  const { schema } = compile(source);

  it('maps a line inside a table to that table', () => {
    expect(elementAtLine(schema, 1)).toBe('public.users');
  });

  it('maps a column line to that column', () => {
    expect(elementAtLine(schema, 2)).toBe('public.users.id');
    expect(elementAtLine(schema, 3)).toBe('public.users.email');
  });

  it('maps an enum line to the enum', () => {
    expect(elementAtLine(schema, 7)).toBe('public.status');
  });

  it('maps a relationship line to one of its tables', () => {
    expect(elementAtLine(schema, 10)).toBe('public.users');
  });

  it('returns nothing for a blank line', () => {
    expect(elementAtLine(schema, 5)).toBeNull();
  });
});
