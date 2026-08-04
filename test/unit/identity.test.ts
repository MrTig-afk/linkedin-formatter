import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseGitConfig, initialsOf } from '../../src/lib/identity';

test('parseGitConfig reads name and email from the user section', () => {
  const text = [
    '[core]',
    '\tautocrlf = true',
    '[user]',
    '\tname = Kaushik',
    '\temail = kaushik@example.com',
    '[alias]',
    '\tst = status',
  ].join('\n');
  assert.deepEqual(parseGitConfig(text), {
    name: 'Kaushik',
    email: 'kaushik@example.com',
  });
});

test('parseGitConfig ignores name/email keys outside the user section', () => {
  const text = '[author]\nname = Wrong\n[user]\nemail = only@example.com';
  assert.deepEqual(parseGitConfig(text), { name: null, email: 'only@example.com' });
});

test('parseGitConfig first user value wins over later duplicates', () => {
  const text = '[user]\nname = First\n[user]\nname = Second';
  assert.equal(parseGitConfig(text).name, 'First');
});

test('parseGitConfig handles CRLF, spacing, and case-insensitive keys', () => {
  const text = '[USER]\r\n  Name   =   Spaced Out  \r\n  EMAIL=x@y.z\r\n';
  assert.deepEqual(parseGitConfig(text), { name: 'Spaced Out', email: 'x@y.z' });
});

test('parseGitConfig yields nulls on empty or malformed input', () => {
  assert.deepEqual(parseGitConfig(''), { name: null, email: null });
  assert.deepEqual(parseGitConfig('not a config at all'), { name: null, email: null });
  assert.deepEqual(parseGitConfig('[user]\nname = '), { name: null, email: null });
});

test('initialsOf takes the first letter of the first two words, uppercased', () => {
  assert.equal(initialsOf('Kaushik'), 'K');
  assert.equal(initialsOf('Ada Lovelace'), 'AL');
  assert.equal(initialsOf('grace brewster murray hopper'), 'GB');
});

test('initialsOf is code-point aware for non-ASCII names', () => {
  assert.equal(initialsOf('𝕂aushik'), '𝕂');
});
